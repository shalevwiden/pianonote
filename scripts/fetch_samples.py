#!/usr/bin/env python3
"""Download CC-licensed MusyngKite instrument samples for Peak Notes."""

from __future__ import annotations

import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "samples"
BASE = "https://gleitz.github.io/midi-js-soundfonts/MusyngKite"

# GM instrument folder → local pack name
PACKS = {
    "piano": "acoustic_grand_piano",
    "epiano": "electric_piano_1",
    "harpsichord": "harpsichord",
    "eguitar": "overdriven_guitar",
}

NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
MIDI_LOWEST = 21  # A0
MIDI_HIGHEST = 108  # C8


def sample_name(midi: int) -> str:
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def fetch_one(url: str, dest: Path) -> tuple[str, bool, str]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest.name, True, "skip"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PeakNotes/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        if len(data) < 500:
            return dest.name, False, "too small"
        dest.write_bytes(data)
        return dest.name, True, f"{len(data)}b"
    except Exception as exc:  # noqa: BLE001
        return dest.name, False, str(exc)


def main() -> int:
    jobs = []
    for pack, instrument in PACKS.items():
        for midi in range(MIDI_LOWEST, MIDI_HIGHEST + 1):
            name = sample_name(midi)
            url = f"{BASE}/{instrument}-mp3/{name}.mp3"
            dest = OUT / pack / f"{name}.mp3"
            jobs.append((url, dest))

    print(f"Fetching {len(jobs)} samples into {OUT}")
    ok = 0
    failed = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(fetch_one, url, dest): (url, dest) for url, dest in jobs}
        for i, fut in enumerate(as_completed(futures), 1):
            name, success, detail = fut.result()
            if success:
                ok += 1
            else:
                failed.append((name, detail))
            if i % 40 == 0 or i == len(jobs):
                print(f"  {i}/{len(jobs)} ({ok} ok)")

    if failed:
        print(f"Failed {len(failed)}:", file=sys.stderr)
        for name, detail in failed[:12]:
            print(f"  {name}: {detail}", file=sys.stderr)
        return 1

    print(f"OK  {ok} samples")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
