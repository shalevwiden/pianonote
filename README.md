# Peak Notes

A polished web app for recording piano performances. Play a USB MIDI instrument or your computer keyboard, watch a live note counter, and export a Standard MIDI File you can open in Synthesia.

The marketing site lives at `index.html`. The studio app is `app.html`.

Tested with a **Yamaha P-145BT** over USB MIDI in Chrome.

## Requirements

- [Python 3](https://www.python.org/) for the local server
- [Sass](https://sass-lang.com/) only if you edit styles (`brew install sass/sass/sass`)
- [Node.js](https://nodejs.org/) only if you rebuild the Mediabunny vendor bundle
- Chrome or Edge for Web MIDI and MP4 export (computer-keyboard input works in any modern browser; video encoding needs WebCodecs H.264)

## Quick start

```bash
python3 scripts/serve.py
```

Serves the app at [http://127.0.0.1:8765](http://127.0.0.1:8765) and opens it. If that port is busy the script automatically moves to the next free one.

```bash
python3 scripts/serve.py --port 9000   # pick a port
python3 scripts/serve.py --no-open     # don't launch a browser
```

> Web MIDI requires a secure context. Serving over `localhost` satisfies this; opening `index.html` as a `file://` URL does not.

## Playing

Choose an input source at the top of the dashboard.

A connected instrument **always** plays and records. The source toggle only decides whether the computer keyboard is live as well, so pick **MIDI Device** when you want typing to stay silent during a take.

**MIDI Device** — plug the keyboard in over USB and allow MIDI access when prompted. Detected instruments appear in the dropdown, and Yamaha devices are preferred automatically.

**Computer Keyboard** — the home row plays white keys starting at Middle C, and the row above holds the black keys in their natural gaps:

| Keys                    | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `A S D F G H J K L ; '` | White keys, C4 upward                   |
| `W E T Y U O P`         | Black keys                              |
| `Z` / `X`               | Octave down / up (arrow keys also work) |
| `Space`                 | Start, then pause / resume the take     |
| `Esc`                   | Stop the current take                   |
| `⌘E` / `Ctrl+E`         | Export the session as MIDI              |

Multiple keys can be held at once, key repeat is ignored, and every note lights up the on-screen 88-key piano. Notes sound through sampled MusyngKite instruments (grand piano, Rhodes, harpsichord, overdriven guitar) plus an 80s supersaw synth, which can be muted with the Sound switch.

## Recording and export

1. Press **Record** (or `Space`).
2. Play. The counter, notes per second, peak NPS, and elapsed time update live.
3. Press **Pause** (or `Space` again) to freeze capture while the timeline keeps running — pauses become silence in MIDI and a frozen counter plateau in video. Held notes are closed when you pause so nothing sustains across the gap. **Resume** continues the same take.
4. Press **Stop** (or `Esc`) to finalize.
5. Press **Save** to store the take in History, **Export .mid** (downloads and auto-saves), or **Save Video** for a silent counter MP4. The Save button turns green once the take is stored in History.

MIDI exports are **SMF Format 1** at **480 PPQN** with a dedicated tempo track at 120 BPM.

### Save Video (silent MP4)

**Save Video** opens an editor with a live 16:9 preview, text/background colors, solid or gradient number styling, and a Download MP4 action. Output is **1920×1080 at 60 fps**, silent (no audio track). The counter advances exactly on each recorded note-on; pauses and idle gaps stay frozen for their real duration.

Video export uses the browser **WebCodecs** H.264 encoder via [Mediabunny](https://www.npmjs.com/package/mediabunny). Use **Chrome or Edge**. Style preferences are remembered in local storage. Rendering a video does **not** mark the session as MIDI-exported or create a duplicate History entry.

The Mediabunny bundle is committed at `js/vendor/mediabunny.js`. After changing the dependency:

```bash
npm install          # also runs postinstall → npm run build:vendor
npm run build:vendor # rebuild the static ESM bundle only
```

### History & Stats

- **History** lists every saved session. Click one for notes, duration, peak NPS, pauses, voice, device, and timestamps. Re-export MIDI, **Save Video**, or delete from the detail panel.
- **Stats** shows lifetime totals: notes, sessions, practice time, notes today, lifetime peak NPS, how long it has been since your last save, and current storage use.

### Where your data lives

Everything stays in your browser's `localStorage` on this device — nothing is uploaded, and there is no server component beyond the local static file server. History lives under the key `psr-history-v1`, video style preferences under `psr-video-style`.

A session stores its MIDI events in a compact `[timeMs, status, data1, data2]` tuple form, which is roughly four times smaller than a JSON object per event but still larger than the binary `.mid` you download:

| Session                | Downloaded `.mid` | In History |
| ---------------------- | ----------------- | ---------- |
| 100 notes (~30 s)      | ~1 KB             | ~3 KB      |
| 1,000 notes (~4 min)   | ~9 KB             | ~36 KB     |
| 5,000 notes (~20 min)  | ~44 KB            | ~190 KB    |
| 20,000 notes (~80 min) | ~176 KB           | ~770 KB    |

Browsers cap an origin at roughly 5 MB, so expect a few dozen long takes before pressure. History keeps the 200 most recent sessions, and if a write hits the quota the oldest sessions drop their MIDI payloads first — metadata and stats survive, only re-export does not. Use **Clear all** in History to reclaim everything, or delete individual sessions.

**Videos are never stored.** Each MP4 is rendered on demand in memory and handed straight to your download folder; only the color settings persist.

### Checking an exported file

```bash
python3 scripts/verify_midi.py ~/Downloads/piano-session-20260731-120000.mid --events 10
```

It reports the header, per-track note counts, tempo, and warns about notes left hanging. A file that plays correctly ends with `OK  N notes on, N notes off`.

## Settings

The gear icon opens a panel for note velocity, playback volume, and key mapping. Select any note, press the key you want, and the binding is saved. Preferences persist in local storage.

## Project structure

```
piano-midi/
├── index.html
├── css/main.css              # compiled styles
├── scss/                     # source styles
├── js/
│   ├── app.js                # UI wiring and session flow
│   ├── midi.js               # Web MIDI device manager
│   ├── keyboard.js           # QWERTY piano mapping
│   ├── synth.js              # sampled instruments + 80s synth
│   ├── sample-bank.js        # MusyngKite MP3 loader
│   ├── piano-ui.js           # 88-key on-screen keyboard
│   ├── recorder.js           # event capture, pause, live stats
│   ├── midi-writer.js        # Standard MIDI File builder
│   ├── video-export.js       # canvas counter → silent MP4
│   ├── history.js            # saved session store
│   ├── note-utils.js         # shared note helpers
│   └── vendor/mediabunny.js  # bundled MP4 encoder (esbuild)
├── assets/samples/           # MusyngKite instrument MP3s (see README there)
├── vendor/mediabunny-entry.mjs
├── package.json              # npm run build:vendor
└── scripts/
    ├── serve.py              # local HTTP server
    ├── compile_scss.py       # SCSS → CSS
    ├── fetch_samples.py      # download MusyngKite instrument MP3s
    ├── verify_midi.py        # inspect an exported .mid
    └── verify_video_timeline.mjs
```

## Editing styles

```bash
python3 scripts/compile_scss.py            # one-off build
python3 scripts/compile_scss.py --watch    # rebuild on change
```

## Troubleshooting

**Exports look empty**  
Run `verify_midi.py` on the file. If it reports zero note-ons, the session had no notes. The dev server sends no-cache headers so code changes always take effect; if you are serving the app another way, hard-reload with `⌘⇧R` — browsers cache ES modules aggressively and a stale `midi-writer.js` can produce a malformed header.

**"Web MIDI unavailable"**  
Use Chrome or Edge. Safari and Firefox do not support Web MIDI here. Computer-keyboard input still works.

**"No MIDI devices"**  
Confirm the keyboard is powered and connected over USB rather than Bluetooth only, then check that it appears in macOS **Audio MIDI Setup**. Try another cable or port, and reload the page.

**No sound**  
Browsers keep audio locked until the page receives a real user gesture, and MIDI notes do not count as one — playing a connected instrument on a page you have never clicked leaves the audio context suspended. Click anywhere once and the sound starts; the app prompts you if it detects this. Also check that the Sound switch is on. If piano still sounds like a thin synth, the sampled packs are missing — run `python3 scripts/fetch_samples.py` so MP3s land in `assets/samples/`.

**Notes are not counting**  
Counting starts when a recording is active (not paused). Press **Record** first, and confirm the input source matches how you are playing.

**Save Video is disabled / encoding unavailable**  
MP4 export needs Chromium WebCodecs with H.264. Use Chrome or Edge, then hard-reload. Safari and Firefox can still record and export MIDI.
