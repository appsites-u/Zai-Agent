import { describe, it, expect } from "vitest";
import { roleAllows, primaryRole } from "@/lib/roles";
import { decideRunAction } from "@/lib/tasks";
import { mapProviderStatus, toAiError, httpStatusFor } from "@/lib/ai/errors";
import { createCloudflareProvider, getConfiguredProvider, readCloudflareConfig } from "@/lib/ai/cloudflare";

describe("role authorization", () => {
  it("viewer can read but not write", () => {
    expect(roleAllows(["viewer"], "member")).toBe(true);
    expect(roleAllows(["viewer"], "writer")).toBe(false);
  });
  it("operator can write but is not admin", () => {
    expect(roleAllows(["operator"], "writer")).toBe(true);
    expect(roleAllows(["operator"], "admin")).toBe(false);
  });
  it("admin has every access", () => expect(roleAllows(["admin"], "admin")).toBe(true));
  it("no role has no access", () => {
    expect(roleAllows([], "member")).toBe(false);
    expect(roleAllows(null, "member")).toBe(false);
    expect(primaryRole(["viewer", "admin"])).toBe("admin");
  });
});

describe("task run decisions", () => {
  const open = { status: "todo", requires_approval: false, approved_at: null };
  it("needs an agent", () => expect(decideRunAction(open, null, false)).toEqual({ kind: "error", reason: "no_agent" }));
  it("blocks disabled agents", () => expect(decideRunAction(open, { enabled: false }, false)).toEqual({ kind: "error", reason: "agent_disabled" }));
  it("blocks cancelled tasks", () => expect(decideRunAction({ ...open, status: "cancelled" }, { enabled: true }, false).kind).toBe("error"));
  it("sensitive tasks request approval once", () => {
    const t = { ...open, requires_approval: true };
    expect(decideRunAction(t, { enabled: true }, false).kind).toBe("request_approval");
    expect(decideRunAction(t, { enabled: true }, true).kind).toBe("awaiting_approval");
    expect(decideRunAction({ ...t, approved_at: "2026-01-01" }, { enabled: true }, false).kind).toBe("run");
  });
  it("failed tasks can be retried", () => expect(decideRunAction({ ...open, status: "failed" }, { enabled: true }, false).kind).toBe("run"));
});

describe("AI provider error handling", () => {
  it("maps upstream statuses", () => {
    expect(mapProviderStatus(401).code).toBe("auth_failed");
    expect(mapProviderStatus(429).code).toBe("rate_limited");
    expect(mapProviderStatus(404).code).toBe("model_not_found");
    expect(mapProviderStatus(500).code).toBe("provider_error");
    expect(httpStatusFor("not_configured")).toBe(503);
    expect(toAiError(new TypeError("x")).code).toBe("network_error");
  });
  it("is unconfigured without both secrets", () => {
    expect(readCloudflareConfig({ CLOUDFLARE_ACCOUNT_ID: "a" })).toBeNull();
    expect(getConfiguredProvider({})).toBeNull();
  });
  const cfg = { accountId: "acc", apiToken: "tok" };
  it("returns real provider text", async () => {
    const p = createCloudflareProvider(cfg, async () => new Response(JSON.stringify({ success: true, result: { response: "hi" } })));
    expect((await p.complete({ model: "m", messages: [{ role: "user", content: "x" }] })).text).toBe("hi");
  });
  it("rejects rate limits and empty replies instead of inventing text", async () => {
    const rl = createCloudflareProvider(cfg, async () => new Response("slow", { status: 429 }));
    await expect(rl.complete({ model: "m", messages: [] })).rejects.toMatchObject({ code: "rate_limited" });
    const empty = createCloudflareProvider(cfg, async () => new Response(JSON.stringify({ success: true, result: {} })));
    await expect(empty.complete({ model: "m", messages: [] })).rejects.toMatchObject({ code: "provider_error" });
  });
  it("times out", async () => {
    const p = createCloudflareProvider(cfg, (_u, init) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })))));
    await expect(p.complete({ model: "m", messages: [], timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });
});
