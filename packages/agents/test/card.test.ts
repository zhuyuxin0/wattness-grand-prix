import { canonicalJson, fileSha256, scopeId } from "@gatelock/core";
import { describe, expect, it } from "vitest";
import { BSC_TESTNET, buildCard, cardBytes, cardErrors, cardSha256, REGISTRATION_TYPE, ROLE_IDS, type CardContext } from "../src/index.js";

const wallet = "0x1111111111111111111111111111111111111111";
const ctx: CardContext = {
  agentId: 2930,
  chainId: 97,
  registry: BSC_TESTNET.registry,
  wallet,
  seal: {
    contract: "GateRecord",
    address: BSC_TESTNET.gateRecord,
    chain_ids: [56, 97],
    scope_label: "gate-record/ercot-da-energy",
    scope_id: scopeId("gate-record/ercot-da-energy"),
    committer: "0xfa22C29C4c3d975FCC617D899B1B695eFF2d94b8",
    gate: "10:00 Central on the day before the operating day, computed by the contract",
  },
};
const expect97 = { agentId: 2930, chainId: 97, registry: BSC_TESTNET.registry };

describe("cards", () => {
  it("are ERC-8004 registration files that name their own agent id", () => {
    for (const id of ROLE_IDS) {
      const card = buildCard(id, ctx);
      expect(card.type).toBe(REGISTRATION_TYPE);
      expect(card.registrations).toEqual([{ agentId: 2930, agentRegistry: `eip155:97:${BSC_TESTNET.registry}` }]);
      expect(cardErrors(card, { ...expect97, role: id, wallet })).toEqual([]);
    }
  });

  it("are stored as canonical JSON, so the file hash is the card's hash", () => {
    const card = buildCard("forecaster", ctx);
    const text = new TextDecoder().decode(cardBytes(card));
    expect(text).toBe(canonicalJson(card));
    expect(cardSha256(card)).toBe(fileSha256(text));
    expect(canonicalJson(JSON.parse(text))).toBe(text);
  });

  it("say where the role's output is sealed", () => {
    const card = buildCard("planner", ctx);
    expect(card.role.seals_under.scope_id).toBe("0x4ace28d1c5fc87449d9960b5d139d6667e75a42fad1082c63dc9ba3f08586bb9");
    expect(card.role.code.repo).toBe("https://github.com/zhuyuxin0/wattness-grand-prix");
    expect(card.role.hands_to).toEqual([]);
    expect(card.role.takes_from).toContain("forecaster");
  });

  it("are refused when they name another agent, role or wallet", () => {
    const card = buildCard("hedger", ctx);
    expect(cardErrors(card, { ...expect97, agentId: 2931 })).toEqual([expect.stringMatching(/does not name agent 2931/)]);
    expect(cardErrors(card, { role: "planner" })).toEqual(["role.id is hedger, expected planner"]);
    expect(cardErrors(card, { wallet: "0x2222222222222222222222222222222222222222" })[0]).toMatch(/role.wallet/);
    expect(cardErrors({ ...card, type: "x" })[0]).toMatch(/^type is/);
    expect(cardErrors(null)).toEqual(["card is not a JSON object"]);
  });

  it("refuse an agent id that is not a positive integer", () => {
    expect(() => buildCard("hedger", { ...ctx, agentId: 0 })).toThrow(/positive integer/);
  });
});
