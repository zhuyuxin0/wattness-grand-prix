import { describe, expect, it } from "vitest";
import { checkSources, type Fetcher } from "../src/sources.js";

const SHA = "0".repeat(64);

function recording(): { fetcher: Fetcher; urls: string[] } {
  const urls: string[] = [];
  return { urls, fetcher: async (url) => (urls.push(url), null) };
}

describe("checkSources", () => {
  it("fetches nothing for a cited route on an excluded day", async () => {
    const { fetcher, urls } = recording();
    const r = await checkSources(
      {
        releaseId: "r1",
        manifestSha256: SHA,
        files: [{ route: "/api/prices/HB_NORTH/2026-08-10", sha256: SHA }],
        live: [{ route: `days/2026-09-29/${SHA}.json`, sha256: SHA }],
      },
      { fetcher, site: "https://example.test" },
    );
    expect(urls).toEqual([]);
    expect(r.problems).toHaveLength(2);
    expect(r.problems.every((p) => p.includes("excluded day; not fetched"))).toBe(true);
  });

  it("still fetches a day just outside the window", async () => {
    const { fetcher, urls } = recording();
    await checkSources(
      { releaseId: null, manifestSha256: null, files: [], live: [{ route: `days/2026-09-30/${SHA}.json`, sha256: SHA }] },
      { fetcher, site: "https://example.test" },
    );
    expect(urls).toEqual([`https://example.test/live/v1/days/2026-09-30/${SHA}.json`]);
  });
});
