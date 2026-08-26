/**
 * Falling-note MIDI visualizer.
 *
 * Canvas piano roll in the SeeMusic / Synthesia family: notes drop toward a
 * realistic 88-key piano, keys light in the glow color, sparks rise on hits.
 */

import { isBlackKey, MIDI_HIGHEST, MIDI_LOWEST, noteName } from "./note-utils.js";

export const LOOKAHEAD_MS = 2400;
const PIANO_RATIO = 0.22;
const MIN_NOTE_PX = 10;
const WHITE_COUNT = 52;

export const VIZ_THEMES = [
  {
    id: "dark",
    label: "Dark",
    note: "#60a5fa",
    bg: "#05060a",
    sky: "#0b1220",
    pianoBed: "#0a0c12",
    pianoRail: "#1a2030",
    overlay: 0.28,
    fog: 0.22,
  },
  {
    id: "neon",
    label: "Neon",
    note: "#39ff14",
    bg: "#07010f",
    sky: "#1a0530",
    pianoBed: "#0d0618",
    pianoRail: "#24103c",
    overlay: 0.42,
    fog: 0.3,
  },
  {
    id: "blue",
    label: "Blue",
    note: "#38bdf8",
    bg: "#031018",
    sky: "#062033",
    pianoBed: "#07141e",
    pianoRail: "#0d2436",
    overlay: 0.32,
    fog: 0.26,
  },
  {
    id: "light",
    label: "Light",
    note: "#2563eb",
    bg: "#e8edf4",
    sky: "#cfd8e8",
    pianoBed: "#c5d0e0",
    pianoRail: "#9aabc2",
    overlay: 0.08,
    fog: 0.12,
    lightScene: true,
  },
  {
    id: "ocean",
    label: "Ocean",
    note: "#2dd4bf",
    bg: "#02151c",
    sky: "#023047",
    pianoBed: "#03222c",
    pianoRail: "#0a3a48",
    overlay: 0.32,
    fog: 0.24,
  },
  {
    id: "sunset",
    label: "Sunset",
    note: "#fb7185",
    bg: "#14080c",
    sky: "#3a1520",
    pianoBed: "#1a0c12",
    pianoRail: "#3a1824",
    overlay: 0.3,
    fog: 0.22,
  },
  {
    id: "violet",
    label: "Violet",
    note: "#c084fc",
    bg: "#0c0616",
    sky: "#1c0b32",
    pianoBed: "#140a22",
    pianoRail: "#2a1644",
    overlay: 0.32,
    fog: 0.24,
  },
  {
    id: "ember",
    label: "Ember",
    note: "#fb923c",
    bg: "#120804",
    sky: "#2a1208",
    pianoBed: "#1a0d08",
    pianoRail: "#3a1c10",
    overlay: 0.3,
    fog: 0.22,
  },
  {
    id: "mint",
    label: "Mint",
    note: "#34d399",
    bg: "#04140f",
    sky: "#0a2a1c",
    pianoBed: "#071a14",
    pianoRail: "#0e3326",
    overlay: 0.3,
    fog: 0.22,
  },
  {
    id: "gold",
    label: "Gold",
    note: "#fbbf24",
    bg: "#120e04",
    sky: "#2a220c",
    pianoBed: "#1a1608",
    pianoRail: "#3a3010",
    overlay: 0.3,
    fog: 0.2,
  },
];

export const DEFAULT_VIZ_THEME = VIZ_THEMES[0];

