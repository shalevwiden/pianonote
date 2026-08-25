/**
 * Headless checks for MIDI parse + note pairing.
 *
 * Usage: node scripts/verify_midi_parser.mjs
 */

import { buildMidiFile } from "../js/midi-writer.js";
import { notesFromEvents, parseMidiFile } from "../js/midi-parser.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function noteOn(timeMs, note = 60, velocity = 100) {
  return { timeMs, data: new Uint8Array([0x90, note, velocity]) };
}

function noteOff(timeMs, note = 60) {
  return { timeMs, data: new Uint8Array([0x80, note, 0]) };
}

const events = [
  noteOn(500, 60),
  noteOff(800, 60),
  noteOn(1000, 64),
  noteOn(1000, 67),
  noteOff(1400, 64),
  noteOff(1400, 67),
];

const fromEvents = notesFromEvents(events);
assert(fromEvents.notes.length === 3, `expected 3 notes, got ${fromEvents.notes.length}`);
assert(fromEvents.notes[0].midi === 60 && fromEvents.notes[0].startMs === 500, "first note");
assert(fromEvents.notes[0].endMs === 800, "first note length");
assert(fromEvents.notes[1].midi === 64 && fromEvents.notes[1].startMs === 1000, "chord E");
assert(fromEvents.notes[2].midi === 67 && fromEvents.notes[2].startMs === 1000, "chord G");
assert(fromEvents.durationMs === 1400, `duration ${fromEvents.durationMs}`);

const ghost = notesFromEvents([
  noteOn(0, 60, 0),
  noteOn(10, 62, 90),
  noteOff(200, 62),
]);
assert(ghost.notes.length === 1 && ghost.notes[0].midi === 62, "zero-velocity note-on is off");

const bytes = buildMidiFile(events, { trimLeadingSilence: true, bpm: 120 });
const parsed = parseMidiFile(bytes);
assert(parsed.notes.length === 3, `round-trip notes ${parsed.notes.length}`);
assert(
  parsed.notes.every((note) => note.startMs >= 0),
  "trimmed file should not start before 0"
);
assert(Math.abs(parsed.notes[0].startMs) < 20, "first note near 0 after trim");
assert(parsed.notes.some((note) => note.midi === 60), "C4 survived the round trip");
assert(parsed.notes.some((note) => note.midi === 64), "E4 survived the round trip");
assert(parsed.durationMs > 800, `parsed duration ${parsed.durationMs}`);

console.log(
  `OK  events ${fromEvents.notes.length} notes, file ${parsed.notes.length} notes, ${Math.round(parsed.durationMs)}ms`
);
