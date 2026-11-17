#!/usr/bin/env bash
# One-shot setup for a fresh macOS/Linux machine. Safe to rerun.
#   ./setup.sh            Remotion app + OmniVoice
#   ./setup.sh --no-tts   Remotion app only
set -euo pipefail
cd "$(dirname "$0")"

WITH_TTS=1
[[ "${1:-}" == "--no-tts" ]] && WITH_TTS=0

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1 ($2)"; exit 1; }; }

# ---- Remotion app ----
need node "install Node 20.19+ / 22.13+ / 24+ from https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); const ok=(a===20&&b>=19)||(a===22&&b>=13)||a>=24; if(!ok){console.error("Node "+process.versions.node+" is too old (need 20.19+, 22.13+ or 24+)"); process.exit(1)}'
(cd app && npm ci)
[[ -f .env ]] || cp .env.example .env

# ---- OmniVoice ----
if [[ $WITH_TTS -eq 1 ]]; then
  PY=""
  # PyTorch 2.8 supports Python 3.10-3.13 (not 3.14).
  for c in python3.13 python3.12 python3.11 python3.10; do
    command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }
  done
  [[ -n "$PY" ]] || { echo "Need Python 3.10-3.13 (3.14 is not supported by PyTorch 2.8)."; exit 1; }

  [[ -d tts/.venv ]] || "$PY" -m venv tts/.venv
  # shellcheck disable=SC1091
  source tts/.venv/bin/activate
  pip install -q --upgrade pip

  if [[ "$(uname -s)" == "Darwin" ]]; then
    pip install -q torch==2.8.0 torchaudio==2.8.0
  elif command -v nvidia-smi >/dev/null 2>&1; then
    # cu128 wheels; see https://pytorch.org/get-started/locally/ for other CUDA versions
    pip install -q torch==2.8.0+cu128 torchaudio==2.8.0+cu128 --extra-index-url https://download.pytorch.org/whl/cu128
  else
    pip install -q torch==2.8.0 torchaudio==2.8.0
  fi
  pip install -q -r tts/requirements.txt

  python - <<'EOF'
import torch
dev = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
print("PyTorch", torch.__version__, "| device:", dev)
if dev == "cpu":
    print("WARNING: no GPU found. Narration will work but be slow.")
EOF
fi

echo
echo "Done. Next steps are in README.md ('Make an episode')."
