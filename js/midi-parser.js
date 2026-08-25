/**
 * Standard MIDI File reader and note-span helpers.
 *
 * Enough of SMF format 0/1 for visualization: tempo map, note on/off (including
 * velocity-0 note-ons), running status. Sysex and most meta events are skipped.
 */

import { MIDI_HIGHEST, MIDI_LOWEST } from "./note-utils.js";

const DEFAULT_TEMPO_MICROS = 500_000; // 120 bpm
const MIN_NOTE_MS = 40;

function readU16(view, offset) {
  return view.getUint16(offset);
}

function readU32(view, offset) {
  return view.getUint32(offset);
}

function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

/**
 * @param {Uint8Array} data
 * @param {{ offset: number }} cursor
 */
function readVlq(data, cursor) {
  let value = 0;
  let guard = 0;
  while (guard++ < 8) {
    if (cursor.offset >= data.length) {
      throw new Error("Unexpected end of MIDI file while reading a length.");
    }
    const byte = data[cursor.offset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("Invalid MIDI variable-length quantity.");
}

function channelDataLength(status) {
  const high = status & 0xf0;
  if (high === 0xc0 || high === 0xd0) return 1;
  return 2;
}

/**
 * @param {Uint8Array} data
 * @returns {{
 *   format: number,
 *   ticksPerQuarter: number,
 *   tracks: Array<Array<{ tick: number, status: number, data: number[], metaType?: number, meta?: Uint8Array }>>
 * }}
 */
function parseSmf(data) {
  if (data.length < 14) throw new Error("This MIDI file is too small.");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const headerType = decodeText(data.subarray(0, 4));
  if (headerType !== "MThd") throw new Error("Not a Standard MIDI File (missing MThd).");

  const headerLen = readU32(view, 4);
  if (headerLen < 6) throw new Error("Invalid MIDI header.");
  const format = readU16(view, 8);
  const trackCount = readU16(view, 10);
  const division = readU16(view, 12);
  if (division & 0x8000) {
    throw new Error("SMPTE-timed MIDI files are not supported.");
  }
  const ticksPerQuarter = division;
  if (!ticksPerQuarter) throw new Error("MIDI file has no timing division.");

  const tracks = [];
  let offset = 8 + headerLen;

  for (let t = 0; t < trackCount; t++) {
    if (offset + 8 > data.length) break;
    const chunkType = decodeText(data.subarray(offset, offset + 4));
    const chunkLen = readU32(view, offset + 4);
    offset += 8;
    if (chunkType !== "MTrk") {
      offset += chunkLen;
      continue;
    }
    const end = Math.min(data.length, offset + chunkLen);
    tracks.push(parseTrack(data.subarray(offset, end)));
    offset = end;
  }

  if (!tracks.length) throw new Error("This MIDI file has no tracks.");
  return { format, ticksPerQuarter, tracks };
}

function parseTrack(bytes) {
  const events = [];
  const cursor = { offset: 0 };
  let tick = 0;
  let running = 0;

  while (cursor.offset < bytes.length) {
    tick += readVlq(bytes, cursor);
    if (cursor.offset >= bytes.length) break;

    let status = bytes[cursor.offset];
    if (status < 0x80) {
      if (!running) throw new Error("MIDI running status with no previous status.");
      status = running;
    } else {
      cursor.offset += 1;
      if (status < 0xf0) running = status;
    }

    if (status === 0xff) {
      if (cursor.offset >= bytes.length) break;
      const metaType = bytes[cursor.offset++];
      const len = readVlq(bytes, cursor);
      const meta = bytes.subarray(cursor.offset, cursor.offset + len);
      cursor.offset += len;
      events.push({ tick, status, data: [], metaType, meta: new Uint8Array(meta) });
      if (metaType === 0x2f) break;
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const len = readVlq(bytes, cursor);
      cursor.offset += len;
      continue;
    }

    const need = channelDataLength(status);
    const data = [];
    for (let i = 0; i < need; i++) {
      if (cursor.offset >= bytes.length) break;
      data.push(bytes[cursor.offset++]);
    }
    events.push({ tick, status, data });
  }

  return events;
}

function tempoMapFromTracks(tracks, ticksPerQuarter) {
  const changes = [{ tick: 0, micros: DEFAULT_TEMPO_MICROS }];
  for (const track of tracks) {
    for (const event of track) {
      if (event.status === 0xff && event.metaType === 0x51 && event.meta?.length >= 3) {
        const micros =
          (event.meta[0] << 16) | (event.meta[1] << 8) | event.meta[2];
        changes.push({ tick: event.tick, micros: micros || DEFAULT_TEMPO_MICROS });
      }
    }
  }
  changes.sort((a, b) => a.tick - b.tick);
  const collapsed = [];
  for (const change of changes) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.tick === change.tick) collapsed[collapsed.length - 1] = change;
    else collapsed.push(change);
  }

  const tickToMs = (tick) => {
    let ms = 0;
    let prevTick = 0;
    let micros = collapsed[0].micros;
    for (let i = 1; i < collapsed.length; i++) {
      const next = collapsed[i];
      if (next.tick >= tick) break;
      ms += ((next.tick - prevTick) * micros) / (ticksPerQuarter * 1000);
      prevTick = next.tick;
      micros = next.micros;
    }
    ms += ((tick - prevTick) * micros) / (ticksPerQuarter * 1000);
    return ms;
  };

  return tickToMs;
}

