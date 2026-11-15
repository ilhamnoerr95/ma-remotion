# Remotion + ComfyUI

```
app/         Working Remotion project (from the blank template). Put long and short videos here as Compositions.
templates/   Reference copies of the official templates (tiktok, audiogram, prompt-to-video, ...). Not installed.
comfyui/     Client that sends workflows to a ComfyUI server and saves results into app/public/assets.
```

All Remotion packages are pinned to `4.0.543` (the version the templates were taken from). Keep them in lockstep when upgrading: `cd app && npx remotion upgrade`.

## Run Remotion

```bash
cd app
npm install
npm run dev          # Remotion Studio
npx remotion render  # render a composition
```

To start from another template, copy it, then install:

```bash
cp -R templates/tiktok app-tiktok && cd app-tiktok && npm install
```

## Use ComfyUI on another laptop

On the laptop that runs ComfyUI, start it so other machines can reach it:

```bash
python main.py --listen 0.0.0.0 --port 8188
```

ComfyUI has no authentication. Use it only on a trusted network, or through Tailscale or an SSH tunnel (`ssh -L 8188:127.0.0.1:8188 user@other-laptop`, then keep `COMFYUI_URL=http://127.0.0.1:8188`).

On this laptop:

```bash
cp .env.example .env            # set COMFYUI_URL to the other laptop's address
node --env-file-if-exists=.env comfyui/generate.ts --ping
```

Export a workflow from ComfyUI with **Save (API Format)** into `comfyui/workflows/`, then:

```bash
node --env-file-if-exists=.env comfyui/generate.ts comfyui/workflows/image.json \
  --set 6.text="a red fox in snow" --set 3.seed=42
```

`6` and `3` are node IDs from your workflow JSON. Files land in `app/public/assets/` and can be used with `staticFile("assets/<name>")`.

Generate assets first, then render. Do not call ComfyUI from inside a composition.
