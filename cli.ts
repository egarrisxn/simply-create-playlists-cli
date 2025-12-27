#!/usr/bin/env node
import { Command } from "commander";
import { run } from "./index.js";

const program = new Command();

program
  .name("simply-create-playlists-cli")
  .description("Create a Spotify playlist from an Artist - Album list")
  .argument("[listPath]", "Path to list file", "playlist.txt")
  .option("-n, --name <string>", "Playlist name", "Simply Created Playlist")
  .option("--public", "Create a public playlist", false)
  .option(
    "--dry-run",
    "Do not create playlist or add tracks, only print actions",
    false
  )
  .parse(process.argv);

const listPath = program.args[0] as string;
const opts = program.opts<{
  name: string;
  public: boolean;
  dryRun: boolean;
}>();

await run({
  listPath,
  playlistName: opts.name,
  isPublic: opts.public,
  dryRun: opts.dryRun,
});
