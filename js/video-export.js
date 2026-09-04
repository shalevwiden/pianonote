/**
 * Silent 1080p/60fps counter video exporter.
 *
 * Rebuilds the live note-count curve from session events, paints each frame to
 * a canvas, then encodes an H.264 MP4 through WebCodecs via Mediabunny.
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  QUALITY_HIGH,
  canEncodeVideo,
} from "./vendor/mediabunny.js";

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 60;
export const FRAME_DURATION = 1 / VIDEO_FPS;
/** Hold the final frame so the last count is readable. */
export const TAIL_MS = 1500;
/** Frames of "0" before the first note when trimming lead-in silence. */
export const START_AT_NOTE_LEAD_FRAMES = 2;
export const START_AT_NOTE_LEAD_MS =
  (START_AT_NOTE_LEAD_FRAMES / VIDEO_FPS) * 1000;

export const DEFAULT_VIDEO_STYLE = {
  textMode: "solid", // "solid" | "gradient"
  textColor: "#5B9FD4",
  textColorEnd: "#8eb4d8",
  gradientAngle: 175,
  backgroundColor: "#000000",
  showLabel: true,
  label: "NOTES PLAYED",
};

/** Solid look presets: paired background + number color. */
export const VIDEO_LOOK_PRESETS = [
  {
    id: "black-blue",
    label: "Black / Blue",
    textMode: "solid",
    textColor: "#5B9FD4",
    textColorEnd: "#8eb4d8",
    backgroundColor: "#000000",
  },
  {
    id: "white-ink",
    label: "White / Ink",
    textMode: "solid",
    textColor: "#111827",
    textColorEnd: "#374151",
    backgroundColor: "#ffffff",
  },
  {
    id: "navy-ice",
    label: "Navy / Ice",
    textMode: "solid",
    textColor: "#e8f1ff",
    textColorEnd: "#93c5fd",
    backgroundColor: "#0b1020",
  },
  {
    id: "cream-terracotta",
    label: "Cream / Ember",
    textMode: "solid",
    textColor: "#9a3412",
    textColorEnd: "#c2410c",
    backgroundColor: "#f5efe6",
  },
  {
    id: "forest-mint",
    label: "Forest / Mint",
    textMode: "solid",
    textColor: "#6ee7b7",
    textColorEnd: "#a7f3d0",
    backgroundColor: "#052e1c",
  },
];

/** Gradient presets — always on a black background. */
export const VIDEO_GRADIENT_PRESETS = [
  {
    id: "ice-blue",
    label: "Ice → Blue",
    textMode: "gradient",
    textColor: "#ffffff",
    textColorEnd: "#60a5fa",
    gradientAngle: 175,
    backgroundColor: "#000000",
  },
  {
    id: "aqua",
    label: "Blue → Aqua",
    textMode: "gradient",
    textColor: "#60a5fa",
    textColorEnd: "#22d3ee",
    gradientAngle: 160,
    backgroundColor: "#000000",
  },
  {
    id: "rose",
    label: "White → Rose",
    textMode: "gradient",
    textColor: "#ffffff",
    textColorEnd: "#fb7185",
    gradientAngle: 200,
    backgroundColor: "#000000",
  },
  {
    id: "gold",
    label: "Gold → White",
    textMode: "gradient",
    textColor: "#fbbf24",
    textColorEnd: "#fff7ed",
    gradientAngle: 145,
    backgroundColor: "#000000",
  },
  {
    id: "violet",
    label: "Violet → Blue",
    textMode: "gradient",
    textColor: "#c4b5fd",
    textColorEnd: "#38bdf8",
    gradientAngle: 185,
    backgroundColor: "#000000",
  },
];

/**
 * Build a sorted list of { timeMs, count } for every note-on.
 * @param {Array<{ timeMs: number, data: Uint8Array }>} events
 */
export function buildNoteTimeline(events) {
  const points = [];
  let count = 0;
  const sorted = [...events].sort((a, b) => a.timeMs - b.timeMs);
  for (const event of sorted) {
    const status = event.data[0] & 0xf0;
    if (status === 0x90 && event.data.length >= 3 && event.data[2] > 0) {
      count += 1;
      points.push({ timeMs: event.timeMs, count });
    }
  }
  return points;
}

export function sessionDurationMs(events, noteTimeline) {
  if (!events.length && !noteTimeline.length) return 0;
  const lastEvent = events.reduce(
    (max, event) => Math.max(max, event.timeMs),
    0
  );
  const lastNote = noteTimeline.length
    ? noteTimeline[noteTimeline.length - 1].timeMs
    : 0;
  return Math.max(lastEvent, lastNote);
}

/**
 * Session-time (ms) that maps to video t=0.
 * When startAtFirstNote is on, skip silence before the first note-on, but keep a
 * short lead so frame 0 is still 0 and the first note still jumps in.
 * May be slightly negative if the first note is earlier than the lead-in.
 */
export function videoContentStartMs(timeline, startAtFirstNote = false) {
  if (!startAtFirstNote || !timeline.length) return 0;
  return timeline[0].timeMs - START_AT_NOTE_LEAD_MS;
}

