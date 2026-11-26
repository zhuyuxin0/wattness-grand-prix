import { concat, getContractAddress, keccak256, type Address, type Hex } from "viem";

// The address Flap's Portal gives a launch's token: CREATE2 from the Portal of a
// minimal clone of the tax token implementation, with the round's salt
// (packages/adapters/flap/src/season.ts predictToken).
//
// Only viem: Node runs this file directly in test/markets.test.mjs.

export function predictToken(salt: Hex, portal: Address, impl: Address): Address {
  const clone = concat(["0x3d602d80600a3d3981f3363d3d373d3d3d363d73", impl, "0x5af43d82803e903d91602b57fd5bf3"]);
  return getContractAddress({ opcode: "CREATE2", from: portal, salt, bytecodeHash: keccak256(clone) });
}
