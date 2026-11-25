import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isRoleId, role, ROLE_IDS, ROLES, secretNames } from "../src/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("roles", () => {
  it("are the six roles of the plan, each once", () => {
    expect(ROLES.map((r) => r.id)).toEqual([...ROLE_IDS]);
    expect(new Set(ROLES.map((r) => r.key)).size).toBe(6);
    expect(ROLES.every((r) => r.title && r.summary && r.method && r.writes.length > 0)).toBe(true);
  });

  it("point at code that is in the repository", () => {
    for (const r of ROLES) for (const path of r.code) expect(existsSync(join(REPO, path)), `${r.id}: ${path}`).toBe(true);
  });

  it("agree on every handoff from both ends", () => {
    for (const r of ROLES) {
      for (const to of r.handsTo) expect(role(to).takesFrom, `${r.id} -> ${to}`).toContain(r.id);
      for (const from of r.takesFrom) expect(role(from).handsTo, `${from} -> ${r.id}`).toContain(r.id);
    }
  });

  it("name their secrets after the role", () => {
    expect(secretNames("state-keeper")).toEqual({ key: "AGENT_STATE_KEEPER_PRIVATE_KEY", address: "AGENT_STATE_KEEPER_ADDRESS" });
    expect(isRoleId("planner")).toBe(true);
    expect(isRoleId("pilot")).toBe(false);
    expect(() => role("pilot" as never)).toThrow(/unknown role/);
  });
});
