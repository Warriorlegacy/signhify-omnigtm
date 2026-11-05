#!/usr/bin/env python3
"""Kokoro-82M voiceover adapter (Apache-2.0).

Optional: the reel renderer works silently without it. Install with:
    pip install kokoro soundfile
    # espeak-ng is required by misaki for some voices
Usage:
    python scripts/kokoro_tts.py --text "hello" --out out.wav --voice af_heart
"""

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", required=True))
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    try:
        import numpy as np
        import soundfile as sf
        from kokoro import KPipeline
    except ImportError as exc:
        print(f"Kokoro is not installed: {exc}", file=sys.stderr)
        print("Install with: pip install kokoro soundfile", file=sys.stderr)
        return 2

    pipeline = KPipeline(lang_code="a")
    chunks = []
    for _, _, audio in pipeline(args.text, voice=args.voice, speed=args.speed):
        chunks.append(audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio))
    if not chunks:
        print("Kokoro produced no audio", file=sys.stderr)
        return 3
    sf.write(args.out, np.concatenate(chunks), 24000)
    print(args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
