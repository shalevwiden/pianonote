import lamejs from "./vendor/lamejs.js";
import { packForVoice } from "./sample-bank.js";

const SAMPLE_RATE = 44100;
const MP3_BITRATE = 192;
const TAIL_SECONDS = 2.5;
const RELEASE_SECONDS = 0.45;
const STATUS_NOTE_OFF = 0x80;
const STATUS_NOTE_ON = 0x90;
const STATUS_CONTROL_CHANGE = 0xb0;

function sortEvents(events) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.timeMs - b.event.timeMs || a.index - b.index)
    .map(({ event }) => event);
}

function noteOn(event) {
  return (
    (event.data[0] & 0xf0) === STATUS_NOTE_ON &&
    event.data.length >= 3 &&
    event.data[2] > 0
  );
}

function noteOff(event) {
  const status = event.data[0] & 0xf0;
  return (
    status === STATUS_NOTE_OFF ||
    (status === STATUS_NOTE_ON && event.data[2] === 0)
  );
}

function trimEvents(events) {
  const ordered = sortEvents(
    events.filter((event) => event?.data?.length >= 2),
  );
  const first = ordered.find(noteOn);
  const offset = first?.timeMs ?? 0;
  return ordered.map((event) => ({
    timeMs: Math.max(0, event.timeMs - offset),
    data: event.data,
  }));
}

function timelineDuration(events) {
  const ordered = trimEvents(events);
  const lastMs = ordered.length ? ordered[ordered.length - 1].timeMs : 0;
  return Math.max(0.5, lastMs / 1000 + TAIL_SECONDS);
}

function createReverb(ctx) {
  const input = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 1;
  const taps = [0.027, 0.039, 0.053, 0.071, 0.097, 0.131, 0.173, 0.229];
  taps.forEach((time, index) => {
    const delay = ctx.createDelay(0.3);
    delay.delayTime.value = time;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5200 - index * 280;
    const gain = ctx.createGain();
    gain.gain.value = 0.28 - index * 0.025;
    input.connect(delay);
    delay.connect(filter);
    filter.connect(gain);
    gain.connect(wet);
  });
  return { input, wet };
}

function createOutput(ctx) {
  const dry = ctx.createGain();
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.18;
  const reverb = createReverb(ctx);
  const master = ctx.createGain();
  master.gain.value = 0.86;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.22;

  dry.connect(master);
  reverbSend.connect(reverb.input);
  reverb.wet.connect(master);
  master.connect(compressor);
  compressor.connect(ctx.destination);
  return { dry, reverbSend };
}

function scheduleSample(ctx, output, sampleBank, note, velocity, startMs) {
  const hit = sampleBank.nearest("piano", note);
  if (!hit) return null;

  const source = ctx.createBufferSource();
  source.buffer = hit.buffer;
  source.playbackRate.value = sampleBank.playbackRate(note, hit.rootMidi);
  const envelope = ctx.createGain();
  envelope.gain.value = Math.max(0.06, velocity / 127) * 0.92;
  source.connect(envelope);
  envelope.connect(output.dry);
  envelope.connect(output.reverbSend);
  source.start(Math.max(0, startMs / 1000));
  return { source, envelope, released: false };
}

function releaseSample(voice, atMs) {
  if (!voice || voice.released) return;
  voice.released = true;
  const at = Math.max(0, atMs / 1000);
  const gain = voice.envelope.gain;
  gain.cancelScheduledValues(at);
  gain.setValueAtTime(Math.max(0.0001, gain.value), at);
  gain.exponentialRampToValueAtTime(0.0001, at + RELEASE_SECONDS);
  try {
    voice.source.stop(at + RELEASE_SECONDS + 0.05);
  } catch {
    // The offline source may already have reached the end of its sample.
  }
}

function scheduleEvents(ctx, output, sampleBank, events) {
  const ordered = trimEvents(events);
  const voices = new Map();
  const sustained = new Set();
  let pedalDown = false;
  let lastMs = 0;

  for (const event of ordered) {
    const atMs = event.timeMs;
    lastMs = Math.max(lastMs, atMs);
    const status = event.data[0] & 0xf0;
    const note = event.data[1];

    if (noteOn(event)) {
      const voice = scheduleSample(
        ctx,
        output,
        sampleBank,
        note,
        event.data[2],
        atMs,
      );
      if (voice) {
        const queue = voices.get(note) ?? [];
        queue.push(voice);
        voices.set(note, queue);
      }
      continue;
    }

    if (noteOff(event)) {
      const queue = voices.get(note);
      const voice = queue?.shift();
      if (!voice) continue;
      if (pedalDown) sustained.add(voice);
      else releaseSample(voice, atMs);
      continue;
    }

    if (status === STATUS_CONTROL_CHANGE && note === 64) {
      const nextDown = event.data[2] >= 64;
      if (pedalDown && !nextDown) {
        for (const voice of sustained) releaseSample(voice, atMs);
        sustained.clear();
      }
      pedalDown = nextDown;
    }
  }

  for (const queue of voices.values()) {
    for (const voice of queue)
      releaseSample(
        voice,
        lastMs + TAIL_SECONDS * 1000 - RELEASE_SECONDS * 1000,
      );
  }
  for (const voice of sustained) {
    releaseSample(voice, lastMs + TAIL_SECONDS * 1000 - RELEASE_SECONDS * 1000);
  }
  return Math.max(0.5, lastMs / 1000 + TAIL_SECONDS);
}

function encodeMp3(buffer) {
  const encoder = new lamejs.Mp3Encoder(2, buffer.sampleRate, MP3_BITRATE);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const chunks = [];
  const blockSize = 1152;
  const leftPcm = new Int16Array(blockSize);
  const rightPcm = new Int16Array(blockSize);

  for (let offset = 0; offset < left.length; offset += blockSize) {
    const length = Math.min(blockSize, left.length - offset);
    for (let index = 0; index < length; index += 1) {
      leftPcm[index] = Math.max(
        -32768,
        Math.min(32767, left[offset + index] * 32767),
      );
      rightPcm[index] = Math.max(
        -32768,
        Math.min(32767, right[offset + index] * 32767),
      );
    }
    const encoded = encoder.encodeBuffer(
      leftPcm.subarray(0, length),
      rightPcm.subarray(0, length),
    );
    if (encoded.length) chunks.push(new Int8Array(encoded));
  }
  const final = encoder.flush();
  if (final.length) chunks.push(new Int8Array(final));
  return new Blob(chunks, { type: "audio/mpeg" });
}

export async function renderPianoMp3(events, { sampleBank } = {}) {
  if (!events?.length)
    throw new Error("This session has no MIDI data to export");
  const AudioContext =
    window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContext)
    throw new Error("Offline audio rendering is not supported in this browser");

  const bank = sampleBank;
  const duration = timelineDuration(events);
  const frameCount = Math.ceil(duration * SAMPLE_RATE);
  const context = new AudioContext(2, frameCount, SAMPLE_RATE);
  if (!bank || !(await bank.load(context, packForVoice("piano")))) {
    throw new Error(
      "Piano samples are unavailable. Check the sample pack and try again.",
    );
  }

  const output = createOutput(context);
  scheduleEvents(context, output, bank, events);
  const rendered = await context.startRendering();
  return encodeMp3(rendered);
}

export function downloadAudio(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
