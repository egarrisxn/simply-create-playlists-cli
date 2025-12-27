import "dotenv/config";
import express, { type Request, type Response } from "express";
import crypto from "crypto";
import open from "open";
import fs from "fs";

/* -------------------- config -------------------- */

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI!;
if (!CLIENT_ID || !REDIRECT_URI) {
  throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI in .env");
}

const SCOPES = ["playlist-modify-private", "playlist-modify-public"] as const;

/* -------------------- types -------------------- */

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type AlbumTracksPage = {
  items: Array<{ uri: string }>;
  next: string | null;
};

type SearchAlbumResult = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  uri: string;
};

type SpotifySearchAlbumsResponse = {
  albums: {
    items: SearchAlbumResult[];
  };
};

type RunOptions = {
  listPath: string;
  playlistName: string;
  isPublic: boolean;
  dryRun?: boolean;
  overridesPath?: string;
  missesPath?: string;
  port?: number;
};

/* -------------------- utils -------------------- */

function base64Url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(v: string) {
  return crypto.createHash("sha256").update(v).digest();
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/’/g, "'")
    .replace(/[^a-z0-9\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keyFor(artist: string, album: string) {
  return `${artist} - ${album}`.trim();
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!fs.existsSync(path)) return fallback;
    return JSON.parse(fs.readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function albumIdFromOverride(v: string) {
  const m = v.match(/^spotify:album:(.+)$/);
  return m ? m[1] : v;
}

/* -------------------- spotify api -------------------- */

async function spotifyFetch<T>(
  url: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Spotify API error ${res.status}: ${txt}`);
  }

  return (await res.json()) as T;
}

async function getMe(token: string) {
  return spotifyFetch<{ id: string }>("https://api.spotify.com/v1/me", token);
}

async function createPlaylist(
  token: string,
  userId: string,
  name: string,
  isPublic: boolean,
  description: string
) {
  return spotifyFetch<{ id: string; external_urls: { spotify: string } }>(
    `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        public: isPublic,
        description,
      }),
    }
  );
}

async function searchAlbum(token: string, artist: string, album: string) {
  const targetA = normalize(artist);
  const targetB = normalize(album);

  // 1) strict query
  const strictQ = `album:${album} artist:${artist}`;
  const strictUrl =
    `https://api.spotify.com/v1/search?type=album&limit=10&q=` +
    encodeURIComponent(strictQ);

  const strict = await spotifyFetch<SpotifySearchAlbumsResponse>(
    strictUrl,
    token
  );

  const strictBest =
    strict.albums.items.find(
      (it) =>
        normalize(it.name) === targetB &&
        normalize(it.artists[0]?.name || "") === targetA
    ) ||
    strict.albums.items.find((it) => normalize(it.name) === targetB) ||
    null;

  if (strictBest) return strictBest;

  // 2) fallback: free text query
  const looseQ = `${artist} ${album}`;
  const looseUrl =
    `https://api.spotify.com/v1/search?type=album&limit=10&q=` +
    encodeURIComponent(looseQ);

  const loose = await spotifyFetch<SpotifySearchAlbumsResponse>(
    looseUrl,
    token
  );

  const sameArtist = loose.albums.items.filter(
    (it) => normalize(it.artists[0]?.name || "") === targetA
  );

  const pool = sameArtist.length ? sameArtist : loose.albums.items;

  const contains =
    pool.find((it) => normalize(it.name).includes(targetB)) ||
    pool.find((it) => targetB.includes(normalize(it.name)));

  return contains || pool[0] || null;
}

async function getAlbumTracks(token: string, albumId: string) {
  const uris: string[] = [];
  let next:
    | string
    | null = `https://api.spotify.com/v1/albums/${encodeURIComponent(
    albumId
  )}/tracks?limit=50`;

  while (next) {
    const page: AlbumTracksPage = await spotifyFetch<AlbumTracksPage>(
      next,
      token
    );
    uris.push(...page.items.map((t) => t.uri));
    next = page.next;
  }

  return uris;
}

