# Simply Create Playlists CLI

Create a Spotify playlist from a plain text list of `Artist - Album`.

This CLI tool:

- Authenticates with Spotify using Authorization Code + PKCE
- Creates a playlist
- Adds all tracks from each album in your list
- Supports `overrides.json` for tricky matches
- Writes `misses.json` after each run

Safe by default. Nothing is deleted or overwritten.

---

## Requirements

- Node.js 18 or newer
- A Spotify Developer application (Client ID required)
- A Redirect URI configured in your Spotify app:

  http://127.0.0.1:5173/callback

---

## Install

### Run with npx (recommended)

npx simply-create-playlists-cli playlist.txt --name "My Playlist"

### Install globally

npm install -g simply-create-playlists-cli  
simply-create-playlists-cli playlist.txt --name "My Playlist"

---

## Setup

Create a `.env` file in your working directory (or set environment variables):

SPOTIFY_CLIENT_ID=YOUR_CLIENT_ID  
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/callback

Make sure the same Redirect URI is added in the Spotify Developer Dashboard.

---

## Input format

Create a text file (default: `playlist.txt`) with one album per line:

Mark Morrison - Return Of The Mack
Miley Cyrus - Party In The U.S.A.
Montell Jordan - This Is How We Do It

Rules:

- Format must be `Artist - Album`
- Lines starting with `#` are ignored

---

## Overrides

Some albums are ambiguous or hard to match automatically.  
You can force matches using an `overrides.json` file.

Example `overrides.json`:

{
"American Football - American Football": "spotify:album:70OkRXiiwdTCtZ9YiPBzPp",
"EXAMPLE ARTIST - EXAMPLE ALBUM": "spotify:album:ALBUM_ID"
}

Values may be:

- spotify:album:<id>
- or just <id>

Overrides always take priority over search results.

---

## Usage

simply-create-playlists-cli [listPath] --name "Playlist Name" [options]

### Options

--name <string>  
Set the playlist name

--public  
Create a public playlist (default is private)

--dry-run  
Resolve albums and show what would happen without creating a playlist

---

## Examples

Create a private playlist:

simply-create-playlists-cli playlist.txt --name "Top 100 Albums of All Time"

Create a public playlist:

simply-create-playlists-cli playlist.txt --name "Top 100 Albums of All Time" --public

Dry run (no changes made):

simply-create-playlists-cli playlist.txt --dry-run

---

## Output

After each run, a `misses.json` file is written containing any albums that could not be resolved.

---

## Notes

- A new playlist is created on every run
- Existing playlists are never modified
- This tool is intended for personal use and small batch playlist creation

---

## License

MIT