/** Count at or before timeMs via binary search. */
export function countAtTime(timeline, timeMs) {
  if (!timeline.length || timeMs < timeline[0].timeMs) return 0;
  let lo = 0;
  let hi = timeline.length - 1;
  let answer = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].timeMs <= timeMs) {
      answer = timeline[mid].count;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return answer;
}

/** Ms since the most recent note-on at or before timeMs, or Infinity. */
export function msSinceLastNote(timeline, timeMs) {
  if (!timeline.length || timeMs < timeline[0].timeMs) return Infinity;
  let lo = 0;
  let hi = timeline.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].timeMs <= timeMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return Infinity;
  return timeMs - timeline[best].timeMs;
}

function parseHex(color) {
  const hex = color.replace("#", "").trim();
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function mixColors(a, b, t) {
  const A = parseHex(a);
  const B = parseHex(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Paint one counter frame onto a canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} options
 */
export function renderCounterFrame(ctx, options) {
  const {
    width = VIDEO_WIDTH,
    height = VIDEO_HEIGHT,
    count = 0,
    style = DEFAULT_VIDEO_STYLE,
  } = options;

  const s = { ...DEFAULT_VIDEO_STYLE, ...style };
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = s.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (s.showLabel) {
    ctx.font = `500 ${Math.round(height * 0.04)}px "Outfit", "DM Sans", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(163, 163, 163, 0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "0.22em";
    ctx.fillText(s.label, width / 2, height * 0.28);
    ctx.letterSpacing = "0px";
  }

  const fontSize = Math.round(height * 0.42);
  ctx.font = `600 ${fontSize}px "Outfit", "DM Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const text = Number(count).toLocaleString("en-US");
  const cx = width / 2;
  const cy = height * 0.54;

  if (s.textMode === "gradient") {
    const grad = ctx.createLinearGradient(
      0,
      cy - fontSize * 0.55,
      cx + Math.sin((s.gradientAngle * Math.PI) / 180) * fontSize,
      cy + Math.cos((s.gradientAngle * Math.PI) / 180) * fontSize
    );
    grad.addColorStop(0, s.textColor);
    grad.addColorStop(1, s.textColorEnd);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = s.textColor;
  }

  ctx.fillText(text, cx, cy);
  ctx.restore();
}

export async function isVideoExportSupported() {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    return await canEncodeVideo("avc", {
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      quality: QUALITY_HIGH,
    });
  } catch {
    return false;
  }
}

/**
 * @param {object} options
 * @param {Array<{ timeMs: number, data: Uint8Array }>} options.events
 * @param {object} [options.style]
 * @param {boolean} [options.startAtFirstNote]
 * @param {(progress: { ratio: number, frame: number, totalFrames: number, count: number }) => void} [options.onProgress]
 * @param {() => boolean} [options.shouldCancel]
 * @param {HTMLCanvasElement} [options.previewCanvas] optional live preview target
 * @returns {Promise<Blob>}
 */
export async function exportCounterVideo(options) {
  const {
    events,
    style = DEFAULT_VIDEO_STYLE,
    startAtFirstNote = false,
    onProgress,
    shouldCancel,
    previewCanvas,
  } = options;

  const supported = await isVideoExportSupported();
  if (!supported) {
    throw new Error(
      "H.264 video encoding is not available in this browser. Use Chrome or Edge."
    );
  }

  const timeline = buildNoteTimeline(events);
  const startOffsetMs = videoContentStartMs(timeline, startAtFirstNote);
  const contentMs = Math.max(
    0,
    sessionDurationMs(events, timeline) - startOffsetMs
  );
  const totalMs = contentMs + TAIL_MS;
  const totalFrames = Math.max(1, Math.ceil((totalMs / 1000) * VIDEO_FPS) + 1);

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not create a 2D canvas context");

  let previewCtx = null;
  if (previewCanvas) {
    previewCanvas.width = VIDEO_WIDTH;
    previewCanvas.height = VIDEO_HEIGHT;
    previewCtx = previewCanvas.getContext("2d", { alpha: false });
  }

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  // Mediabunny rejects `quality` and `bitrate` together — quality lets it pick
  // a sane 1080p60 bitrate for what is mostly flat color and crisp text.
  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    quality: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: VIDEO_FPS });

  await output.start();

  let cancelled = false;
  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      if (shouldCancel?.()) {
        cancelled = true;
        break;
      }

      const timeMs = (frame / VIDEO_FPS) * 1000 + startOffsetMs;
      const count = countAtTime(timeline, timeMs);

      renderCounterFrame(ctx, { count, style });
      if (previewCtx) {
        previewCtx.drawImage(canvas, 0, 0);
      }

      await videoSource.add(frame / VIDEO_FPS, FRAME_DURATION);

      if (frame % 4 === 0 || frame === totalFrames - 1) {
        onProgress?.({
          ratio: (frame + 1) / totalFrames,
          frame: frame + 1,
          totalFrames,
          count,
        });
        // Yield so the UI can paint progress / handle cancel clicks.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (cancelled) {
      await output.cancel?.();
      throw new DOMException("Video export cancelled", "AbortError");
    }

    await output.finalize();
  } catch (error) {
    try {
      await output.cancel?.();
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }

  const buffer = target.buffer;
  if (!buffer) throw new Error("Encoder produced an empty file");
  return new Blob([buffer], { type: "video/mp4" });
}

export function downloadBlob(blob, filename) {
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

export { mixColors };
