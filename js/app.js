import { MidiManager } from "./midi.js";
import { SessionRecorder } from "./recorder.js";
import { buildMidiFile, downloadMidi } from "./midi-writer.js";
import { PianoSynth, VOICES } from "./synth.js";
import { PianoKeyboardUI } from "./piano-ui.js";
import { ComputerKeyboard, DEFAULT_KEY_MAP, codeLabel } from "./keyboard.js";
import { noteName } from "./note-utils.js";
import {
  saveSession,
  listSessions,
  getSession,
  deleteSession,
  clearHistory,
  getHistoryStats,
  getStorageUsage,
  expandEvents,
  updateSessionMeta,
} from "./history.js";
import {
  DEFAULT_VIDEO_STYLE,
  VIDEO_LOOK_PRESETS,
  VIDEO_GRADIENT_PRESETS,
  VIDEO_FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  TAIL_MS,
  buildNoteTimeline,
  sessionDurationMs,
  renderCounterFrame,
  exportCounterVideo,
  downloadBlob,
  isVideoExportSupported,
} from "./video-export.js";

const $ = (id) => document.getElementById(id);

const STORAGE = {
  theme: "psr-theme",
  keymap: "psr-keymap",
  sound: "psr-sound",
  volume: "psr-volume",
  velocity: "psr-velocity",
  source: "psr-source",
  voice: "psr-voice",
  videoStyle: "psr-video-style-v2",
  pedalCount: "psr-pedal-count",
};

const ui = {
  themeToggle: $("themeToggle"),
  settingsBtn: $("btnSettings"),
  pedalCountToggle: $("pedalCountToggle"),
  heroCounterLabel: $("heroCounterLabel"),
  focusLabel: $("focusLabel"),
  navItems: document.querySelectorAll(".nav__item"),
  viewDashboard: $("viewDashboard"),
  viewHistory: $("viewHistory"),
  viewStats: $("viewStats"),
  viewAbout: $("viewAbout"),
  sourceButtons: document.querySelectorAll(".segmented__item"),
  midiDot: $("midiDot"),
  midiStatus: $("midiStatus"),
  deviceSelect: $("deviceSelect"),
  recordingPill: $("recordingPill"),
  recordingDot: $("recordingDot"),
  recordingLabel: $("recordingLabel"),
  noteCount: $("noteCount"),
  heroHint: $("heroHint"),
  statTotal: $("statTotal"),
  statNps: $("statNps"),
  statPeakNps: $("statPeakNps"),
  statElapsed: $("statElapsed"),
  btnRecord: $("btnRecord"),
  btnPause: $("btnPause"),
  btnResume: $("btnResume"),
  btnStop: $("btnStop"),
  focusView: $("focusView"),
  btnFocusEnter: $("btnFocusEnter"),
  btnFocusExit: $("btnFocusExit"),
  focusCount: $("focusCount"),
  focusNps: $("focusNps"),
  focusElapsed: $("focusElapsed"),
  focusPill: $("focusPill"),
  focusDot: $("focusDot"),
  focusStatus: $("focusStatus"),
  focusHint: $("focusHint"),
  btnFocusRecord: $("btnFocusRecord"),
  btnFocusPause: $("btnFocusPause"),
  btnFocusResume: $("btnFocusResume"),
  btnFocusStop: $("btnFocusStop"),
  btnExport: $("btnExport"),
  btnSaveVideo: $("btnSaveVideo"),
  btnSave: $("btnSave"),
  btnSaveLabel: $("btnSaveLabel"),
  btnReset: $("btnReset"),
  eventMeta: $("eventMeta"),
  footerSource: $("footerSource"),
  footerPedal: $("footerPedal"),
  nowPlaying: $("nowPlaying"),
  octaveValue: $("octaveValue"),
  btnOctaveDown: $("btnOctaveDown"),
  btnOctaveUp: $("btnOctaveUp"),
  soundToggle: $("soundToggle"),
  voiceSelect: $("voiceSelect"),
  voiceSelectSettings: $("voiceSelectSettings"),
  piano: $("piano"),
  pianoHint: $("pianoHint"),
  settingsModal: $("settingsModal"),
  velocityRange: $("velocityRange"),
  velocityValue: $("velocityValue"),
  volumeRange: $("volumeRange"),
  volumeValue: $("volumeValue"),
  keymapList: $("keymapList"),
  btnResetMapping: $("btnResetMapping"),
  toast: $("toast"),
  historyList: $("historyList"),
  historyDetailEmpty: $("historyDetailEmpty"),
  historyDetailBody: $("historyDetailBody"),
  detailDate: $("detailDate"),
  detailTitle: $("detailTitle"),
  detailDescription: $("detailDescription"),
  detailGrid: $("detailGrid"),
  detailNameInput: $("detailNameInput"),
  detailDescriptionInput: $("detailDescriptionInput"),
  sessionEditForm: $("sessionEditForm"),
  btnDetailSaveMeta: $("btnDetailSaveMeta"),
  btnDetailExport: $("btnDetailExport"),
  btnDetailVideo: $("btnDetailVideo"),
  btnDetailDelete: $("btnDetailDelete"),
  btnClearHistory: $("btnClearHistory"),
  statsSinceValue: $("statsSinceValue"),
  statsSinceSub: $("statsSinceSub"),
  statsTotalNotes: $("statsTotalNotes"),
  statsSessionCount: $("statsSessionCount"),
  statsPracticeTime: $("statsPracticeTime"),
  statsNotesToday: $("statsNotesToday"),
  statsPeakNps: $("statsPeakNps"),
  statsAvgNotes: $("statsAvgNotes"),
  statsExports: $("statsExports"),
  statsAvgDuration: $("statsAvgDuration"),
  statsStorage: $("statsStorage"),
  statsStorageNote: $("statsStorageNote"),
  videoModal: $("videoModal"),
  btnVideoClose: $("btnVideoClose"),
  videoPreview: $("videoPreview"),
  videoMeta: $("videoMeta"),
  videoCustomizePanel: $("videoCustomizePanel"),
  btnVideoCustomize: $("btnVideoCustomize"),
  videoLookPresets: $("videoLookPresets"),
  videoGradientPresets: $("videoGradientPresets"),
  videoTextMode: $("videoTextMode"),
  videoTextColor: $("videoTextColor"),
  videoTextColorEnd: $("videoTextColorEnd"),
  videoGradientRow: $("videoGradientRow"),
  videoAngleRow: $("videoAngleRow"),
  videoGradientAngle: $("videoGradientAngle"),
  videoGradientAngleValue: $("videoGradientAngleValue"),
  videoBgColor: $("videoBgColor"),
  videoProgressBlock: $("videoProgressBlock"),
  videoProgressFill: $("videoProgressFill"),
  videoProgressLabel: $("videoProgressLabel"),
  btnVideoRender: $("btnVideoRender"),
  btnVideoCancel: $("btnVideoCancel"),
  videoCompat: $("videoCompat"),
};

const midi = new MidiManager();
const session = new SessionRecorder();
const synth = new PianoSynth();

