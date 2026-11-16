import { AiError, mapProviderStatus, toAiError } from "./errors";
import type { ChatProvider, ChatRequest } from "./provider";

export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
}

/** Server-only: read credentials from the environment. Returns null when not configured. */
export function readCloudflareConfig(
  env: Record<string, string | undefined> = process.env,
): CloudflareConfig | null {
  const accountId = env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
  const apiToken = env["CLOUDFLARE_API_TOKEN"]?.trim();
  if (!accountId || !apiToken) return null;
  return { accountId, apiToken };
}

/** Extract a text delta from one SSE JSON payload (classic Workers AI or OpenAI-style). */
export function extractDelta(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p["response"] === "string") return p["response"];
  const choices = p["choices"] as Array<{ delta?: { content?: string } }> | undefined;
  return choices?.[0]?.delta?.content ?? "";
}

/** Transform raw SSE bytes into text deltas. */
export function sseToText(): TransformStream<Uint8Array, string> {
  const decoder = new TextDecoder();
  let buffer = "";
  const handleLine = (line: string, ctl: TransformStreamDefaultController<string>) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const data = t.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const d = extractDelta(JSON.parse(data));
      if (d) ctl.enqueue(d);
    } catch {
      /* ignore partial/non-JSON lines */
    }
  };
  return new TransformStream({
    transform(chunk, ctl) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) handleLine(l, ctl);
    },
    flush(ctl) {
      if (buffer) handleLine(buffer, ctl);
    },
  });
}

async function readError(res: Response) {
  try {
    const j = (await res.json()) as { errors?: Array<{ message?: string }> };
    return j.errors?.[0]?.message;
  } catch {
    return undefined;
  }
}

export function createCloudflareProvider(
  cfg: CloudflareConfig,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): ChatProvider {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/ai/run/`;

  async function call(req: ChatRequest, stream: boolean) {
    const ctl = new AbortController();
    const timeoutMs = req.timeoutMs ?? 30000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, timeoutMs);
    const onAbort = () => ctl.abort();
    req.signal?.addEventListener("abort", onAbort);
    try {
      const res = await fetchImpl(base + req.model, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: req.messages,
          stream,
          temperature: req.temperature,
          max_tokens: req.maxTokens ?? 1024,
        }),
        signal: ctl.signal,
      });
      if (!res.ok) throw mapProviderStatus(res.status, await readError(res));
      return { res, clear: () => clearTimeout(timer), ctl };
    } catch (e) {
      clearTimeout(timer);
      if (timedOut) throw new AiError("timeout", `No response from the AI provider within ${timeoutMs} ms.`);
      throw toAiError(e);
    } finally {
      req.signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    name: "cloudflare-workers-ai",
    async complete(req) {
      const { res, clear } = await call(req, false);
      try {
        const json = (await res.json()) as {
          success?: boolean;
          result?: { response?: string; choices?: Array<{ message?: { content?: string } }> };
          errors?: Array<{ message?: string }>;
        };
        if (json.success === false) throw mapProviderStatus(502, json.errors?.[0]?.message);
        const text = json.result?.response ?? json.result?.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw new AiError("provider_error", "The AI provider returned an empty response.");
        return { text };
      } finally {
        clear();
      }
    },
    async stream(req) {
      const { res, clear } = await call(req, true);
      // Connection established: the timeout only guards time-to-first-byte.
      clear();
      if (!res.body) throw new AiError("provider_error", "The AI provider returned no stream.");
      return res.body.pipeThrough(sseToText());
    },
  };
}

/** Server-only factory: returns null when credentials are missing (graceful setup state). */
export function getConfiguredProvider(env?: Record<string, string | undefined>): ChatProvider | null {
  const cfg = readCloudflareConfig(env);
  return cfg ? createCloudflareProvider(cfg) : null;
}
