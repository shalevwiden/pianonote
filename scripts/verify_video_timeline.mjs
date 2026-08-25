/**
 * Headless checks for counter-video timing helpers (no WebCodecs required).
 *
 * Usage: node scripts/verify_video_timeline.mjs
 */

import {
  buildNoteTimeline,
  sessionDurationMs,
  countAtTime,
  msSinceLastNote,
  videoContentStartMs,
  START_AT_NOTE_LEAD_MS,
  VIDEO_FPS,
  TAIL_MS,
} from "../js/video-export.js";

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
  noteOn(0, 60),
  noteOff(200, 60),
  noteOn(1000, 62),
  noteOff(1200, 62),
  // Pause gap with no notes between 1500–4000
  noteOn(4000, 64),
  noteOff(4200, 64),
];

const timeline = buildNoteTimeline(events);
assert(timeline.length === 3, `expected 3 note-ons, got ${timeline.length}`);
assert(timeline[0].count === 1 && timeline[0].timeMs === 0, "first count");
assert(timeline[1].count === 2 && timeline[1].timeMs === 1000, "second count");
assert(timeline[2].count === 3 && timeline[2].timeMs === 4000, "third count");

assert(countAtTime(timeline, 0) === 1, "count at first note");
assert(countAtTime(timeline, 999) === 1, "count in gap before second");
assert(countAtTime(timeline, 1000) === 2, "count at second note");
assert(countAtTime(timeline, 2500) === 2, "count frozen across pause");
assert(countAtTime(timeline, 4000) === 3, "count at third note");

assert(msSinceLastNote(timeline, 2500) === 1500, "ms since note across pause");
assert(msSinceLastNote(timeline, 4000) === 0, "ms since note at boundary");

const duration = sessionDurationMs(events, timeline);
assert(duration === 4200, `duration should be last event time, got ${duration}`);

const totalMs = duration + TAIL_MS;
const frames = Math.max(1, Math.ceil((totalMs / 1000) * VIDEO_FPS) + 1);
assert(frames > VIDEO_FPS, "frame count should cover more than one second");

// Zero-velocity note-on must not increment the counter.
const ghost = buildNoteTimeline([
  noteOn(0, 60, 0),
  { timeMs: 10, data: new Uint8Array([0x90, 61, 80]) },
]);
assert(ghost.length === 1 && ghost[0].count === 1, "ignore zero-velocity note-ons");

assert(videoContentStartMs(timeline, false) === 0, "no trim when switch is off");
assert(
  videoContentStartMs(timeline, true) === 0 - START_AT_NOTE_LEAD_MS,
  "lead-in can go slightly negative so the first note still jumps from 0"
);

const delayed = buildNoteTimeline([
  noteOn(2500, 60),
  noteOff(2700, 60),
  noteOn(4000, 62),
  noteOff(4200, 62),
]);
const startMs = videoContentStartMs(delayed, true);
assert(
  startMs === 2500 - START_AT_NOTE_LEAD_MS,
  `trim should begin just before first note, got ${startMs}`
);
assert(countAtTime(delayed, startMs) === 0, "first video frame is still 0");
assert(
  countAtTime(delayed, startMs + START_AT_NOTE_LEAD_MS) === 1,
  "count jumps to 1 at the first note"
);
assert(countAtTime(delayed, startMs + START_AT_NOTE_LEAD_MS / 2) === 0, "lead-in stays at 0");
assert(videoContentStartMs(delayed, false) === 0, "untrimmed video still starts at session 0");
assert(videoContentStartMs([], true) === 0, "no notes means no trim");

console.log(`OK  timeline ${timeline.length} notes, ${frames} frames @ ${VIDEO_FPS}fps`);
