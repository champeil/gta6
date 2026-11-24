// Solara Bay — the entry point the bounty runner executes (Node 22, standard library only).
//
// The game itself is the sibling `game/` directory: static files a desktop browser opens offline,
// an index.html plus ES modules, no library, no build step, no network request. This program packs
// that directory for the judge: it copies game/ and screenshots/ beside this file into /output, then
// writes /output/dossier.json through the vendored make.fun library, so one manifest describes the
// game, its source tree and its four renders.
//
// The box, in short: a top-down open-world crime story across six quarters of a fictional
// sun-bleached bay. Walk, run, drive, steal anything with wheels; take seven story jobs for two
// fixers, run Sun Cab fares and pick up courier parcels between them; survive a five-star response
// that chases, rams, dismounts and cuffs. There is a compressed day/night clock with sodium pools and
// headlight cones, burning wrecks, a save file in localStorage, a pause sheet with a full city map,
// and a deterministic ?shot= mode that poses the four screenshots from a fixed seed.
//
//   node serve.ts                        then open http://localhost:8080
//   ?shot=cover|street|mission|night     a still frame instead of the loop (how the stills were made)
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps below are the scorer's own (reference/gate.json). Only text_max_bytes shapes the bytes
// the dossier carries; the rest are refusals, so passing them means this program fails exactly where
// the scorer would: 4 screenshots at most, none over 256 KiB; at most 993 entries under game/ and
// 48 MiB of them; no path under game/ longer than 1000 bytes (game/ counts beside /output's own
// 1000-entry cap, with screenshots/ and its four files and dossier.json).
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

const shotsOut = join(out, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
const shotsIn = join(here, 'screenshots');
if (existsSync(shotsIn)) cpSync(shotsIn, shotsOut, { recursive: true });

const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);
