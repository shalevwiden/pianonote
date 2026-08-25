/**
 * Renders a full 88-key piano and highlights notes as they sound, so both a
 * real instrument and the QWERTY mapping light up the same view.
 */

import {
  isBlackKey,
  noteName,
  MIDI_LOWEST,
  MIDI_HIGHEST,
} from "./note-utils.js";

export class PianoKeyboardUI {
  constructor(root, { onNoteOn, onNoteOff } = {}) {
    this.root = root;
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    /** @type {Map<number, HTMLElement>} */
    this.keys = new Map();
    this.activeNotes = new Set();
    this.pointerNote = null;

    this._render();
    this._bindPointer();
  }

  _render() {
    this.root.innerHTML = "";

    const rail = document.createElement("div");
    rail.className = "piano__rail";
    rail.setAttribute("aria-hidden", "true");

    const whites = document.createElement("div");
    whites.className = "piano__whites";
    const blacks = document.createElement("div");
    blacks.className = "piano__blacks";

    const whiteNotes = [];
    for (let note = MIDI_LOWEST; note <= MIDI_HIGHEST; note++) {
      if (!isBlackKey(note)) whiteNotes.push(note);
    }

    // Real pianos nudge C#/F# toward the right of their group and D#/A# left.
    const blackShift = { 1: 0.09, 3: -0.09, 6: 0.11, 8: 0, 10: -0.11 };
    const whiteWidth = 100 / whiteNotes.length;
    const blackWidth = whiteWidth * 0.7;
    let whiteIndex = 0;

    for (let note = MIDI_LOWEST; note <= MIDI_HIGHEST; note++) {
      const key = document.createElement("div");
      key.dataset.note = String(note);
      key.title = noteName(note);

      const label = document.createElement("span");
      label.className = "piano__label";
      key.appendChild(label);

      if (isBlackKey(note)) {
        key.className = "piano__key piano__key--black";
        const nudge = (blackShift[note % 12] ?? 0) * whiteWidth;
        key.style.left = `${whiteIndex * whiteWidth - blackWidth / 2 + nudge}%`;
        key.style.width = `${blackWidth}%`;
        blacks.appendChild(key);
      } else {
        key.className = "piano__key piano__key--white";
        if (note % 12 === 0) {
          const octaveTag = document.createElement("span");
          octaveTag.className = "piano__octave";
          octaveTag.textContent = noteName(note);
          key.appendChild(octaveTag);
        }
        whiteIndex += 1;
        whites.appendChild(key);
      }

      this.keys.set(note, key);
    }

    this.root.appendChild(rail);
    this.root.appendChild(whites);
    this.root.appendChild(blacks);
  }

  _bindPointer() {
    const noteFromEvent = (event) => {
      const target = event.target.closest?.(".piano__key");
      return target ? Number(target.dataset.note) : null;
    };

    this.root.addEventListener("pointerdown", (event) => {
      const note = noteFromEvent(event);
      if (note == null) return;
      event.preventDefault();
      this.root.setPointerCapture?.(event.pointerId);
      this.pointerNote = note;
      this.onNoteOn?.(note);
    });

    const releasePointer = () => {
      if (this.pointerNote == null) return;
      this.onNoteOff?.(this.pointerNote);
      this.pointerNote = null;
    };

    this.root.addEventListener("pointerup", releasePointer);
    this.root.addEventListener("pointercancel", releasePointer);
    this.root.addEventListener("pointerleave", releasePointer);
  }

  setActive(note, active) {
    const key = this.keys.get(note);
    if (!key) return;
    key.classList.toggle("is-active", active);
    if (active) this.activeNotes.add(note);
    else this.activeNotes.delete(note);
  }

  clearActive() {
    for (const note of this.activeNotes) {
      this.keys.get(note)?.classList.remove("is-active");
    }
    this.activeNotes.clear();
  }

  /** @param {Map<number, string>} labels note → QWERTY key label */
  setKeyLabels(labels) {
    for (const [note, key] of this.keys) {
      const label = labels.get(note);
      key.classList.toggle("is-mapped", Boolean(label));
      const span = key.querySelector(".piano__label");
      if (span) span.textContent = label ?? "";
    }
  }

  /** No-op: the studio keyboard is full-width and does not scroll. */
  scrollToNote() {}
}