let inputSource = "keyboard";
let toastTimer = null;
let lockedNoteCount = 0;
let audioPromptShown = false;
/** Wall-clock start of the current take (Date.now). */
let sessionWallStart = null;
/** True once the current take has been written to History. */
let sessionSaved = false;
let selectedHistoryId = null;
let statsClockId = null;
/** Giant in-page counter view; deliberately not the browser Fullscreen API. */
let focusViewOpen = false;
let pedalCountMode = false;
let pedalScopedCount = 0;

/** Active video-editor payload (current take or History session). */
let videoEditor = {
  events: [],
  noteCount: 0,
  durationMs: 0,
  filenameBase: "piano-session",
  style: { ...DEFAULT_VIDEO_STYLE },
  rendering: false,
  cancelRequested: false,
};

const piano = new PianoKeyboardUI(ui.piano, {
  onNoteOn: (note) => {
    synth.resume();
    handleNoteOn(note, keyboard.velocity);
  },
  onNoteOff: (note) => handleNoteOff(note),
});

const keyboard = new ComputerKeyboard({
  onNoteOn: (note, velocity) => {
    synth.resume();
    handleNoteOn(note, velocity);
  },
  onNoteOff: (note) => handleNoteOff(note),
  onOctaveChange: () => {
    refreshKeyLabels();
    piano.scrollToNote(keyboard.baseNote);
  },
});

/* ---------------------------------------------------------------- formatting */

const formatCount = (n) => n.toLocaleString("en-US");
const formatNps = (n) => n.toFixed(1);

