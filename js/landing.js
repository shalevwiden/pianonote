/**
 * Peak Notes landing — scroll reveals + one-octave clickable keyboard.
 */

const NOTES = [
  { midi: 60, name: "C", black: false },
  { midi: 61, name: "C♯", black: true },
  { midi: 62, name: "D", black: false },
  { midi: 63, name: "D♯", black: true },
  { midi: 64, name: "E", black: false },
  { midi: 65, name: "F", black: false },
  { midi: 66, name: "F♯", black: true },
  { midi: 67, name: "G", black: false },
  { midi: 68, name: "G♯", black: true },
  { midi: 69, name: "A", black: false },
  { midi: 70, name: "A♯", black: true },
  { midi: 71, name: "B", black: false },
];

const BLACK_LEFT = {
  61: 10.2,
  63: 24.6,
  66: 53.4,
  68: 67.8,
  70: 82.2,
};

/** C major arpeggio across the octave for the reveal wave (visual + optional soft tones). */
const WAVE_MIDI = [60, 64, 67, 71, 67, 64, 60];

let audioCtx = null;
let wavePlayed = false;

function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function playNote(midi, { soft = false } = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freq = midiToHz(midi);
  const peak = soft ? 0.08 : 0.22;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(peak, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + (soft ? 0.55 : 1.35));
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(9000, freq * 8 + 1200), now);
  filter.frequency.exponentialRampToValueAtTime(freq * 3, now + 0.8);
  filter.connect(master);

  for (const [type, ratio, gain, detune] of [
    ["triangle", 1, 0.7, 0],
    ["sine", 2, 0.22, 3],
    ["sine", 3, 0.1, -2],
  ]) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq * ratio;
    osc.detune.value = detune;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(filter);
    osc.start(now);
    osc.stop(now + (soft ? 0.6 : 1.4));
  }
}

function buildOctave() {
  const root = document.getElementById("landingOctave");
  const hint = document.getElementById("octaveHint");
  if (!root) return;

  root.innerHTML = "";
  const glow = document.createElement("div");
  glow.className = "landing-octave__glow";
  glow.setAttribute("aria-hidden", "true");

  const whites = document.createElement("div");
  whites.className = "landing-octave__whites";
  const blacks = document.createElement("div");
  blacks.className = "landing-octave__blacks";

  let whiteIndex = 0;
  for (const note of NOTES.filter((n) => !n.black)) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "landing-octave__key landing-octave__key--white";
    key.dataset.midi = String(note.midi);
    key.style.setProperty("--key-delay", `${0.05 + whiteIndex * 0.055}s`);
    key.setAttribute("aria-label", `${note.name}4`);
    key.innerHTML = `<span>${note.name}</span>`;
    whites.appendChild(key);
    whiteIndex += 1;
  }

  let blackIndex = 0;
  for (const note of NOTES.filter((n) => n.black)) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "landing-octave__key landing-octave__key--black";
    key.dataset.midi = String(note.midi);
    key.style.left = `${BLACK_LEFT[note.midi]}%`;
    key.style.setProperty("--key-delay", `${0.18 + blackIndex * 0.07}s`);
    key.setAttribute("aria-label", `${note.name}4`);
    blacks.appendChild(key);
    blackIndex += 1;
  }

  root.append(glow, whites, blacks);

  const press = (key, { soft = false } = {}) => {
    const midi = Number(key.dataset.midi);
    key.classList.add("is-active");
    if (!soft) key.classList.add("is-wave");
    playNote(midi, { soft });
    if (hint && !soft) {
      hint.innerHTML =
        'Keep going — or <a class="landing-octave__studio" href="app.html">open the full studio</a>';
    }
    window.setTimeout(() => {
      key.classList.remove("is-active");
      key.classList.remove("is-wave");
    }, soft ? 140 : 180);
  };

  root.addEventListener("pointerdown", (event) => {
    const key = event.target.closest(".landing-octave__key");
    if (!key) return;
    event.preventDefault();
    press(key);
  });

  observeOctave(root, press);
}

function runKeyWave(root, press) {
  if (wavePlayed) return;
  wavePlayed = true;

  const byMidi = new Map(
    [...root.querySelectorAll(".landing-octave__key")].map((el) => [
      Number(el.dataset.midi),
      el,
    ])
  );

  WAVE_MIDI.forEach((midi, index) => {
    window.setTimeout(() => {
      const key = byMidi.get(midi);
      if (!key) return;
      // Visual cascade only unless the user has already unlocked audio via a click.
      if (audioCtx && audioCtx.state === "running") {
        press(key, { soft: true });
      } else {
        key.classList.add("is-wave", "is-active");
        window.setTimeout(() => {
          key.classList.remove("is-wave", "is-active");
        }, 160);
      }
    }, 420 + index * 95);
  });
}

function observeOctave(root, press) {
  const playSection = document.getElementById("play");
  if (!playSection) {
    root.classList.add("is-assembled");
    return;
  }

  if (!("IntersectionObserver" in window)) {
    root.classList.add("is-assembled");
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        root.classList.add("is-assembled");
        window.setTimeout(() => runKeyWave(root, press), 520);
        observer.disconnect();
      }
    },
    { threshold: 0.35 }
  );

  observer.observe(playSection);
}

function initReveals() {
  const nodes = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
  );

  nodes.forEach((el) => observer.observe(el));
}

function initNavScroll() {
  const nav = document.querySelector(".landing-nav");
  const landing = document.body.classList.contains("landing")
    ? document.body
    : null;
  const banner = document.querySelector(".landing-banner");
  if (!nav) return;

  let lastY = window.scrollY;
  let goingUp = false;
  const onScroll = () => {
    const y = window.scrollY;
    if (y < lastY - 2) goingUp = true;
    else if (y > lastY + 2) goingUp = false;
    nav.classList.toggle("is-scrolled", y > 24);

    if (landing && banner) {
      const hide = y >= window.innerHeight && !goingUp;
      landing.classList.toggle("is-banner-away", hide);
      banner.setAttribute("aria-hidden", hide ? "true" : "false");
    }

    lastY = y;
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

const THEME_KEY = "psr-theme";

function setLandingTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") {
    setLandingTheme(saved);
  } else {
    setLandingTheme("light");
  }

  const toggle = document.getElementById("landingThemeToggle");
  toggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setLandingTheme(current === "dark" ? "light" : "dark");
  });
}

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

initTheme();
buildOctave();
initReveals();
initNavScroll();
