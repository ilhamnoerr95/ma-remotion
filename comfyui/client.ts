// Minimal ComfyUI HTTP client. The server address comes from COMFYUI_URL,
// so the same code works against a local or a remote (other laptop) instance.

export const BASE = (process.env.COMFYUI_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");

export type FileRef = { filename: string; subfolder: string; type: string };

export async function ping(): Promise<void> {
  const res = await fetch(`${BASE}/system_stats`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`ComfyUI ${BASE} answered ${res.status}`);
}

export async function queue(workflow: object): Promise<string> {
  const res = await fetch(`${BASE}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`ComfyUI /prompt ${res.status}: ${await res.text()}`);
  return (await res.json()).prompt_id as string;
}

export async function waitForFiles(promptId: string, timeoutMs = 30 * 60_000): Promise<FileRef[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${BASE}/history/${promptId}`);
    const entry = (await res.json())[promptId];
    if (entry?.status?.status_str === "error") {
      throw new Error(`ComfyUI job failed: ${JSON.stringify(entry.status.messages)}`);
    }
    if (entry?.status?.completed) {
      const files: FileRef[] = [];
      for (const node of Object.values<Record<string, unknown>>(entry.outputs ?? {})) {
        for (const list of Object.values(node)) {
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            if (item && typeof item === "object" && "filename" in item) files.push(item as FileRef);
          }
        }
      }
      return files;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ComfyUI job ${promptId}`);
}

export async function download(file: FileRef): Promise<Buffer> {
  const qs = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
  const res = await fetch(`${BASE}/view?${qs}`);
  if (!res.ok) throw new Error(`ComfyUI /view ${res.status} for ${file.filename}`);
  return Buffer.from(await res.arrayBuffer());
}
