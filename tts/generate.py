#!/usr/bin/env python3
"""Generate narration clips with OmniVoice and keep the Remotion scene file in sync.

One non-empty line in episodes/<ep>/narration.txt = one clip = one scene (one image).
Lines starting with '#' are comments.

Typical use (run inside tts/.venv):
    python tts/generate.py --make-voice          # once: create + audition the narrator voice
    python tts/generate.py                       # generate missing/changed clips, update scenes json
    python tts/generate.py --sync-only           # no model: only relink images, refresh durations
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOICE_DIR = ROOT / "tts" / "voice"
IMAGE_EXTS = ("jpg", "jpeg", "png", "webp")
WORDS_PER_SECOND = 2.3  # used only to estimate duration before audio exists
VOICE_REF_TEXT = (
    "Nobody in Edo expected the end of the world to fall quietly from the sky. "
    "No invading army. No warning drums."
)


class Paths:
    def __init__(self, episode: str) -> None:
        self.narration = ROOT / "episodes" / episode / "narration.txt"
        self.audio_dir = ROOT / "app" / "public" / "assets" / episode / "audio"
        self.image_dir = ROOT / "app" / "public" / "assets" / episode / "images"
        self.scenes_json = ROOT / "app" / "src" / "episodes" / f"{episode}.json"
        self.public = ROOT / "app" / "public"
        self.episode = episode


def read_lines(path: Path) -> list[str]:
    lines = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    return [ln for ln in lines if ln and not ln.startswith("#")]


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / float(w.getframerate())


def sha(data: bytes) -> str:
    return hashlib.sha1(data).hexdigest()[:12]


def voice_fingerprint() -> str:
    ref = VOICE_DIR / "narrator.wav"
    return sha(ref.read_bytes()) if ref.exists() else "no-voice"


def find_image(p: Paths, number: str, existing: str | None) -> str | None:
    if existing and (p.public / existing).exists():
        return existing
    for ext in IMAGE_EXTS:
        candidate = p.image_dir / f"{number}.{ext}"
        if candidate.exists():
            return candidate.relative_to(p.public).as_posix()
    return None


def load_model(device: str | None):
    import torch
    from omnivoice import OmniVoice
    from omnivoice.utils.common import get_best_device

    device = device or get_best_device()
    print(f"Loading OmniVoice on {device} ...")
    return OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device, dtype=torch.float16)


def make_voice(args: argparse.Namespace) -> None:
    import soundfile as sf

    model = load_model(args.device)
    audio = model.generate(text=VOICE_REF_TEXT, instruct=args.instruct, language="en")
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    sf.write(VOICE_DIR / "narrator.wav", audio[0], model.sampling_rate)
    (VOICE_DIR / "narrator.txt").write_text(VOICE_REF_TEXT + "\n", encoding="utf-8")
    print(f"Saved {VOICE_DIR / 'narrator.wav'}. Listen to it; rerun --make-voice until you like it.")


def sync(p: Paths, lines: list[str], previous: dict) -> dict:
    prev_scenes = {s["id"]: s for s in previous.get("scenes", [])}
    fingerprint = voice_fingerprint()
    scenes = []
    for i, text in enumerate(lines, start=1):
        sid = f"{i:02d}"
        old = prev_scenes.get(sid, {})
        wav = p.audio_dir / f"{sid}.wav"
        expected = sha((text + fingerprint).encode())
        has_audio = wav.exists() and old.get("audioHash") == expected
        duration = wav_duration(wav) if has_audio else round(len(text.split()) / WORDS_PER_SECOND, 2)
        scenes.append(
            {
                "id": sid,
                "text": text,
                "image": find_image(p, sid, old.get("image")),
                "audio": wav.relative_to(p.public).as_posix() if has_audio else None,
                "audioHash": expected if has_audio else None,
                "duration": round(duration, 3),
            }
        )
    return {
        "fps": previous.get("fps", 30),
        "width": previous.get("width", 1920),
        "height": previous.get("height", 1080),
        "padding": previous.get("padding", 0.5),
        "music": previous.get("music"),
        "scenes": scenes,
    }


def write_scenes(p: Paths, data: dict) -> None:
    p.scenes_json.parent.mkdir(parents=True, exist_ok=True)
    p.scenes_json.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episode", default="ep1")
    ap.add_argument("--make-voice", action="store_true", help="create tts/voice/narrator.wav via voice design")
    ap.add_argument("--sync-only", action="store_true", help="do not load the model")
    ap.add_argument("--limit", type=int, default=None, help="generate at most N missing clips")
    ap.add_argument("--instruct", default="male, low pitch, american accent", help="voice design attributes")
    ap.add_argument("--device", default=None, help="cuda:0 / mps / cpu (default: auto)")
    args = ap.parse_args()

    if args.make_voice:
        make_voice(args)
        return 0

    p = Paths(args.episode)
    if not p.narration.exists():
        print(f"Missing {p.narration}", file=sys.stderr)
        return 1
    lines = read_lines(p.narration)
    previous = json.loads(p.scenes_json.read_text(encoding="utf-8")) if p.scenes_json.exists() else {}
    data = sync(p, lines, previous)

    todo = [s for s in data["scenes"] if s["audio"] is None]
    if args.limit is not None:
        todo = todo[: args.limit]

    if todo and not args.sync_only:
        ref_wav, ref_txt = VOICE_DIR / "narrator.wav", VOICE_DIR / "narrator.txt"
        if not ref_wav.exists():
            print("No narrator voice yet. Run: python tts/generate.py --make-voice", file=sys.stderr)
            return 1
        import soundfile as sf

        model = load_model(args.device)
        prompt = model.create_voice_clone_prompt(
            ref_audio=str(ref_wav), ref_text=ref_txt.read_text(encoding="utf-8").strip()
        )
        p.audio_dir.mkdir(parents=True, exist_ok=True)
        for n, scene in enumerate(todo, start=1):
            print(f"[{n}/{len(todo)}] {scene['id']}: {scene['text'][:60]}")
            audio = model.generate(text=scene["text"], voice_clone_prompt=prompt, language="en")
            sf.write(p.audio_dir / f"{scene['id']}.wav", audio[0], model.sampling_rate, subtype="PCM_16")
            scene["audioHash"] = sha((scene["text"] + voice_fingerprint()).encode())
        data = sync(p, lines, data)

    write_scenes(p, data)
    done = sum(1 for s in data["scenes"] if s["audio"])
    imgs = sum(1 for s in data["scenes"] if s["image"])
    total = sum(s["duration"] + data["padding"] for s in data["scenes"])
    print(f"{len(lines)} scenes | audio {done}/{len(lines)} | images {imgs}/{len(lines)} | ~{total / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
