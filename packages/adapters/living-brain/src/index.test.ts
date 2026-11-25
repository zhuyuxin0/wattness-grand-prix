import { describe, expect, it } from "vitest";
import { LivingBrain, MemoryError, pageAvailableAt, redact, reviewFromMemory } from "./index.js";
import type { Page, Source } from "./index.js";
const time = "2026-11-25T15:00:00.000Z";
const p: Page = {
  id: "p1", brainId: "b1", slug: "hedge-review", title: "Reviewed assumption",
  body: "An assumed fair-value entry supports a scenario comparison, not executable trading profit.",
  version: 2, status: "active", createdAt: time, updatedAt: time, lastCompiledAt: time,
  sources: [{ ingestSourceId: "s1", attachedAt: time }],
};
const origin = "wattness:DSWL_ESS_ESR1:0xroot:entry-review-v1";
const s: Source = { id: "s1", brainId: "b1", status: "completed", createdAt: time, compiledAt: time, originRef: origin };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "x-request-id": "r1" } });
function client(responses: Response[]) {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const c = new LivingBrain({
    apiKey: "unit-key", subjectId: "unit-subject",
    fetch: async (url, options) => {
      calls.push({ url: String(url), ...(options ? { options } : {}) });
      const response = responses.shift();
      if (!response) throw new Error("No mocked response");
      return response;
    },
  });
  return { c, calls };
}
describe("as-of decision memory", () => {
  it("accepts completed source and current content available at the cutoff", () => {
    expect(pageAvailableAt(p, [s], time)).toEqual({ ok: true, availableAt: time });
  });
  it("rejects a later edit even when the capture itself is old", () => {
    expect(pageAvailableAt({ ...p, updatedAt: "2026-11-25T16:00:00Z" }, [s], time).ok).toBe(false);
  });
  it("rejects later source compilation and missing availability", () => {
    expect(pageAvailableAt(p, [{ ...s, compiledAt: "2026-11-25T16:00:00Z" }], time).ok).toBe(false);
    expect(pageAvailableAt(p, [{ ...s, compiledAt: null }], time).ok).toBe(false);
  });
  it("rejects disputed, source-free and cross-brain pages", () => {
    expect(pageAvailableAt({ ...p, status: "contested" }, [s], time).ok).toBe(false);
    expect(pageAvailableAt({ ...p, sources: [] }, [s], time).ok).toBe(false);
    expect(pageAvailableAt(p, [{ ...s, brainId: "b2" }], time).ok).toBe(false);
  });
  it("rejects invalid timestamps instead of treating unknown as zero", () => {
    expect(pageAvailableAt({ ...p, lastCompiledAt: "unknown" }, [s], time).ok).toBe(false);
    expect(pageAvailableAt(p, [s], "unknown").ok).toBe(false);
  });
  it("keeps later search snippets out of the decision and cites only read pages", async () => {
    const { c, calls } = client([json([{ slug: p.slug, status: "active", summary: "Future unsupported hint" }]), json(p), json({ items: [s] })]);
    const result = await c.retrieveAt("b1", "classify entry", time);
    const decision = reviewFromMemory(result, origin);
    expect(decision.classification).toBe("assumed-entry-scenario");
    expect(decision.citations).toEqual([{ slug: p.slug, version: 2, availableAt: time, sourceIds: ["s1"], originRefs: [origin] }]);
    expect(calls.map(x => x.url)).toContain("https://api.livingbrain.com/v1/brains/b1/pages/hedge-review");
    expect(JSON.stringify(result)).not.toContain("Future unsupported hint");
  });
  it("fails closed when no supported review can be retrieved", () => {
    expect(reviewFromMemory({ cutoff: time, pages: [], exclusions: [] }, origin).classification).toBe("needs-supported-review");
  });
  it("does not classify from wording on a page compiled from another capture", () => {
    const citation = { slug: p.slug, version: 2, availableAt: time, sourceIds: ["s9"], originRefs: ["wattness:DSWL_ESS_ESR1:0xroot:context-v1"] };
    const unrelated = { cutoff: time, pages: [{ page: p, citation }], exclusions: [] };
    expect(reviewFromMemory(unrelated, origin).classification).toBe("needs-supported-review");
    expect(reviewFromMemory({ ...unrelated, pages: [{ page: p, citation: { ...citation, originRefs: [] } }] }, origin).citations).toEqual([]);
    expect(() => reviewFromMemory(unrelated, "")).toThrow("originRef");
  });
  it("excludes a hit whose slug is not a plain identifier instead of failing the review", async () => {
    const { c, calls } = client([json([{ slug: "../other", status: "active" }])]);
    const result = await c.retrieveAt("b1", "classify entry", time);
    expect(result.pages).toEqual([]);
    expect(result.exclusions).toEqual([{ slug: "../other", reason: "Page slug is not a plain identifier" }]);
    expect(calls).toHaveLength(1);
  });
});
describe("capture protocol and safety", () => {
  it("waits for asynchronous completion and identifies the exact source", async () => {
    const { c } = client([json({ items: [{ ...s, status: "compiling", compiledAt: null }] }), json({ items: [s] })]);
    let sleeps = 0;
    const out = await c.waitForCapture("b1", "s1", { attempts: 2, sleep: async () => { sleeps++; } });
    expect(out.status).toBe("completed"); expect(sleeps).toBe(1);
  });
  it("bounds a pending capture instead of searching it immediately", async () => {
    const { c } = client([json({ items: [{ ...s, status: "pending", compiledAt: null }] })]);
    await expect(c.waitForCapture("b1", "s1", { attempts: 1 })).rejects.toThrow("bounded poll");
  });
  it("does not retry failed compilation", async () => {
    const { c, calls } = client([json({ items: [{ ...s, status: "failed" }] })]);
    await expect(c.waitForCapture("b1", "s1")).rejects.toThrow("compilation failed");
    expect(calls).toHaveLength(1);
  });
  it("rejects cross-brain source and page responses", async () => {
    const first = client([json({ items: [{ ...s, brainId: "b2" }] })]).c;
    await expect(first.sources("b1", ["s1"])).rejects.toThrow("Cross-brain");
    const second = client([json({ ...p, brainId: "b2" })]).c;
    await expect(second.readPage("b1", p.slug)).rejects.toThrow("Cross-brain");
  });
  it("sends credentials only to the fixed API and removes them from evidence", async () => {
    const evidence: unknown[] = [], calls: Array<{ url: string; headers: Headers }> = [];
    const c = new LivingBrain({ apiKey: "unit-key", subjectId: "unit-subject", authMode: "api-key",
      onEvidence: e => evidence.push(e),
      fetch: async (url, options) => { calls.push({ url: String(url), headers: new Headers(options?.headers) }); return json({ ...s, secretEcho: "unit-key unit-subject", subjectId: "unit-subject" }); },
    });
    await c.capture("b1", "A public reviewed lesson.", "Review", "record:s1");
    expect(calls[0]?.url).toBe("https://api.livingbrain.com/v1/brains/b1/captures");
    expect(calls[0]?.headers.get("x-api-key")).toBe("unit-key");
    expect(JSON.stringify(evidence)).not.toContain("unit-key");
    expect(JSON.stringify(evidence)).not.toContain("unit-subject");
    expect(JSON.stringify(evidence)).toContain("r1");
  });
  it("requires idempotency and refuses contact-bearing captures", async () => {
    const { c, calls } = client([]);
    await expect(c.capture("b1", "lesson", "Review", "")).rejects.toThrow("originRef");
    await expect(c.capture("b1", "contact@example.invalid", "Review", "r1")).rejects.toThrow("Contact addresses");
    expect(calls).toHaveLength(0);
  });
  it("rejects identifier traversal and does not expose HTTP error bodies", async () => {
    const { c, calls } = client([json({ secret: "unit-key" }, 401)]);
    await expect(c.readPage("b1", "../secret")).rejects.toThrow("Invalid API identifier");
    await expect(c.graph("b1")).rejects.toEqual(new MemoryError("Living Brain returned HTTP 401", 401));
    expect(calls).toHaveLength(1);
  });
  it("redacts nested identity fields and credential echoes", () => {
    expect(redact({ subjectId: "a", nested: ["unit-key"], tenantId: "t" }, ["unit-key"])).toEqual({ subjectId: "[REDACTED]", nested: ["[REDACTED]"], tenantId: "[REDACTED]" });
  });
  it("redacts account and person identifiers but keeps API object ids", () => {
    const graph = {
      nodes: [{ id: "n1", slug: "dswl-ess-esr1", createdByUserId: "u-7", lastEditedByUserId: null, contributorIds: ["u-7"], lastEditedBy: { name: "A Person" } }],
      people: [{ name: "A Person" }], storageBillingAccountId: "acct-1", organizationId: "org-1", brainId: "b1", pageId: "p1", ingestSourceId: "s1", affectedPageIds: ["p1"],
    };
    expect(redact(graph)).toEqual({
      nodes: [{ id: "n1", slug: "dswl-ess-esr1", createdByUserId: "[REDACTED]", lastEditedByUserId: null, contributorIds: "[REDACTED]", lastEditedBy: "[REDACTED]" }],
      people: "[REDACTED]", storageBillingAccountId: "[REDACTED]", organizationId: "[REDACTED]", brainId: "b1", pageId: "p1", ingestSourceId: "s1", affectedPageIds: ["p1"],
    });
  });
  it("refuses a contact address as the subject id", () => {
    expect(() => new LivingBrain({ apiKey: "unit-key", subjectId: "someone@example.invalid" })).toThrow("contact address");
  });
  it("rejects redirects and calls only the fixed API origin", async () => {
    const { c, calls } = client([json([]), json({ items: [] })]);
    await c.search("b1", "anything");
    await c.sources("b1", ["s1"]);
    for (const call of calls) {
      expect(call.options?.redirect).toBe("error");
      expect(call.url.startsWith("https://api.livingbrain.com/v1/")).toBe(true);
    }
  });
});