function collectTrackName(tracks) {
  for (const track of tracks) {
    for (const event of track) {
      if (event.status === 0xff && event.metaType === 0x03 && event.meta?.length) {
        const name = decodeText(event.meta).trim();
        if (name) return name;
      }
    }
  }
  return "";
}

/**
 * Pair note-ons with matching note-offs across channels.
 * @param {Array<{ timeMs: number, midi: number, velocity: number, channel: number, type: "on" | "off" }>} hits
 */
function pairNotes(hits) {
  const held = new Map();
  const notes = [];

  const close = (key, endMs) => {
    const open = held.get(key);
    if (!open) return;
    notes.push({
      midi: open.midi,
      startMs: open.timeMs,
      endMs: Math.max(open.timeMs + MIN_NOTE_MS, endMs),
      velocity: open.velocity,
      channel: open.channel,
    });
    held.delete(key);
  };

  for (const hit of hits) {
    const key = (hit.channel << 8) | hit.midi;
    if (hit.type === "on") {
      if (held.has(key)) close(key, hit.timeMs);
      held.set(key, hit);
    } else {
      close(key, hit.timeMs);
    }
  }

  let last = 0;
  for (const hit of hits) last = Math.max(last, hit.timeMs);
  for (const open of held.values()) {
    notes.push({
      midi: open.midi,
      startMs: open.timeMs,
      endMs: Math.max(open.timeMs + MIN_NOTE_MS, last + 250),
      velocity: open.velocity,
      channel: open.channel,
    });
  }

  notes.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
  return notes;
}

/**
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ notes: Array<object>, durationMs: number, title: string, ticksPerQuarter: number }}
 */
export function parseMidiFile(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const { ticksPerQuarter, tracks } = parseSmf(data);
  const tickToMs = tempoMapFromTracks(tracks, ticksPerQuarter);
  const title = collectTrackName(tracks);

  const hits = [];
  for (const track of tracks) {
    for (const event of track) {
      const high = event.status & 0xf0;
      if (high !== 0x90 && high !== 0x80) continue;
      const midi = event.data[0];
      const velocity = event.data[1] ?? 0;
      if (midi == null) continue;
      const timeMs = tickToMs(event.tick);
      const isOn = high === 0x90 && velocity > 0;
      hits.push({
        timeMs,
        midi,
        velocity: isOn ? velocity : 0,
        channel: event.status & 0x0f,
        type: isOn ? "on" : "off",
      });
    }
  }

  hits.sort((a, b) => a.timeMs - b.timeMs);
  const notes = pairNotes(hits).filter(
    (note) => note.midi >= MIDI_LOWEST && note.midi <= MIDI_HIGHEST
  );
  const durationMs = notes.reduce((max, note) => Math.max(max, note.endMs), 0);
  return { notes, durationMs, title, ticksPerQuarter };
}

/**
 * Convert captured Peak Notes events into visualizer note spans.
 * @param {Array<{ timeMs: number, data: Uint8Array }>} events
 */
export function notesFromEvents(events) {
  const hits = [];
  const sorted = [...(events ?? [])].sort((a, b) => a.timeMs - b.timeMs);
  for (const event of sorted) {
    if (!event?.data?.length) continue;
    const status = event.data[0] & 0xf0;
    if (status !== 0x90 && status !== 0x80) continue;
    const midi = event.data[1];
    const velocity = event.data[2] ?? 0;
    if (midi == null) continue;
    const isOn = status === 0x90 && velocity > 0;
    hits.push({
      timeMs: event.timeMs,
      midi,
      velocity: isOn ? velocity : 0,
      channel: event.data[0] & 0x0f,
      type: isOn ? "on" : "off",
    });
  }
  const notes = pairNotes(hits).filter(
    (note) => note.midi >= MIDI_LOWEST && note.midi <= MIDI_HIGHEST
  );
  const durationMs = notes.reduce((max, note) => Math.max(max, note.endMs), 0);
  return { notes, durationMs };
}