function formatElapsed(ms) {
  const tenths = Math.floor(ms / 100);
  const seconds = Math.floor(tenths / 10);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}.${tenths % 10}`;
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSince(ms) {
  if (ms == null) return "—";
  const elapsed = Math.max(0, Date.now() - ms);
  const days = Math.floor(elapsed / 86_400_000);
  const hours = Math.floor((elapsed % 86_400_000) / 3_600_000);
  const minutes = Math.floor((elapsed % 3_600_000) / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatDateTime(ms) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Custom name if set, otherwise the familiar datetime label. */
function sessionDisplayName(record) {
  const custom = record?.name?.trim();
  if (custom) return custom;
  return formatDateTime(record?.savedAt ?? Date.now());
}

function formatDay(ms) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function voiceLabel(id) {
  return VOICES.find((voice) => voice.id === id)?.label ?? id;
}

/* -------------------------------------------------------------------- notes */

function handleNoteOn(note, velocity = 100) {
  piano.setActive(note, true);
  synth.noteOn(note, velocity);
  ui.nowPlaying.textContent = noteName(note);
  registerPedalScopedNote();
  processMessage([0x90, note, velocity]);
}

function handleNoteOff(note) {
  // Keep the key lit while the damper pedal is holding the note.
  if (!synth.sustain) piano.setActive(note, false);
  synth.noteOff(note);
  if (piano.activeNotes.size === 0) ui.nowPlaying.textContent = "—";
  processMessage([0x80, note, 0]);
}

/** Single funnel for every source so recordings are identical either way. */
function processMessage(bytes, timeStamp) {
  const result = session.capture(bytes, timeStamp);
  if (!result) return;

  if (result.isNoteOn) {
    if (pedalCountMode) {
      ui.statTotal.textContent = formatCount(result.noteCount);
    } else {
      const label = formatCount(result.noteCount);
      ui.noteCount.textContent = label;
      ui.statTotal.textContent = label;
      if (ui.focusCount) ui.focusCount.textContent = label;
      flashCounter();
    }
  }
  updateControls();
}

/** Count notes only while Pedal count is on and the damper is held. */
function registerPedalScopedNote() {
  if (!pedalCountMode || !synth.sustain) return;
  pedalScopedCount += 1;
  const label = formatCount(pedalScopedCount);
  ui.noteCount.textContent = label;
  if (ui.focusCount) ui.focusCount.textContent = label;
  flashCounter();
}

function resetPedalScopedCount() {
  pedalScopedCount = 0;
  if (!pedalCountMode) return;
  const label = formatCount(0);
  ui.noteCount.textContent = label;
  if (ui.focusCount) ui.focusCount.textContent = label;
}

function setPedalCountMode(on, { persist = true } = {}) {
  pedalCountMode = Boolean(on);
  if (ui.pedalCountToggle) ui.pedalCountToggle.checked = pedalCountMode;
  if (persist) {
    localStorage.setItem(STORAGE.pedalCount, pedalCountMode ? "on" : "off");
  }

  if (pedalCountMode) {
    pedalScopedCount = 0;
    if (ui.heroCounterLabel) ui.heroCounterLabel.textContent = "This Pedal";
    if (ui.focusLabel) ui.focusLabel.textContent = "This Pedal";
  } else {
    if (ui.heroCounterLabel) ui.heroCounterLabel.textContent = "Notes Played";
    if (ui.focusLabel) ui.focusLabel.textContent = "Notes Played";
  }

  updateCounters();
  updateControls();
  if (!session.active) refreshIdleHint();
}

function refreshIdleHint() {
  if (session.active) return;
  if (pedalCountMode) {
    setHint("Pedal count — hold the damper and play; lift to reset.");
  } else if (session.hasData) {
    setHint("Session captured. Save, Export .mid, or Save Video.");
  } else {
    setHint("Press Record, then play your keyboard.");
  }
}

function handleDeviceMessage(event) {
  const data = event.data;
  if (!data || data.length === 0) return;

  const status = data[0] & 0xf0;
  const note = data[1];
  const isNoteOn = status === 0x90 && data.length >= 3 && data[2] > 0;

  if (isNoteOn) {
    unlockAudio();
    piano.setActive(note, true);
    synth.noteOn(note, data[2]);
    ui.nowPlaying.textContent = noteName(note);
    registerPedalScopedNote();
  } else if (status === 0x80 || (status === 0x90 && data[2] === 0)) {
    // Keep the key lit while the damper pedal is holding the note.
    if (!synth.sustain) piano.setActive(note, false);
    synth.noteOff(note);
    if (piano.activeNotes.size === 0) ui.nowPlaying.textContent = "—";
  } else if (status === 0xb0 && data.length >= 3 && data[1] === 64) {
    // CC64 damper / sustain pedal (MIDI on at ≥ 64; treat any >0 as down so
    // continuous/half pedals still engage before the midpoint).
    unlockAudio();
    const down = data[2] > 0;
    const released = synth.setSustain(down);
    for (const releasedNote of released) {
      piano.setActive(releasedNote, false);
    }
    if (!down && piano.activeNotes.size === 0) {
      ui.nowPlaying.textContent = "—";
    }
    updatePedalStatus(down);
    if (pedalCountMode && !down) resetPedalScopedCount();
  }

  processMessage(data, event.timeStamp);
}

function updatePedalStatus(down) {
  if (!ui.footerPedal) return;
  ui.footerPedal.hidden = !down;
}

function flashCounter() {
  for (const el of [ui.noteCount, ui.focusCount]) {
    if (!el) continue;
    el.classList.remove("is-hit");
    void el.offsetWidth; // restart the animation on rapid notes
    el.classList.add("is-hit");
  }
}

/**
 * Playing a MIDI instrument is not a browser gesture, so the audio context can
 * stay locked no matter how many notes arrive. Ask for a click once it is clear
 * that resuming on its own is not working.
 */
function unlockAudio() {
  synth.resume();

  if (!synth.enabled || !synth.isSuspended) {
    lockedNoteCount = 0;
    return;
  }

  lockedNoteCount += 1;
  if (lockedNoteCount >= 3 && !audioPromptShown) {
    audioPromptShown = true;
    showToast("Click anywhere on the page to enable sound");
  }
}

/* ------------------------------------------------------------------ display */

function updateCounters() {
  const sessionNotes = formatCount(session.noteCount);
  const displayNotes = pedalCountMode
    ? formatCount(pedalScopedCount)
    : sessionNotes;
  const nps = formatNps(session.getLiveNps());
  const elapsed = formatElapsed(session.getElapsedMs());

  ui.noteCount.textContent = displayNotes;
  ui.statTotal.textContent = sessionNotes;
  ui.statNps.textContent = nps;
  ui.statPeakNps.textContent = formatNps(session.peakNps);
  ui.statElapsed.textContent = elapsed;
  ui.eventMeta.textContent = `${formatCount(session.events.length)} events`;

  if (focusViewOpen) {
    if (ui.focusCount) ui.focusCount.textContent = displayNotes;
    if (ui.focusNps) ui.focusNps.textContent = nps;
    if (ui.focusElapsed) ui.focusElapsed.textContent = elapsed;
  }
}

function updateControls() {
  const active = session.active;
  const recording = session.recording;
  const paused = session.paused;
  const canPersist = session.hasData && !active;

  ui.btnRecord.hidden = active;
  ui.btnPause.hidden = !recording;
  ui.btnResume.hidden = !paused;
  ui.btnStop.hidden = !active;
  ui.btnExport.disabled = !canPersist;
  ui.btnSaveVideo.disabled = !canPersist;
  ui.btnReset.disabled = active || !session.hasData;

  ui.recordingPill.hidden = !active;
  if (ui.recordingLabel) {
    ui.recordingLabel.textContent = paused ? "Paused" : "Recording";
  }
  if (ui.recordingDot) {
    ui.recordingDot.classList.toggle("status-bar__dot--recording", recording);
    ui.recordingDot.classList.toggle("status-bar__dot--paused", paused);
  }

  if (ui.btnFocusRecord) ui.btnFocusRecord.hidden = active;
  if (ui.btnFocusPause) ui.btnFocusPause.hidden = !recording;
  if (ui.btnFocusResume) ui.btnFocusResume.hidden = !paused;
  if (ui.btnFocusStop) ui.btnFocusStop.hidden = !active;
  if (ui.focusPill) {
    ui.focusPill.hidden = !active;
    ui.focusPill.classList.toggle("is-paused", paused);
  }
  if (ui.focusStatus) {
    ui.focusStatus.textContent = paused ? "Paused" : "Recording";
  }
  if (ui.focusDot) {
    ui.focusDot.classList.toggle("status-bar__dot--recording", recording);
    ui.focusDot.classList.toggle("status-bar__dot--paused", paused);
  }
  if (ui.focusHint) {
    ui.focusHint.textContent = active
      ? "Space pauses or resumes · Esc stops the take"
      : session.hasData
        ? "Go back to save the take, export MIDI, or render a video."
        : "Press Record or hit Space to start counting.";
  }

  updateSaveButton(canPersist);
}

function setFocusView(open) {
  if (!ui.focusView) return;
  focusViewOpen = open;
  ui.focusView.hidden = !open;
  document.body.classList.toggle("is-focus-view", open);
  if (open) {
    updateCounters();
    updateControls();
    ui.btnFocusExit?.focus({ preventScroll: true });
  } else {
    ui.btnFocusEnter?.focus({ preventScroll: true });
  }
}

function updateSaveButton(canPersist) {
  if (!ui.btnSave) return;

  ui.btnSave.classList.toggle("btn--saved", sessionSaved);
  if (sessionSaved) {
    ui.btnSave.disabled = true;
    ui.btnSaveLabel.textContent = "Saved";
    ui.btnSave.title = "This take is already in History. Export also saves automatically.";
    return;
  }

  ui.btnSave.disabled = !canPersist;
  ui.btnSaveLabel.textContent = "Save";
  ui.btnSave.title = canPersist
    ? "Save this session to History without exporting"
    : "Stop a recording with notes before saving";
}

function setInputSource(source, { persist = false } = {}) {
  if (inputSource === source) return;
  inputSource = source;
  if (persist) localStorage.setItem(STORAGE.source, source);
  piano.clearActive();
  synth.allNotesOff();
  updateSourceUi();
}

function updateSourceUi() {
  for (const button of ui.sourceButtons) {
    button.classList.toggle("is-active", button.dataset.source === inputSource);
  }

  const usingKeyboard = inputSource === "keyboard";
  keyboard.setEnabled(usingKeyboard);

  const live = [];
  if (usingKeyboard) live.push("Computer keyboard");
  if (midi.activeInput) live.push(midi.activeInput.name || "MIDI device");
  ui.footerSource.textContent = live.join(" + ") || "No input";
  ui.pianoHint.hidden = !usingKeyboard;

  refreshKeyLabels();
  updateMidiStatus();
}

function refreshKeyLabels() {
  piano.setKeyLabels(
    inputSource === "keyboard" ? keyboard.getNoteLabels() : new Map()
  );
  ui.octaveValue.textContent = noteName(keyboard.baseNote);
}

function updateMidiStatus() {
  ui.midiDot.className = "status-bar__dot";

  if (!midi.supported) {
    ui.midiDot.classList.add("status-bar__dot--warn");
    ui.midiStatus.textContent = "Web MIDI unavailable";
  } else if (midi.activeInput) {
    ui.midiDot.classList.add("status-bar__dot--ok");
    ui.midiStatus.textContent = midi.activeInput.name || "MIDI connected";
  } else if (midi.inputs.length === 0) {
    ui.midiDot.classList.add("status-bar__dot--warn");
    ui.midiStatus.textContent = "No MIDI devices";
  } else {
    ui.midiStatus.textContent = "Select a device";
  }

  updateControls();
}

function setHint(text) {
  ui.heroHint.textContent = text;
}

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.hidden = false;
  ui.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast.classList.remove("is-visible");
    toastTimer = setTimeout(() => {
      ui.toast.hidden = true;
    }, 220);
  }, 2600);
}

/* ---------------------------------------------------------------- recording */

function startRecording() {
  synth.resume();
  session.start();
  sessionWallStart = Date.now();
  sessionSaved = false;
  updateCounters();
  updateControls();
  setHint("Recording — Space pauses, Stop ends the take.");
}

function pauseRecording() {
  if (!session.recording) return;
  session.pause();
  updateCounters();
  updateControls();
  setHint("Paused — the clock keeps running as a gap. Space or Resume to continue.");
}

function resumeRecording() {
  if (!session.paused) return;
  session.resume();
  updateCounters();
  updateControls();
  setHint("Recording — every note is counted and captured.");
}

function stopRecording() {
  if (!session.active) return;
  session.stop();
  updateCounters();
  updateControls();
  refreshIdleHint();
}

function resetSession() {
  session.reset();
  sessionWallStart = null;
  sessionSaved = false;
  updateCounters();
  updateControls();
  refreshIdleHint();
}

function buildSessionDraft({ exported = false } = {}) {
  const endedAt = Date.now();
  const startedAt = sessionWallStart ?? endedAt - session.getElapsedMs();
  return {
    startedAt,
    endedAt,
    durationMs: session.getElapsedMs(),
    noteCount: session.noteCount,
    peakNps: session.peakNps,
    events: session.events,
    source: inputSource,
    voice: synth.voiceId,
    deviceName: midi.activeInput?.name ?? "",
    exported,
    pauseCount: session.pauseCount,
    pauseSpans: session.pauseSpans,
  };
}

function persistCurrentSession({ exported = false } = {}) {
  if (!session.hasData || session.active) {
    showToast("Nothing to save yet");
    return null;
  }
  if (sessionSaved && !exported) {
    showToast("Already saved to History");
    return null;
  }

  try {
    const record = saveSession(buildSessionDraft({ exported }));
    sessionSaved = true;
    updateControls();
    renderHistory();
    renderStats();
    return record;
  } catch (error) {
    console.error(error);
    showToast("Could not save — storage may be full");
    return null;
  }
}

function saveCurrentSession() {
  const record = persistCurrentSession({ exported: false });
  if (!record) return;
  showToast(
    `Saved ${formatCount(record.noteCount)} notes · ${formatClock(record.durationMs)}`
  );
  setHint("Saved to History. You can still Export .mid from this take.");
}

function exportMidi() {
  if (!session.hasData) {
    showToast("Nothing recorded yet");
    return;
  }

  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const filename = `piano-session-${stamp.getFullYear()}${pad(
    stamp.getMonth() + 1
  )}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(
    stamp.getMinutes()
  )}${pad(stamp.getSeconds())}.mid`;

  const bytes = buildMidiFile(session.events, {
    trackName: "Peak Notes",
    bpm: 120,
  });

  downloadMidi(bytes, filename);

  // Export always writes History so the take is not lost after download.
  const didSave = !sessionSaved;
  if (didSave) {
    persistCurrentSession({ exported: true });
  }

  showToast(
    didSave
      ? `Exported & saved · ${formatCount(session.noteCount)} notes · ${formatCount(bytes.length)} bytes`
      : `Exported ${formatCount(session.noteCount)} notes · ${formatCount(bytes.length)} bytes`
  );
  setHint(
    didSave
      ? "Exported .mid and saved to History."
      : "Exported .mid. This take was already in History."
  );
}

/* ----------------------------------------------------------------- settings */

/**
 * Reads a stored number, falling back when the key was never written.
 * Note that Number(null) is 0 rather than NaN, so an unset key has to be
 * detected before parsing or every default silently becomes zero.
 */
function readStoredNumber(key, fallback, min, max) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function loadSettings() {
  const savedMap = localStorage.getItem(STORAGE.keymap);
  if (savedMap) {
    try {
      keyboard.setMapping(JSON.parse(savedMap));
    } catch {
      keyboard.resetMapping();
    }
  }

  keyboard.velocity = readStoredNumber(STORAGE.velocity, 100, 20, 127);
  ui.velocityRange.value = String(keyboard.velocity);
  ui.velocityValue.textContent = String(keyboard.velocity);

  const resolvedVolume = readStoredNumber(STORAGE.volume, 70, 0, 100);
  synth.setVolume(resolvedVolume / 100);
  ui.volumeRange.value = String(resolvedVolume);
  ui.volumeValue.textContent = String(resolvedVolume);

  const soundOn = localStorage.getItem(STORAGE.sound) !== "off";
  synth.setEnabled(soundOn);
  ui.soundToggle.checked = soundOn;

  setPedalCountMode(localStorage.getItem(STORAGE.pedalCount) === "on", {
    persist: false,
  });

  const savedVoice = localStorage.getItem(STORAGE.voice);
  const voiceId = VOICES.some((voice) => voice.id === savedVoice)
    ? savedVoice
    : "piano";
  setVoice(voiceId, { persist: false });

  const savedSource = localStorage.getItem(STORAGE.source);
  if (savedSource === "midi" || savedSource === "keyboard") {
    inputSource = savedSource;
  }
}

function setVoice(voiceId, { persist = true } = {}) {
  synth.setVoice(voiceId);
  if (ui.voiceSelect) ui.voiceSelect.value = voiceId;
  if (ui.voiceSelectSettings) ui.voiceSelectSettings.value = voiceId;
  if (persist) localStorage.setItem(STORAGE.voice, voiceId);
}

function saveMapping() {
  localStorage.setItem(STORAGE.keymap, JSON.stringify(keyboard.keyMap));
}

function renderKeymap() {
  ui.keymapList.innerHTML = "";

  const entries = Object.entries(keyboard.keyMap).sort((a, b) => a[1] - b[1]);

  for (const [code, semitone] of entries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "keymap__row";
    row.dataset.semitone = String(semitone);

    const label = document.createElement("span");
    label.className = "keymap__note";
    label.textContent = noteName(keyboard.baseNote + semitone);

    const key = document.createElement("kbd");
    key.className = "keymap__key";
    key.textContent = codeLabel(code);

    row.append(label, key);
    row.addEventListener("click", () => beginRebind(row, key, semitone));
    ui.keymapList.appendChild(row);
  }
}

function beginRebind(row, keyElement, semitone) {
  ui.keymapList
    .querySelectorAll(".keymap__row.is-listening")
    .forEach((el) => el.classList.remove("is-listening"));

  row.classList.add("is-listening");
  keyElement.textContent = "Press…";

  keyboard.captureNextKey(semitone, (code) => {
    if (code) {
      const next = Object.fromEntries(
        Object.entries(keyboard.keyMap).filter(([existing]) => existing !== code)
      );
      const previous = Object.entries(next).find(
        ([, value]) => value === semitone
      );
      if (previous) delete next[previous[0]];
      next[code] = semitone;
      keyboard.setMapping(next);
      saveMapping();
    }
    renderKeymap();
    refreshKeyLabels();
  });
}

/* --------------------------------------------------------------------- init */

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE.theme, theme);
}

function initTheme() {
  const saved = localStorage.getItem(STORAGE.theme);
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
    return;
  }
  setTheme("light");
}

function setView(view) {
  ui.viewDashboard.hidden = view !== "dashboard";
  ui.viewHistory.hidden = view !== "history";
  ui.viewStats.hidden = view !== "stats";
  ui.viewAbout.hidden = view !== "about";
  for (const item of ui.navItems) {
    item.classList.toggle("is-active", item.dataset.view === view);
  }

  if (view === "history") renderHistory();
  if (view === "stats") {
    renderStats();
    startStatsClock();
  } else {
    stopStatsClock();
  }
}

/* ----------------------------------------------------------- history / stats */

function renderHistory() {
  if (!ui.historyList) return;
  const sessions = listSessions();
  ui.historyList.innerHTML = "";

  if (sessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "session-list__empty";
    empty.textContent =
      "No saved sessions yet. Stop a recording, then hit Save — or Export .mid, which saves automatically.";
    ui.historyList.appendChild(empty);
    selectedHistoryId = null;
    showHistoryDetail(null);
    return;
  }

  if (!selectedHistoryId || !sessions.some((s) => s.id === selectedHistoryId)) {
    selectedHistoryId = sessions[0].id;
  }

  for (const record of sessions) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "session-card";
    card.setAttribute("role", "listitem");
    if (record.id === selectedHistoryId) card.classList.add("is-active");

    const when = document.createElement("div");
    when.className = "session-card__when";
    when.append(document.createTextNode(sessionDisplayName(record)));
    if (record.exported) {
      const badge = document.createElement("span");
      badge.className = "session-card__badge";
      badge.textContent = "Exported";
      when.appendChild(badge);
    }

    const notes = document.createElement("div");
    notes.className = "session-card__notes";
    notes.textContent = `${formatCount(record.noteCount)} notes`;

    const meta = document.createElement("div");
    meta.className = "session-card__meta";
    meta.textContent = [
      formatDay(record.startedAt),
      formatClock(record.durationMs),
      voiceLabel(record.voice),
    ].join(" · ");

    card.append(when, notes, meta);

    const blurb = record.description?.trim();
    if (blurb) {
      const desc = document.createElement("div");
      desc.className = "session-card__blurb";
      desc.textContent = blurb;
      card.appendChild(desc);
    }
    card.addEventListener("click", () => {
      selectedHistoryId = record.id;
      renderHistory();
    });
    ui.historyList.appendChild(card);
  }

  showHistoryDetail(getSession(selectedHistoryId));
}

function showHistoryDetail(record) {
  if (!ui.historyDetailBody) return;

  if (!record) {
    ui.historyDetailEmpty.hidden = false;
    ui.historyDetailBody.hidden = true;
    return;
  }

  ui.historyDetailEmpty.hidden = true;
  ui.historyDetailBody.hidden = false;
  ui.detailDate.textContent = formatDay(record.startedAt);
  ui.detailTitle.textContent = sessionDisplayName(record);

  const description = record.description?.trim() ?? "";
  if (ui.detailDescription) {
    ui.detailDescription.hidden = !description;
    ui.detailDescription.textContent = description;
  }

  const defaultName = formatDateTime(record.savedAt);
  if (ui.detailNameInput) {
    ui.detailNameInput.value = record.name?.trim() ?? "";
    ui.detailNameInput.placeholder = defaultName;
    ui.detailNameInput.dataset.sessionId = record.id;
  }
  if (ui.detailDescriptionInput) {
    ui.detailDescriptionInput.value = record.description ?? "";
  }

  const rows = [
    ["Notes", formatCount(record.noteCount)],
    ["Duration", formatClock(record.durationMs)],
    ["Peak NPS", formatNps(record.peakNps)],
    ["Avg NPS", formatNps(record.avgNps)],
    ["Events", formatCount(record.eventCount)],
    ["Voice", voiceLabel(record.voice)],
    ["Input", record.source === "midi" ? "MIDI device" : "Computer keyboard"],
    ["Device", record.deviceName || "—"],
    ["Started", formatDateTime(record.startedAt)],
    ["Ended", formatDateTime(record.endedAt)],
    ["Saved", formatDateTime(record.savedAt)],
    ["Pauses", formatCount(record.pauseCount ?? 0)],
    ["Exported", record.exported ? "Yes" : "No"],
  ];

  ui.detailGrid.innerHTML = "";
  for (const [label, value] of rows) {
    const item = document.createElement("div");
    item.className = "session-detail__item";
    item.innerHTML = `<div class="session-detail__label">${label}</div><div class="session-detail__value"></div>`;
    item.querySelector(".session-detail__value").textContent = value;
    ui.detailGrid.appendChild(item);
  }

  const hasEvents = Boolean(record.events?.length);
  ui.btnDetailExport.disabled = !hasEvents;
  ui.btnDetailExport.dataset.sessionId = record.id;
  if (ui.btnDetailVideo) {
    ui.btnDetailVideo.disabled = !hasEvents;
    ui.btnDetailVideo.dataset.sessionId = record.id;
  }
  ui.btnDetailDelete.dataset.sessionId = record.id;
}

function exportHistorySession(id) {
  const record = getSession(id);
  if (!record?.events?.length) {
    showToast("This session has no MIDI data to export");
    return;
  }

  const stamp = new Date(record.startedAt);
  const pad = (n) => String(n).padStart(2, "0");
  const filename = `piano-session-${stamp.getFullYear()}${pad(
    stamp.getMonth() + 1
  )}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(
    stamp.getMinutes()
  )}${pad(stamp.getSeconds())}.mid`;

  const bytes = buildMidiFile(expandEvents(record.events), {
    trackName: "Peak Notes",
    bpm: 120,
  });
  downloadMidi(bytes, filename);
  showToast(`Exported ${formatCount(record.noteCount)} notes from History`);
}

function sessionFilenameBase(date = new Date()) {
  const stamp = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `piano-session-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
    stamp.getDate()
  )}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(
    stamp.getSeconds()
  )}`;
}

function loadVideoStyle() {
  try {
    const raw = localStorage.getItem(STORAGE.videoStyle);
    if (!raw) return { ...DEFAULT_VIDEO_STYLE };
    return { ...DEFAULT_VIDEO_STYLE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VIDEO_STYLE };
  }
}

function persistVideoStyle(style) {
  localStorage.setItem(STORAGE.videoStyle, JSON.stringify(style));
}

function readVideoStyleFromForm() {
  return {
    ...DEFAULT_VIDEO_STYLE,
    textMode: ui.videoTextMode?.value === "solid" ? "solid" : "gradient",
    textColor: ui.videoTextColor?.value || DEFAULT_VIDEO_STYLE.textColor,
    textColorEnd: ui.videoTextColorEnd?.value || DEFAULT_VIDEO_STYLE.textColorEnd,
    gradientAngle: Number(ui.videoGradientAngle?.value ?? DEFAULT_VIDEO_STYLE.gradientAngle),
    backgroundColor: ui.videoBgColor?.value || DEFAULT_VIDEO_STYLE.backgroundColor,
  };
}

function applyVideoStyleToForm(style) {
  const s = { ...DEFAULT_VIDEO_STYLE, ...style };
  if (ui.videoTextMode) ui.videoTextMode.value = s.textMode;
  if (ui.videoTextColor) ui.videoTextColor.value = s.textColor;
  if (ui.videoTextColorEnd) ui.videoTextColorEnd.value = s.textColorEnd;
  if (ui.videoGradientAngle) ui.videoGradientAngle.value = String(s.gradientAngle);
  if (ui.videoGradientAngleValue) {
    ui.videoGradientAngleValue.textContent = `${s.gradientAngle}°`;
  }
  if (ui.videoBgColor) ui.videoBgColor.value = s.backgroundColor;
  updateVideoGradientVisibility();
  syncVideoPresetSelection(s);
}

function updateVideoGradientVisibility() {
  const gradient = ui.videoTextMode?.value !== "solid";
  if (ui.videoGradientRow) ui.videoGradientRow.hidden = !gradient;
  if (ui.videoAngleRow) ui.videoAngleRow.hidden = !gradient;
}

function setVideoCustomizeOpen(open) {
  if (ui.videoCustomizePanel) ui.videoCustomizePanel.hidden = !open;
  if (ui.btnVideoCustomize) {
    ui.btnVideoCustomize.setAttribute("aria-expanded", open ? "true" : "false");
    ui.btnVideoCustomize.classList.toggle("is-active", open);
    ui.btnVideoCustomize.textContent = open ? "Hide customization" : "Customization";
  }
}

function presetButtonHtml(preset, kind) {
  const bg = preset.backgroundColor;
  const start = preset.textColor;
  const end = preset.textMode === "gradient" ? preset.textColorEnd : preset.textColor;
  const swatch =
    preset.textMode === "gradient"
      ? `linear-gradient(135deg, ${start}, ${end})`
      : start;
  return `
    <button
      type="button"
      class="video-preset"
      data-preset-kind="${kind}"
      data-preset-id="${preset.id}"
      title="${preset.label}"
      aria-label="${preset.label}"
    >
      <span class="video-preset__frame" style="background:${bg}">
        <span class="video-preset__num" style="background:${swatch}"></span>
      </span>
      <span class="video-preset__label">${preset.label}</span>
    </button>
  `;
}

function renderVideoPresets() {
  if (ui.videoLookPresets) {
    ui.videoLookPresets.innerHTML = VIDEO_LOOK_PRESETS.map((p) =>
      presetButtonHtml(p, "look")
    ).join("");
  }
  if (ui.videoGradientPresets) {
    ui.videoGradientPresets.innerHTML = VIDEO_GRADIENT_PRESETS.map((p) =>
      presetButtonHtml(p, "gradient")
    ).join("");
  }
}

function findMatchingPreset(style) {
  const s = { ...DEFAULT_VIDEO_STYLE, ...style };
  const looks = VIDEO_LOOK_PRESETS.find(
    (p) =>
      p.textMode === s.textMode &&
      p.textColor.toLowerCase() === s.textColor.toLowerCase() &&
      p.backgroundColor.toLowerCase() === s.backgroundColor.toLowerCase()
  );
  if (looks) return { kind: "look", id: looks.id };
  const grads = VIDEO_GRADIENT_PRESETS.find(
    (p) =>
      p.textMode === s.textMode &&
      p.textColor.toLowerCase() === s.textColor.toLowerCase() &&
      p.textColorEnd.toLowerCase() === s.textColorEnd.toLowerCase() &&
      p.backgroundColor.toLowerCase() === s.backgroundColor.toLowerCase()
  );
  if (grads) return { kind: "gradient", id: grads.id };
  return null;
}

function syncVideoPresetSelection(style) {
  const match = findMatchingPreset(style);
  for (const btn of document.querySelectorAll(".video-preset")) {
    const active =
      match &&
      btn.dataset.presetKind === match.kind &&
      btn.dataset.presetId === match.id;
    btn.classList.toggle("is-active", Boolean(active));
  }
}

function applyVideoPreset(kind, id) {
  const list = kind === "gradient" ? VIDEO_GRADIENT_PRESETS : VIDEO_LOOK_PRESETS;
  const preset = list.find((item) => item.id === id);
  if (!preset) return;
  applyVideoStyleToForm({
    ...readVideoStyleFromForm(),
    ...preset,
  });
  updateVideoPreview();
}

function updateVideoPreview() {
  if (!ui.videoPreview) return;
  const style = readVideoStyleFromForm();
  videoEditor.style = style;
  persistVideoStyle(style);

  const timeline = buildNoteTimeline(videoEditor.events);
  const contentMs = Math.max(
    videoEditor.durationMs,
    sessionDurationMs(videoEditor.events, timeline)
  );
  // Preview the final count with a settled hit animation.
  const count = timeline.length
    ? timeline[timeline.length - 1].count
    : videoEditor.noteCount;
  const canvas = ui.videoPreview;
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;
  renderCounterFrame(ctx, { count, hitProgress: 1, style });

  const totalMs = contentMs + TAIL_MS;
  const frames = Math.max(1, Math.ceil((totalMs / 1000) * VIDEO_FPS) + 1);
  if (ui.videoMeta) {
    ui.videoMeta.textContent = `${VIDEO_WIDTH}×${VIDEO_HEIGHT} · ${VIDEO_FPS} fps · ${formatClock(
      contentMs
    )} (+${formatClock(TAIL_MS)} tail) · ${formatCount(frames)} frames · ${formatCount(
      count
    )} notes · silent MP4`;
  }
}

async function openVideoEditor({ events, noteCount, durationMs, filenameBase }) {
  if (!ui.videoModal) return;
  if (!events?.length) {
    showToast("Nothing to render yet");
    return;
  }

  videoEditor = {
    events,
    noteCount: noteCount ?? 0,
    durationMs: durationMs ?? 0,
    filenameBase: filenameBase || sessionFilenameBase(),
    style: loadVideoStyle(),
    rendering: false,
    cancelRequested: false,
  };

  applyVideoStyleToForm(videoEditor.style);
  setVideoCustomizeOpen(false);
  setVideoRenderUi(false);
  if (ui.videoProgressBlock) ui.videoProgressBlock.hidden = true;
  if (ui.videoProgressFill) ui.videoProgressFill.style.width = "0%";
  if (ui.videoProgressLabel) ui.videoProgressLabel.textContent = "Ready";

  const supported = await isVideoExportSupported();
  if (ui.videoCompat) {
    ui.videoCompat.hidden = supported;
    ui.videoCompat.textContent = supported
      ? ""
      : "H.264 / WebCodecs encoding is unavailable here. Use Chrome or Edge to download an MP4.";
  }
  if (ui.btnVideoRender) ui.btnVideoRender.disabled = !supported;

  keyboard.setEnabled(false);
  updateVideoPreview();
  ui.videoModal.showModal();
}

function closeVideoEditor() {
  if (videoEditor.rendering) {
    videoEditor.cancelRequested = true;
  }
  ui.videoModal?.close();
}

function setVideoRenderUi(rendering) {
  videoEditor.rendering = rendering;
  if (ui.btnVideoRender) {
    ui.btnVideoRender.disabled = rendering;
    ui.btnVideoRender.textContent = rendering ? "Rendering…" : "Download MP4";
  }
  if (ui.btnVideoCancel) ui.btnVideoCancel.hidden = !rendering;
  const controls = [
    ui.videoTextMode,
    ui.videoTextColor,
    ui.videoTextColorEnd,
    ui.videoGradientAngle,
    ui.videoBgColor,
  ];
  for (const el of controls) {
    if (el) el.disabled = rendering;
  }
  for (const swatch of document.querySelectorAll(".video-swatch")) {
    swatch.disabled = rendering;
  }
  for (const preset of document.querySelectorAll(".video-preset")) {
    preset.disabled = rendering;
  }
  if (ui.btnVideoCustomize) ui.btnVideoCustomize.disabled = rendering;
}

async function startVideoRender() {
  if (videoEditor.rendering) return;
  const style = readVideoStyleFromForm();
  videoEditor.style = style;
  persistVideoStyle(style);
  videoEditor.cancelRequested = false;
  setVideoRenderUi(true);
  if (ui.videoProgressBlock) ui.videoProgressBlock.hidden = false;
  if (ui.videoProgressFill) ui.videoProgressFill.style.width = "0%";
  if (ui.videoProgressLabel) ui.videoProgressLabel.textContent = "Encoding…";

  try {
    const blob = await exportCounterVideo({
      events: videoEditor.events,
      style,
      previewCanvas: ui.videoPreview,
      shouldCancel: () => videoEditor.cancelRequested,
      onProgress: ({ ratio, frame, totalFrames, count }) => {
        if (ui.videoProgressFill) {
          ui.videoProgressFill.style.width = `${Math.round(ratio * 100)}%`;
        }
        if (ui.videoProgressLabel) {
          ui.videoProgressLabel.textContent = `Frame ${formatCount(frame)} / ${formatCount(
            totalFrames
          )} · count ${formatCount(count)}`;
        }
      },
    });

    downloadBlob(blob, `${videoEditor.filenameBase}.mp4`);
    showToast("MP4 downloaded — silent counter video");
    if (ui.videoProgressLabel) ui.videoProgressLabel.textContent = "Done";
  } catch (error) {
    if (error?.name === "AbortError") {
      showToast("Video export cancelled");
      if (ui.videoProgressLabel) ui.videoProgressLabel.textContent = "Cancelled";
    } else {
      console.error(error);
      showToast(error?.message || "Video export failed");
      if (ui.videoProgressLabel) {
        ui.videoProgressLabel.textContent = error?.message || "Failed";
      }
    }
  } finally {
    setVideoRenderUi(false);
    updateVideoPreview();
  }
}

function openCurrentSessionVideo() {
  if (!session.hasData || session.active) {
    showToast("Stop the take before saving a video");
    return;
  }
  openVideoEditor({
    events: session.events,
    noteCount: session.noteCount,
    durationMs: session.getElapsedMs(),
    filenameBase: sessionFilenameBase(sessionWallStart ?? Date.now()),
  });
}

function openHistorySessionVideo(id) {
  const record = getSession(id);
  if (!record?.events?.length) {
    showToast("This session has no data to render");
    return;
  }
  openVideoEditor({
    events: expandEvents(record.events),
    noteCount: record.noteCount,
    durationMs: record.durationMs,
    filenameBase: sessionFilenameBase(record.startedAt),
  });
}

function renderStats() {
  const stats = getHistoryStats();
  ui.statsTotalNotes.textContent = formatCount(stats.totalNotes);
  ui.statsSessionCount.textContent = formatCount(stats.sessionCount);
  ui.statsPracticeTime.textContent = formatClock(stats.totalDurationMs);
  ui.statsNotesToday.textContent = formatCount(stats.notesToday);
  ui.statsPeakNps.textContent = formatNps(stats.peakNps);
  ui.statsAvgNotes.textContent = formatCount(Math.round(stats.avgNotesPerSession));
  ui.statsExports.textContent = formatCount(stats.exportedCount);
  ui.statsAvgDuration.textContent = formatClock(stats.avgDurationMs);

  if (stats.lastSavedAt == null) {
    ui.statsSinceValue.textContent = "—";
    ui.statsSinceSub.textContent = "No sessions saved yet";
  } else {
    ui.statsSinceValue.textContent = formatSince(stats.lastSavedAt);
    ui.statsSinceSub.textContent = `Last save · ${formatDateTime(stats.lastSavedAt)}`;
  }

  renderStorageUsage();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderStorageUsage() {
  if (!ui.statsStorage) return;
  const usage = getStorageUsage();
  ui.statsStorage.textContent = formatBytes(usage.bytes);
  if (ui.statsStorageNote) {
    const percent = ((usage.bytes / usage.quotaBytes) * 100).toFixed(1);
    ui.statsStorageNote.textContent = usage.sessionCount
      ? `${percent}% of the ~5 MB browser budget · ${formatCount(
          usage.sessionsWithEvents
        )} of ${formatCount(usage.sessionCount)} keep MIDI data`
      : "Saved on this device only";
  }
}

function startStatsClock() {
  stopStatsClock();
  statsClockId = setInterval(renderStats, 1000);
}

function stopStatsClock() {
  if (statsClockId) {
    clearInterval(statsClockId);
    statsClockId = null;
  }
}

function populateDevices(inputs) {
  ui.deviceSelect.innerHTML = "";
  ui.deviceSelect.disabled = inputs.length === 0;

  if (inputs.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No devices";
    ui.deviceSelect.appendChild(option);
    return;
  }

  for (const input of inputs) {
    const option = document.createElement("option");
    option.value = input.id;
    option.textContent = input.name || input.manufacturer || "MIDI device";
    ui.deviceSelect.appendChild(option);
  }

  if (midi.activeInput) ui.deviceSelect.value = midi.activeInput.id;
}

async function initMidi() {
  if (!midi.supported) {
    updateMidiStatus();
    return;
  }

  midi.onDevicesChanged = populateDevices;
  midi.onStateChange = updateMidiStatus;
  midi.onMessage = handleDeviceMessage;

  try {
    await midi.connect();
    // Connecting an instrument must never silence the computer keyboard: a
    // MIDI device always plays, so the toggle only decides whether QWERTY is
    // live, and that stays the user's choice.
    updateSourceUi();
  } catch (error) {
    console.error(error);
    ui.midiDot.className = "status-bar__dot status-bar__dot--warn";
    ui.midiStatus.textContent = "MIDI permission denied";
    showToast("MIDI access was denied — computer keyboard still works");
  }
}

function bindUi() {
  ui.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  });

  for (const item of ui.navItems) {
    item.addEventListener("click", () => setView(item.dataset.view));
  }

  for (const button of ui.sourceButtons) {
    button.addEventListener("click", () =>
      setInputSource(button.dataset.source, { persist: true })
    );
  }

  ui.deviceSelect.addEventListener("change", () => {
    midi.selectInput(ui.deviceSelect.value || null);
    updateSourceUi();
  });

  ui.btnRecord.addEventListener("click", startRecording);
  ui.btnPause?.addEventListener("click", pauseRecording);
  ui.btnResume?.addEventListener("click", resumeRecording);
  ui.btnStop.addEventListener("click", stopRecording);

  ui.btnFocusEnter?.addEventListener("click", () => setFocusView(true));
  ui.btnFocusExit?.addEventListener("click", () => setFocusView(false));
  ui.btnFocusRecord?.addEventListener("click", startRecording);
  ui.btnFocusPause?.addEventListener("click", pauseRecording);
  ui.btnFocusResume?.addEventListener("click", resumeRecording);
  ui.btnFocusStop?.addEventListener("click", stopRecording);
  ui.btnExport.addEventListener("click", exportMidi);
  ui.btnSaveVideo?.addEventListener("click", openCurrentSessionVideo);
  ui.btnSave?.addEventListener("click", saveCurrentSession);
  ui.btnReset.addEventListener("click", resetSession);

  ui.btnClearHistory?.addEventListener("click", () => {
    if (!listSessions().length) {
      showToast("History is already empty");
      return;
    }
    if (!confirm("Delete every saved session? This cannot be undone.")) return;
    clearHistory();
    selectedHistoryId = null;
    renderHistory();
    renderStats();
    showToast("History cleared");
  });

  ui.btnDetailExport?.addEventListener("click", () => {
    exportHistorySession(ui.btnDetailExport.dataset.sessionId);
  });

  ui.sessionEditForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const id =
      ui.detailNameInput?.dataset.sessionId ||
      ui.btnDetailDelete?.dataset.sessionId;
    if (!id) return;

    const updated = updateSessionMeta(id, {
      name: ui.detailNameInput?.value ?? "",
      description: ui.detailDescriptionInput?.value ?? "",
    });
    if (!updated) {
      showToast("Could not update this session");
      return;
    }
    renderHistory();
    showToast(
      updated.name?.trim()
        ? `Saved “${updated.name.trim()}”`
        : "Saved session details"
    );
  });

  ui.btnDetailVideo?.addEventListener("click", () => {
    openHistorySessionVideo(ui.btnDetailVideo.dataset.sessionId);
  });

  ui.btnDetailDelete?.addEventListener("click", () => {
    const id = ui.btnDetailDelete.dataset.sessionId;
    if (!id || !confirm("Delete this session?")) return;
    deleteSession(id);
    if (selectedHistoryId === id) selectedHistoryId = null;
    renderHistory();
    renderStats();
    showToast("Session deleted");
  });

  const onVideoStyleChange = () => {
    updateVideoGradientVisibility();
    updateVideoPreview();
  };
  ui.videoTextMode?.addEventListener("change", onVideoStyleChange);
  ui.videoTextColor?.addEventListener("input", onVideoStyleChange);
  ui.videoTextColorEnd?.addEventListener("input", onVideoStyleChange);
  ui.videoBgColor?.addEventListener("input", onVideoStyleChange);
  ui.videoGradientAngle?.addEventListener("input", () => {
    if (ui.videoGradientAngleValue) {
      ui.videoGradientAngleValue.textContent = `${ui.videoGradientAngle.value}°`;
    }
    onVideoStyleChange();
  });

  ui.btnVideoCustomize?.addEventListener("click", () => {
    const open = ui.videoCustomizePanel?.hidden !== false;
    setVideoCustomizeOpen(open);
  });

  renderVideoPresets();
  ui.videoLookPresets?.addEventListener("click", (event) => {
    const btn = event.target.closest(".video-preset");
    if (!btn || videoEditor.rendering) return;
    applyVideoPreset(btn.dataset.presetKind, btn.dataset.presetId);
  });
  ui.videoGradientPresets?.addEventListener("click", (event) => {
    const btn = event.target.closest(".video-preset");
    if (!btn || videoEditor.rendering) return;
    applyVideoPreset(btn.dataset.presetKind, btn.dataset.presetId);
  });

  for (const swatch of document.querySelectorAll(".video-swatch")) {
    swatch.addEventListener("click", () => {
      if (videoEditor.rendering) return;
      const bg = swatch.dataset.bg;
      if (!bg || !ui.videoBgColor) return;
      ui.videoBgColor.value = bg;
      onVideoStyleChange();
    });
  }

  ui.btnVideoRender?.addEventListener("click", () => {
    startVideoRender();
  });
  ui.btnVideoCancel?.addEventListener("click", () => {
    videoEditor.cancelRequested = true;
    if (ui.videoProgressLabel) ui.videoProgressLabel.textContent = "Cancelling…";
  });
  ui.btnVideoClose?.addEventListener("click", () => {
    if (videoEditor.rendering) {
      videoEditor.cancelRequested = true;
    }
    closeVideoEditor();
  });
  ui.videoModal?.addEventListener("cancel", (event) => {
    if (videoEditor.rendering) {
      event.preventDefault();
      videoEditor.cancelRequested = true;
      if (ui.videoProgressLabel) ui.videoProgressLabel.textContent = "Cancelling…";
    }
  });
  ui.videoModal?.addEventListener("close", () => {
    videoEditor.cancelRequested = videoEditor.rendering;
    updateSourceUi();
  });

  ui.btnOctaveDown.addEventListener("click", () => keyboard.shiftOctave(-1));
  ui.btnOctaveUp.addEventListener("click", () => keyboard.shiftOctave(1));

  ui.soundToggle.addEventListener("change", () => {
    synth.setEnabled(ui.soundToggle.checked);
    localStorage.setItem(STORAGE.sound, ui.soundToggle.checked ? "on" : "off");
    if (ui.soundToggle.checked) synth.resume();
  });

  ui.pedalCountToggle?.addEventListener("change", () => {
    setPedalCountMode(ui.pedalCountToggle.checked);
  });

  const onVoiceChange = (event) => {
    synth.resume();
    setVoice(event.target.value);
  };
  ui.voiceSelect?.addEventListener("change", onVoiceChange);
  ui.voiceSelectSettings?.addEventListener("change", onVoiceChange);

  ui.settingsBtn.addEventListener("click", () => {
    renderKeymap();
    keyboard.setEnabled(false);
    ui.settingsModal.showModal();
  });

  ui.settingsModal.addEventListener("close", () => {
    keyboard.cancelCapture();
    updateSourceUi();
  });

  ui.velocityRange.addEventListener("input", () => {
    keyboard.velocity = Number(ui.velocityRange.value);
    ui.velocityValue.textContent = ui.velocityRange.value;
    localStorage.setItem(STORAGE.velocity, ui.velocityRange.value);
  });

  ui.volumeRange.addEventListener("input", () => {
    synth.setVolume(Number(ui.volumeRange.value) / 100);
    ui.volumeValue.textContent = ui.volumeRange.value;
    localStorage.setItem(STORAGE.volume, ui.volumeRange.value);
  });

  ui.btnResetMapping.addEventListener("click", () => {
    keyboard.setMapping(DEFAULT_KEY_MAP);
    saveMapping();
    renderKeymap();
    refreshKeyLabels();
  });

  window.addEventListener("keydown", (event) => {
    if (ui.settingsModal?.open || ui.videoModal?.open) return;
    if (event.target.closest?.("input, textarea, select")) return;

    if (event.code === "Space") {
      event.preventDefault();
      if (session.recording) pauseRecording();
      else if (session.paused) resumeRecording();
      else if (!session.active) startRecording();
    } else if (event.code === "Escape" && session.active) {
      event.preventDefault();
      stopRecording();
    } else if (event.code === "Escape" && focusViewOpen) {
      event.preventDefault();
      setFocusView(false);
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
      event.preventDefault();
      exportMidi();
    }
  });

  // Retry on every gesture until the context actually reports "running";
  // a single attempt can land before the browser is willing to unlock audio.
  const gestureUnlock = () => {
    synth.resume();
    if (synth.isSuspended) return;
    lockedNoteCount = 0;
    audioPromptShown = false;
    document.removeEventListener("pointerdown", gestureUnlock);
    document.removeEventListener("keydown", gestureUnlock);
  };

  document.addEventListener("pointerdown", gestureUnlock);
  document.addEventListener("keydown", gestureUnlock);
}

function tick() {
  updateCounters();
  requestAnimationFrame(tick);
}

initTheme();
loadSettings();
bindUi();
updateSourceUi();
updateCounters();
updateControls();
renderHistory();
renderStats();
initMidi();

const appYear = document.getElementById("appYear");
if (appYear) appYear.textContent = String(new Date().getFullYear());

requestAnimationFrame(() => piano.scrollToNote(keyboard.baseNote));
requestAnimationFrame(tick);