async function addTracks(token: string, playlistId: string, uris: string[]) {
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await spotifyFetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(
        playlistId
      )}/tracks`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ uris: chunk }),
      }
    );
  }
}

/* -------------------- list parsing -------------------- */

function parseList(path: string) {
  if (!fs.existsSync(path)) {
    throw new Error(`List file not found: ${path}`);
  }

  return fs
    .readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l: string) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("#"))
    .map((l) => {
      const [artist, ...rest] = l.split(" - ");
      return { artist: artist?.trim() ?? "", album: rest.join(" - ").trim() };
    });
}

/* -------------------- exported runner -------------------- */

export async function run(opts: RunOptions) {
  const {
    listPath,
    playlistName,
    isPublic,
    dryRun = false,
    overridesPath = "overrides.json",
    missesPath = "misses.json",
    port = 5173,
  } = opts;

  const entries = parseList(listPath);
  const overrides = readJson<Record<string, string>>(overridesPath, {});
  const misses: Array<{ artist: string; album: string }> = [];

  // ---- PKCE auth mini-server ----
  const app = express();

  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(sha256(verifier));
  const state = base64Url(crypto.randomBytes(16));

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(" "),
      state,
      code_challenge_method: "S256",
      code_challenge: challenge,
    }).toString();

  const server = app.listen(port, () => {
    console.log(`Auth server running on http://127.0.0.1:${port}`);
    console.log("Opening Spotify authorization in your browser...");
    void open(authUrl);
  });

  app.get("/callback", async (req: Request, res: Response) => {
    try {
      const code = String(req.query.code || "");
      const returnedState = String(req.query.state || "");
      if (!code) throw new Error("Missing code");
      if (returnedState !== state) throw new Error("State mismatch");

      const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
      }

      const tokens = (await tokenRes.json()) as TokenResponse;

      res.send(
        "✅ Authorized. You can close this tab and go back to your terminal."
      );
      server.close();

      let playlistId: string | null = null;
      let playlistUrl: string | null = null;

      // ---- Dry run: do not create playlist or add tracks ----
      if (dryRun) {
        console.log(
          "\nDRY RUN enabled: will not create playlist or add tracks.\n"
        );
      } else {
        const me = await getMe(tokens.access_token);
        const created = await createPlaylist(
          tokens.access_token,
          me.id,
          playlistName,
          isPublic,
          `Built from ${listPath} (album list → playlist)`
        );

        playlistId = created.id;
        playlistUrl = created.external_urls.spotify;

        console.log(`\nCreated playlist: ${playlistUrl}\n`);
      }

      for (let i = 0; i < entries.length; i++) {
        const { artist, album } = entries[i];
        const key = keyFor(artist, album);

        if (!artist || !album) {
          console.log(
            `[${i + 1}/${entries.length}] ${key} ... SKIP (malformed)`
          );
          misses.push({ artist, album });
          continue;
        }

        process.stdout.write(`[${i + 1}/${entries.length}] ${key} ... `);

        // resolve album id (override > search)
        let albumId: string | null = null;

        const override = overrides[key];
        if (override) {
          albumId = albumIdFromOverride(override);
          process.stdout.write("OVERRIDE ");
        } else {
          const found = await searchAlbum(tokens.access_token, artist, album);
          if (!found) {
            console.log("MISS");
            misses.push({ artist, album });
            continue;
          }
          albumId = found.id;
        }

        if (!albumId) {
          console.log("MISS");
          misses.push({ artist, album });
          continue;
        }

        const trackUris = await getAlbumTracks(tokens.access_token, albumId);

        if (dryRun) {
          console.log(`WOULD ADD (${trackUris.length} tracks)`);
          continue;
        }

        // Non-dry-run requires a created playlist
        if (!playlistId) {
          console.log("ERROR (no playlistId)");
          misses.push({ artist, album });
          continue;
        }

        await addTracks(tokens.access_token, playlistId, trackUris);
        console.log(`OK (${trackUris.length} tracks)`);
      }

      writeJson(missesPath, {
        generatedAt: new Date().toISOString(),
        playlistName,
        listPath,
        dryRun,
        misses,
      });

      console.log("\nDone.");
    } catch (e: any) {
      console.error(e?.message || e);
      try {
        res.status(500).send("❌ Error. Check terminal logs.");
      } catch {}
      server.close();
    }
  });
}

/* -------------------- direct run fallback -------------------- */
/**
 * Allows: tsx index.ts playlist.txt "Name" private
 * Keeps backward compatibility while you move to cli.ts.
 */

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const listPath = process.argv[2] || "playlist.txt";
  // default playlist name
  const playlistName = process.argv[3] || "Simply Created Playlist";
  const isPublic = (process.argv[4] || "private") === "public";
  await run({ listPath, playlistName, isPublic, dryRun: false });
}
