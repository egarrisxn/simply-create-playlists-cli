# Simply Create Playlists CLI

## Coming soon!

### Quick checklist: are you good to run it?

From root:

```bash
pnpm run build
node dist/cli.js list.txt --name "Test" --dry-run
```

The bin locally:

```bash
pnpm link --global
simply-create-playlists list.txt --name "Test" --dry-run
```

If that works, you’re 100% on track.

<hr>

### One important runtime note:

Your index.ts relies on:

```bash
SPOTIFY_CLIENT_ID
SPOTIFY_REDIRECT_URI
```

For a public npm CLI, you will need to create their own Spotify app and set env vars.

#### Two options:

- Keep it as is (power-user CLI)
- Add a one-time “init” command later that writes a config file (nicer UX)

This will work for now, though.