function parseHex(color) {
  const hex = String(color || "#60a5fa").replace("#", "").trim();
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(full, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function rgba(rgb, a) {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

function mixToward(rgb, toward, t) {
  return {
    r: Math.round(rgb.r + (toward - rgb.r) * t),
    g: Math.round(rgb.g + (toward - rgb.g) * t),
    b: Math.round(rgb.b + (toward - rgb.b) * t),
  };
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCoverImage(ctx, img, width, height) {
  const ir = img.width / Math.max(1, img.height);
  const cr = width / Math.max(1, height);
  let dw;
  let dh;
  if (ir > cr) {
    dh = height;
    dw = height * ir;
  } else {
    dw = width;
    dh = width / ir;
  }
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

function buildKeys(width, pianoTop, pianoH) {
  const padX = Math.max(8, width * 0.012);
  const inner = Math.max(1, width - padX * 2);
  const whiteW = inner / WHITE_COUNT;
  const blackW = whiteW * 0.52;
  const blackH = pianoH * 0.62;
  const whites = [];
  const blacks = [];
  let whiteIndex = 0;

  for (let midi = MIDI_LOWEST; midi <= MIDI_HIGHEST; midi++) {
    if (isBlackKey(midi)) {
      const x = padX + whiteIndex * whiteW - blackW / 2;
      blacks.push({
        midi,
        black: true,
        x,
        y: pianoTop,
        w: blackW,
        h: blackH,
        cx: x + blackW / 2,
      });
    } else {
      const x = padX + whiteIndex * whiteW;
      whites.push({
        midi,
        black: false,
        x,
        y: pianoTop,
        w: whiteW,
        h: pianoH,
        cx: x + whiteW / 2,
      });
      whiteIndex += 1;
    }
  }

  const byMidi = new Map();
  for (const key of whites) byMidi.set(key.midi, key);
  for (const key of blacks) byMidi.set(key.midi, key);
  return { whites, blacks, byMidi, padX, pianoTop, pianoH };
}

export class MidiVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.onTime = options.onTime;
    this.onNoteOn = options.onNoteOn;
    this.onNoteOff = options.onNoteOff;
    this.onEnded = options.onEnded;
    this.applyTheme(options.theme || DEFAULT_VIZ_THEME, { silent: true });
    if (options.color) this.color = options.color;
    if (options.bgColor) this.bgColor = options.bgColor;
    this.lookaheadMs = options.lookaheadMs ?? LOOKAHEAD_MS;
    this.bgImage = null;
    this.trailStrength = options.trailStrength ?? 0.6;
    this.trailWave = options.trailWave ?? 0.4;

    this.notes = [];
    this.durationMs = 0;
    this.playhead = 0;
    this.playing = false;
    this.origin = 0;
    this.raf = 0;
    this.lastFrame = 0;
    this.keys = null;
    this.particles = [];
    this.trails = [];
    this.keyFlash = new Map();
    this.sounding = new Set();
    this.triggered = new Set();
    this.released = new Set();
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.visible = false;

    this._onResize = () => this.resize();
    this.ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => this.resize())
      : null;
    this.ro?.observe(canvas.parentElement || canvas);
    window.addEventListener("resize", this._onResize);
  }

  applyTheme(theme, { silent = false } = {}) {
    const next = { ...DEFAULT_VIZ_THEME, ...theme };
    this.themeId = next.id;
    this.color = next.note;
    this.bgColor = next.bg;
    this.skyColor = next.sky;
    this.pianoBed = next.pianoBed;
    this.pianoRail = next.pianoRail;
    this.overlay = next.overlay ?? 0.28;
    this.fogStrength = next.fog ?? 0.22;
    this.lightScene = Boolean(next.lightScene);
    if (!silent && !this.playing) this.draw(0);
  }

  setColor(color) {
    this.color = color;
    if (!this.playing) this.draw(0);
  }

  setBackgroundColor(color) {
    this.bgColor = color;
    if (!this.playing) this.draw(0);
  }

  setTrailStrength(value) {
    this.trailStrength = Math.min(1, Math.max(0, Number(value) || 0));
    if (!this.playing) this.draw(0);
  }

  setTrailWave(value) {
    this.trailWave = Math.min(1, Math.max(0, Number(value) || 0));
    if (!this.playing) this.draw(0);
  }

  setBackgroundImage(image) {
    this.bgImage = image || null;
    if (!this.playing) this.draw(0);
  }

  setNotes(notes, durationMs = 0) {
    this.stopSound();
    this.notes = [...(notes ?? [])].sort((a, b) => a.startMs - b.startMs);
    this.durationMs = Math.max(
      durationMs,
      this.notes.reduce((max, note) => Math.max(max, note.endMs), 0)
    );
    this.playhead = 0;
    this.triggered.clear();
    this.released.clear();
    this.particles = [];
    this.trails = [];
    this.keyFlash.clear();
    this.resize();
    this.draw(0);
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const cssW = Math.max(1, parent.clientWidth || this.canvas.clientWidth);
    const cssH = Math.max(1, parent.clientHeight || this.canvas.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = cssW;
    this.height = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const pianoH = Math.max(96, cssH * PIANO_RATIO);
    this.keys = buildKeys(cssW, cssH - pianoH, pianoH);
    if (this.visible) this.draw(0);
  }

  show() {
    this.visible = true;
    this.resize();
    this.loop(0);
  }

  hide() {
    this.visible = false;
    this.pause();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  play() {
    if (!this.notes.length) return;
    if (this.playhead >= this.durationMs) this.seek(0);
    this.playing = true;
    this.origin = performance.now() - this.playhead;
    for (const note of this.notes) {
      if (this.playhead >= note.startMs && this.playhead < note.endMs) {
        this.triggered.add(note);
        if (!this.sounding.has(note.midi)) {
          this.sounding.add(note.midi);
          this.onNoteOn?.(note.midi, note.velocity);
        }
      }
    }
    if (!this.raf) this.loop(0);
  }

  pause() {
    this.playing = false;
    this.stopSound();
  }

  seek(ms) {
    const next = Math.max(0, Math.min(this.durationMs, ms));
    this.stopSound();
    this.playhead = next;
    this.origin = performance.now() - next;
    this.triggered.clear();
    this.released.clear();
    for (const note of this.notes) {
      if (note.startMs < next) this.triggered.add(note);
      if (note.endMs <= next) this.released.add(note);
    }
    this.draw(0);
    this.onTime?.(this.playhead, this.durationMs);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  destroy() {
    this.hide();
    this.ro?.disconnect();
    window.removeEventListener("resize", this._onResize);
  }

  stopSound() {
    for (const midi of this.sounding) this.onNoteOff?.(midi);
    this.sounding.clear();
  }

  loop(stamp) {
    if (!this.visible) return;
    this.raf = requestAnimationFrame((next) => this.loop(next));
    const dt = this.lastFrame ? Math.min(0.05, (stamp - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = stamp;

    if (this.playing) {
      this.playhead = Math.min(this.durationMs, performance.now() - this.origin);
      this.syncAudio();
      if (this.playhead >= this.durationMs) {
        this.playing = false;
        this.stopSound();
        this.onEnded?.();
      }
    }

    this.updateParticles(dt);
    this.emitNoteTrails(dt);
    this.updateTrails(dt);
    this.decayFlashes(dt);
    this.draw(dt);
    this.onTime?.(this.playhead, this.durationMs);
  }

  syncAudio() {
    const now = this.playhead;
    for (const note of this.notes) {
      if (now >= note.startMs && now < note.endMs && !this.triggered.has(note)) {
        this.triggered.add(note);
        this.sounding.add(note.midi);
        this.onNoteOn?.(note.midi, note.velocity);
        this.flashKey(note.midi);
      }
      if (now >= note.endMs && this.triggered.has(note) && !this.released.has(note)) {
        this.released.add(note);
        this.sounding.delete(note.midi);
        this.onNoteOff?.(note.midi);
      }
    }
  }

  flashKey(midi) {
    this.keyFlash.set(midi, 1);
    const key = this.keys?.byMidi.get(midi);
    if (!key) return;
    const rgb = parseHex(this.color);
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x: key.cx + (Math.random() - 0.5) * key.w * 0.55,
        y: this.keys.pianoTop + 6,
        vx: (Math.random() - 0.5) * 55,
        vy: -50 - Math.random() * 90,
        life: 1,
        decay: 0.55 + Math.random() * 0.7,
        size: 1.2 + Math.random() * 2.6,
        rgb,
      });
    }
  }

  updateParticles(dt) {
    const next = [];
    for (const p of this.particles) {
      p.life -= dt * p.decay;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      p.vx *= 0.98;
      next.push(p);
    }
    this.particles = next;
  }

  emitNoteTrails(dt) {
    const strength = this.trailStrength;
    if (!this.playing || strength <= 0.02 || !this.keys) return;

    const rgb = parseHex(this.color);
    const pianoTop = this.keys.pianoTop;
    const budget = Math.round(10 + strength * 42);
    let spawned = 0;

    for (const note of this.notes) {
      if (spawned >= budget) break;
      if (note.endMs < this.playhead) continue;
      if (note.startMs > this.playhead + this.lookaheadMs) continue;
      const key = this.keys.byMidi.get(note.midi);
      if (!key) continue;

      const bottom = Math.min(pianoTop, this.yAt(note.startMs));
      const top = this.yAt(note.endMs);
      if (bottom < -8 || top > pianoTop) continue;
      const h = Math.max(MIN_NOTE_PX, bottom - top);
      const y = bottom - h;
      const count = Math.max(1, Math.round(strength * (1.2 + h / 90)));

      for (let i = 0; i < count && spawned < budget; i++) {
        this.trails.push({
          x: key.cx + (Math.random() - 0.5) * key.w * 0.42,
          y: y + Math.random() * Math.min(h * 0.45, 36),
          phase: Math.random() * Math.PI * 2,
          freq: 2.4 + Math.random() * 4.2,
          amp: (10 + Math.random() * 36) * this.trailWave,
          vy: -12 - Math.random() * 22,
          life: 0.55 + strength * 0.75,
          decay: 0.65 + Math.random() * 0.95,
          size: 1.15 + strength * 3.1 + Math.random() * 1.4,
          rgb,
        });
        spawned += 1;
      }
    }

    if (this.trails.length > 700) this.trails.splice(0, this.trails.length - 700);
  }

  updateTrails(dt) {
    const next = [];
    for (const p of this.trails) {
      p.life -= dt * p.decay;
      if (p.life <= 0) continue;
      p.phase += dt * p.freq;
      p.x += Math.sin(p.phase) * p.amp * dt;
      p.y += p.vy * dt;
      next.push(p);
    }
    this.trails = next;
  }

  decayFlashes(dt) {
    for (const [midi, value] of this.keyFlash) {
      const next = value - dt * 1.8;
      if (next <= 0) this.keyFlash.delete(midi);
      else this.keyFlash.set(midi, next);
    }
  }

  yAt(timeMs) {
    const pianoTop = this.keys.pianoTop;
    return pianoTop - ((timeMs - this.playhead) / this.lookaheadMs) * pianoTop;
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.keys) return;
    const { width, height } = this;
    const rgb = parseHex(this.color);
    const bg = parseHex(this.bgColor || DEFAULT_VIZ_THEME.bg);
    const pianoTop = this.keys.pianoTop;

    ctx.fillStyle = this.bgColor || DEFAULT_VIZ_THEME.bg;
    ctx.fillRect(0, 0, width, height);

    if (this.bgImage) {
      drawCoverImage(ctx, this.bgImage, width, height);
      ctx.fillStyle = rgba(bg, this.overlay);
      ctx.fillRect(0, 0, width, pianoTop);
    }

    this.drawLaneGuides(ctx);
    this.drawTrails(ctx);
    this.drawNotes(ctx, rgb);
    this.drawFog(ctx, rgb);
    this.drawParticles(ctx);
    this.drawPiano(ctx, rgb);
  }

  drawLaneGuides(ctx) {
    ctx.save();
    ctx.globalAlpha = this.lightScene ? 0.1 : 0.045;
    ctx.strokeStyle = this.lightScene ? "#0f172a" : "#ffffff";
    ctx.lineWidth = 1;
    for (const key of this.keys.whites) {
      if (key.midi % 12 !== 0) continue;
      ctx.beginPath();
      ctx.moveTo(Math.round(key.x) + 0.5, 0);
      ctx.lineTo(Math.round(key.x) + 0.5, this.keys.pianoTop);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawNotes(ctx, rgb) {
    const pianoTop = this.keys.pianoTop;
    const light = mixToward(rgb, 255, 0.5);
    const dark = mixToward(rgb, 20, 0.18);
    const glow = mixToward(rgb, 255, 0.2);

    for (const note of this.notes) {
      if (note.endMs < this.playhead - 80) continue;
      if (note.startMs > this.playhead + this.lookaheadMs + 80) continue;
      const key = this.keys.byMidi.get(note.midi);
      if (!key) continue;

      const bottom = Math.min(pianoTop, this.yAt(note.startMs));
      const top = this.yAt(note.endMs);
      if (bottom < -20) continue;
      if (top > pianoTop) continue;

      const h = Math.max(MIN_NOTE_PX, bottom - top);
      const y = bottom - h;
      const inset = key.black ? key.w * 0.08 : key.w * 0.12;
      const x = key.x + inset;
      const w = Math.max(3, key.w - inset * 2);
      const active = note.startMs <= this.playhead && note.endMs > this.playhead;
      const vel = Math.min(1, Math.max(0.45, note.velocity / 127));
      const drawY = Math.max(-12, y);
      const drawH = h + (y < 0 ? y : 0) + 2;
      const radius = Math.min(8, w / 2);

      ctx.save();
      ctx.globalCompositeOperation = this.lightScene ? "source-over" : "lighter";
      ctx.shadowColor = rgba(glow, active ? 1 : 0.7 * vel);
      ctx.shadowBlur = active ? 46 : 28;
      ctx.fillStyle = rgba(rgb, active ? 0.55 : 0.32 * vel);
      roundedRect(ctx, x - 2, drawY, w + 4, drawH, radius);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = rgba(rgb, active ? 0.95 : 0.55 * vel);
      ctx.shadowBlur = active ? 36 : 22;
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, rgba(light, 1));
      grad.addColorStop(0.45, rgba(rgb, 0.98 * vel));
      grad.addColorStop(1, rgba(dark, 0.95 * vel));
      ctx.fillStyle = grad;
      roundedRect(ctx, x, drawY, w, drawH, radius);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba({ r: 255, g: 255, b: 255 }, active ? 0.42 : 0.2);
      roundedRect(
        ctx,
        x + 1.5,
        drawY + 1.5,
        Math.max(1, w * 0.32),
        Math.max(4, h * 0.55),
        4
      );
      ctx.fill();
      ctx.restore();
    }
  }

  drawTrails(ctx) {
    if (!this.trails.length) return;
    ctx.save();
    ctx.globalCompositeOperation = this.lightScene ? "source-over" : "lighter";
    const alphaScale = 0.28 + this.trailStrength * 0.55;
    for (const p of this.trails) {
      const a = Math.max(0, p.life) * alphaScale;
      ctx.fillStyle = rgba(p.rgb, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.45 + p.life * 0.9), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFog(ctx, rgb) {
    const pianoTop = this.keys.pianoTop;
    const fog = ctx.createLinearGradient(0, pianoTop - 42, 0, pianoTop);
    fog.addColorStop(0, rgba(rgb, 0));
    fog.addColorStop(1, rgba(rgb, (this.fogStrength ?? 0.22) * 0.45));
    ctx.fillStyle = fog;
    ctx.fillRect(0, pianoTop - 42, this.width, 42);
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.fillStyle = rgba(p.rgb, p.life);
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawPiano(ctx, rgb) {
    const { whites, blacks, pianoTop, pianoH } = this.keys;
    const now = this.playhead;

    const sounding = new Set();
    for (const note of this.notes) {
      if (note.startMs <= now && note.endMs > now) sounding.add(note.midi);
    }

    ctx.fillStyle = this.pianoBed || "#0a0c12";
    ctx.fillRect(0, pianoTop - 8, this.width, pianoH + 8);
    ctx.fillStyle = this.pianoRail || "#161922";
    ctx.fillRect(0, pianoTop - 6, this.width, 6);

    for (const key of whites) {
      const on = sounding.has(key.midi);
      const flash = this.keyFlash.get(key.midi) ?? 0;
      this.paintWhiteKey(ctx, key, rgb, on, flash);
    }
    for (const key of blacks) {
      const on = sounding.has(key.midi);
      const flash = this.keyFlash.get(key.midi) ?? 0;
      this.paintBlackKey(ctx, key, rgb, on, flash);
    }

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, this.height - 4, this.width, 4);
  }

  paintWhiteKey(ctx, key, rgb, on, flash) {
    const { x, y, w, h } = key;
    const press = on ? 2 : 0;
    const radius = 5;

    ctx.save();
    if (on) {
      ctx.shadowColor = rgba(rgb, 0.55 + flash * 0.35);
      ctx.shadowBlur = 22;
    }
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (on) {
      const lit = mixToward(rgb, 255, 0.18);
      grad.addColorStop(0, rgba(lit, 1));
      grad.addColorStop(1, rgba(rgb, 1));
    } else {
      grad.addColorStop(0, "#f8fafc");
      grad.addColorStop(0.78, "#e2e8f0");
      grad.addColorStop(1, "#cbd5e1");
    }
    ctx.fillStyle = grad;
    roundedRect(ctx, x + 0.6, y + press, w - 1.2, h - press - 2, radius);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = on ? rgba({ r: 15, g: 23, b: 42 }, 0.18) : "rgba(15, 23, 42, 0.16)";
    ctx.fillRect(x + w - 1.4, y + press, 1.2, h - press - 8);

    ctx.fillStyle = on ? rgba({ r: 15, g: 23, b: 42 }, 0.22) : "rgba(15, 23, 42, 0.2)";
    roundedRect(ctx, x + 1.2, y + h - 9, w - 2.4, 7, 3);
    ctx.fill();

    if (key.midi % 12 === 0) {
      ctx.fillStyle = on ? "rgba(255,255,255,0.7)" : "rgba(71, 85, 105, 0.7)";
      ctx.font = "600 9px Outfit, DM Sans, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(noteName(key.midi), key.cx, y + h - 14);
    }
    ctx.restore();
  }

  paintBlackKey(ctx, key, rgb, on, flash) {
    const { x, y, w, h } = key;
    const press = on ? 2 : 0;

    ctx.save();
    if (on) {
      ctx.shadowColor = rgba(rgb, 0.7 + flash * 0.3);
      ctx.shadowBlur = 20;
    }
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (on) {
      grad.addColorStop(0, rgba(mixToward(rgb, 255, 0.12), 1));
      grad.addColorStop(1, rgba(mixToward(rgb, 0, 0.35), 1));
    } else {
      grad.addColorStop(0, "#3a4558");
      grad.addColorStop(0.2, "#1b2434");
      grad.addColorStop(1, "#070b13");
    }
    ctx.fillStyle = grad;
    roundedRect(ctx, x, y + press, w, h - press, 4);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = on ? rgba({ r: 255, g: 255, b: 255 }, 0.22) : "rgba(255,255,255,0.12)";
    roundedRect(ctx, x + 1.4, y + press + 1.5, w - 2.8, h * 0.22, 2);
    ctx.fill();
    ctx.restore();
  }
}
