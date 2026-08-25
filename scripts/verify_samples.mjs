/**
 * Confirm MusyngKite sample packs are on disk with MIDI.js filenames.
 *
 * Usage: node scripts/verify_samples.mjs
 */

import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { midiToSampleName, SAMPLE_PACKS } from "../js/sample-bank.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = [...new Set(Object.values(SAMPLE_PACKS))];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(midiToSampleName(21) === "A0", "A0");
assert(midiToSampleName(60) === "C4", "C4");
assert(midiToSampleName(70) === "Bb4", "Bb4");
assert(midiToSampleName(108) === "C8", "C8");

for (const pack of PACKS) {
  const dir = join(ROOT, "assets", "samples", pack);
  const files = await readdir(dir);
  const mp3 = files.filter((name) => name.endsWith(".mp3"));
  assert(mp3.length === 88, `${pack}: expected 88 mp3s, got ${mp3.length}`);

  for (let midi = 21; midi <= 108; midi++) {
    const name = `${midiToSampleName(midi)}.mp3`;
    assert(mp3.includes(name), `${pack} missing ${name}`);
    const info = await stat(join(dir, name));
    assert(info.size > 1000, `${pack}/${name} too small (${info.size}b)`);
  }
}

console.log(`ok  ${PACKS.length} packs × 88 notes`);
