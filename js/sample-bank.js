/**
 * Sampled-instrument bank for PianoSynth.
 *
 * Loads MusyngKite GM notes from assets/samples and pitch-shifts the nearest
 * take when a file is missing. Oscillator voices still handle anything without
 * a pack (currently the 80s synth).
 */

import { MIDI_HIGHEST, MIDI_LOWEST, MIDDLE_C, noteToFrequency } from "./note-utils.js";

const NOTE_FILES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SAMPLE_ROOT = new URL("../assets/samples/", import.meta.url);

function noteLoadOrder() {
  const notes = [];
  for (let midi = MIDI_LOWEST; midi <= MIDI_HIGHEST; midi++) notes.push(midi);
  notes.sort((a, b) => Math.abs(a - MIDDLE_C) - Math.abs(b - MIDDLE_C));
  return notes;
}

export const SAMPLE_PACKS = {
  piano: "piano",
  steinway: "piano",
  cinematic: "piano",
  epiano: "epiano",
  harpsichord: "harpsichord",
  eguitar: "eguitar",
};

export function midiToSampleName(midi) {
  const pitch = NOTE_FILES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pitch}${octave}`;
}

export function packForVoice(voiceId) {
  return SAMPLE_PACKS[voiceId] ?? null;
}

export class SampleBank {
  constructor() {
    /** @type {Map<string, Map<number, AudioBuffer>>} */
    this.decoded = new Map();
    /** @type {Set<string>} */
    this.loading = new Set();
    /** @type {Set<string>} */
    this.ready = new Set();
  }

  isReady(pack) {
    return this.ready.has(pack);
  }

  /**
   * @param {AudioContext} ctx
   * @param {string} pack
   */
  async load(ctx, pack) {
    if (!pack || this.ready.has(pack) || this.loading.has(pack)) {
      while (this.loading.has(pack)) {
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return this.ready.has(pack);
    }

    this.loading.add(pack);
    const buffers = this.decoded.get(pack) ?? new Map();
    this.decoded.set(pack, buffers);
    const notes = noteLoadOrder();

    try {
      const workers = 12;
      for (let i = 0; i < notes.length; i += workers) {
        const slice = notes.slice(i, i + workers);
        await Promise.all(
          slice.map(async (midi) => {
            const name = midiToSampleName(midi);
            try {
              const url = new URL(`${pack}/${name}.mp3`, SAMPLE_ROOT);
              const response = await fetch(url);
              if (!response.ok) return;
              const raw = await response.arrayBuffer();
              const audio = await ctx.decodeAudioData(raw.slice(0));
              buffers.set(midi, audio);
            } catch {
              // Missing notes are covered by nearest-neighbour pitch shift.
            }
          })
        );
        if (buffers.size > 0) this.ready.add(pack);
      }
      if (buffers.size > 0) this.ready.add(pack);
      return buffers.size > 0;
    } finally {
      this.loading.delete(pack);
    }
  }

  /**
   * @param {string} pack
   * @param {number} midi
   * @returns {{ buffer: AudioBuffer, rootMidi: number } | null}
   */
  nearest(pack, midi) {
    const buffers = this.decoded.get(pack);
    if (!buffers || buffers.size === 0) return null;
    if (buffers.has(midi)) return { buffer: buffers.get(midi), rootMidi: midi };

    let best = null;
    let bestDist = Infinity;
    for (const root of buffers.keys()) {
      const dist = Math.abs(root - midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = root;
      }
    }
    if (best == null || bestDist > 7) return null;
    return { buffer: buffers.get(best), rootMidi: best };
  }

  playbackRate(midi, rootMidi) {
    return noteToFrequency(midi) / noteToFrequency(rootMidi);
  }
}
