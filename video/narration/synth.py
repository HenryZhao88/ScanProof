"""Synthesise the voiceover with Kokoro-82M.

    python narration/synth.py                    # default voice
    python narration/synth.py --voice af_heart   # any Kokoro voice
    python narration/synth.py --speed 1.06       # brisker read

Kokoro is a StyleTTS2 model, Apache-2.0, ~350 MB, and runs locally on CPU or
MPS. It is chosen over a hosted API for one practical reason: it needs no
account and no key, so the whole video reproduces from a clean checkout with
`make video`. Quality-per-friction it is the best option available offline.

Writes 48 kHz mono WAV into public/vo/. `narration/build.mjs` then measures
those files and derives the edit from them.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
LINES = json.loads((ROOT / "narration" / "lines.json").read_text())
OUT = ROOT / "public" / "vo"

#: Kokoro emits 24 kHz; the timeline and the render want 48 kHz mono.
NATIVE_SR = 24_000
TARGET_SR = 48_000
#: Silence appended so a cut never lands on the tail of a word.
TAIL = 0.30


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=1.08)
    ap.add_argument("--lang", default="a", help="'a' American, 'b' British")
    args = ap.parse_args()

    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    OUT.mkdir(parents=True, exist_ok=True)
    pipe = KPipeline(lang_code=args.lang, repo_id="hexgrad/Kokoro-82M")

    total = 0.0
    for line in LINES:
        # Kokoro splits long text on sentence boundaries and yields a chunk per
        # segment; the joins land on natural pauses, so a plain concat is fine.
        chunks = [audio for _, _, audio in pipe(line["text"], voice=args.voice, speed=args.speed)]
        if not chunks:
            raise SystemExit(f"no audio produced for {line['id']!r}")
        wave = np.concatenate(chunks)

        raw = OUT / f"{line['id']}.raw.wav"
        final = OUT / f"{line['id']}.wav"
        sf.write(raw, wave, NATIVE_SR)

        # Trim the model's own leading/trailing silence, bring every clip to a
        # common loudness, then add one controlled tail. Without the trim the
        # edit inherits whatever padding Kokoro happened to emit; without the
        # normalise the track sits ~10 dB under a typical voiceover.
        trim = (
            "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-50dB:detection=peak,"
            "areverse,"
            "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-50dB:detection=peak,"
            "areverse"
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
             "-af", f"{trim},loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur={TAIL}",
             "-ar", str(TARGET_SR), "-ac", "1", str(final)],
            check=True,
        )
        raw.unlink()

        seconds = float(
            subprocess.run(
                ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                 "-of", "csv=p=0", str(final)],
                check=True, capture_output=True, text=True,
            ).stdout.strip()
        )
        total += seconds
        print(f"  {line['id']:<18}{seconds:6.2f}s  {line['text'][:52]}…", flush=True)

    print(f"\n{len(LINES)} lines · {int(total // 60)}:{total % 60:04.1f} · voice {args.voice}")
    print("next: node narration/build.mjs --measure-only")


if __name__ == "__main__":
    sys.exit(main())
