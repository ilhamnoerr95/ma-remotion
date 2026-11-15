// Usage:
//   node --env-file-if-exists=.env comfyui/generate.ts --ping
//   node --env-file-if-exists=.env comfyui/generate.ts comfyui/workflows/image.json \
//        --set 6.text="a red fox" --set 3.seed=42
//
// Workflows must be exported with "Save (API Format)" in ComfyUI.
// Results are saved to COMFYUI_OUT_DIR (default: app/public/assets).

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { BASE, download, ping, queue, waitForFiles } from "./client.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ping: { type: "boolean", default: false },
    set: { type: "string", multiple: true, default: [] },
  },
});

if (values.ping) {
  try {
    await ping();
  } catch (err) {
    console.error(`Cannot reach ComfyUI at ${BASE}: ${(err as Error).cause ?? err}`);
    process.exit(1);
  }
  console.log(`OK: ComfyUI reachable at ${BASE}`);
  process.exit(0);
}

const workflowPath = positionals[0];
if (!workflowPath) {
  console.error("Missing workflow path. See usage at the top of this file.");
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

// --set <nodeId>.<inputName>=<value>
for (const assignment of values.set) {
  const eq = assignment.indexOf("=");
  const [nodeId, input] = assignment.slice(0, eq).split(".");
  const raw = assignment.slice(eq + 1);
  const inputs = workflow[nodeId]?.inputs;
  if (!inputs) throw new Error(`Node "${nodeId}" not found in ${workflowPath}`);
  inputs[input] = typeof inputs[input] === "number" ? Number(raw) : raw;
}

const outDir = process.env.COMFYUI_OUT_DIR ?? "app/public/assets";
fs.mkdirSync(outDir, { recursive: true });

const promptId = await queue(workflow);
console.log(`Queued ${promptId} on ${BASE}`);

for (const file of await waitForFiles(promptId)) {
  const target = path.join(outDir, file.filename);
  fs.writeFileSync(target, await download(file));
  console.log(`Saved ${target}`);
}
