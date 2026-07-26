"""Synthesise the voiceover from narration/script.json.

    python narration/synth.py                     # everything
    python narration/synth.py --only stake        # one line
    python narration/synth.py --only stake --play # one line, and hear it
    python narration/synth.py --list              # line ids and current lengths

Kokoro-82M (StyleTTS2, Apache-2.0) runs locally, so the whole video reproduces
from a clean checkout with no account and no API key.

Editing controls, all in script.json:

  text          what is spoken. `[0.4]` anywhere inside inserts exactly 0.4s of
                silence — the text either side is synthesised separately and the
                gap spliced in, so it is real silence rather than a hint the
                model may ignore.
  pauseAfter    silence appended after the line. This is also what holds a
                scene open while a chart finishes drawing.
  speed         per-line rate, overriding the global one. Useful for slowing a
                number-heavy sentence without slowing the whole read.

Every clip is silence-trimmed and loudness-normalised to -16 LUFS, so edits
cannot drift the level.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "narration" / "script.json"
OUT = ROOT / "public" / "vo"

NATIVE_SR = 24_000
TARGET_SR = 48_000
#: `[0.4]` or `[0.4s]`
PAUSE = re.compile(r"\[\s*([0-9]*\.?[0-9]+)\s*s?\s*\]")


def flatten(doc: dict) -> list[dict]:
    return [
        {**line, "scene": beat["scene"]}
        for beat in doc["beats"]
        for line in beat["lines"]
    ]


def render_line(pipe, text: str, voice: str, speed: float, np):
    """Synthesise one line, splicing exact silence at every [n] marker."""
    parts = PAUSE.split(text)  # [text, secs, text, secs, …]
    chunks = []
    for i, part in enumerate(parts):
        if i % 2:  # a pause
            chunks.append(np.zeros(int(NATIVE_SR * float(part)), dtype=np.float32))
            continue
        spoken = part.strip()
        if not spoken:
            continue
        for _, _, audio in pipe(spoken, voice=voice, speed=speed):
            chunks.append(audio)
    if not chunks:
        raise SystemExit(f"no audio for: {text[:50]!r}")
    return np.concatenate(chunks)


def duration_of(path: Path) -> float:
    return float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", help="synthesise a single line id")
    ap.add_argument("--play", action="store_true", help="play it after writing (macOS)")
    ap.add_argument("--list", action="store_true", help="show line ids and lengths")
    ap.add_argument("--voice", help="override the voice in script.json")
    ap.add_argument("--speed", type=float, help="override the global speed")
    args = ap.parse_args()

    doc = json.loads(SCRIPT.read_text())
    lines = flatten(doc)

    if args.list:
        for line in lines:
            wav = OUT / f"{line['id']}.wav"
            length = f"{duration_of(wav):5.2f}s" if wav.exists() else ""
            print(f"  {line['scene']:<12}{line['id']:<18}{length:>8}  {line['text'][:54]}…")
        return

    voice = args.voice or doc.get("voice", "af_heart")
    speed = args.speed or doc.get("speed", 1.0)

    todo = [l for l in lines if not args.only or l["id"] == args.only]
    if not todo:
        raise SystemExit(f"no line {args.only!r} — try --list")

    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    OUT.mkdir(parents=True, exist_ok=True)
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")

    total = 0.0
    for line in todo:
        wave = render_line(pipe, line["text"], voice, line.get("speed", speed), np)

        raw = OUT / f"{line['id']}.raw.wav"
        final = OUT / f"{line['id']}.wav"
        sf.write(raw, wave, NATIVE_SR)

        # Trim the model's own edge silence first, then normalise, then append
        # exactly the requested pause. In this order `pauseAfter` is the real
        # gap, rather than the model's padding plus the gap.
        trim = (
            "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-50dB:detection=peak,"
            "areverse,"
            "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-50dB:detection=peak,"
            "areverse"
        )
        pause = float(line.get("pauseAfter", 0.3))
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
             "-af", f"{trim},loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur={pause}",
             "-ar", str(TARGET_SR), "-ac", "1", str(final)],
            check=True,
        )
        raw.unlink()

        seconds = duration_of(final)
        total += seconds
        print(f"  {line['id']:<18}{seconds:6.2f}s  {line['text'][:52]}…", flush=True)

        if args.play:
            subprocess.run(["afplay", str(final)])

    if args.only:
        print("\nre-time and render:\n"
              "  node narration/build.mjs --measure-only\n"
              "  npx remotion render src/index.ts ScanProofDemo out/scanproof-demo.mp4 "
              "--codec=h264 --overwrite")
    else:
        print(f"\n{len(todo)} lines · {int(total // 60)}:{total % 60:04.1f} · {voice} at {speed}×")
        print("next: node narration/build.mjs --measure-only")


if __name__ == "__main__":
    sys.exit(main())
