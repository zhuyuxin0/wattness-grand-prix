import hardhatViem from "@nomicfoundation/hardhat-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatViem],
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
    // The deployed GateRecord, compiled from its package so tests read the real contract.
    npmFilesToBuild: ["@gatelock/contracts/contracts/GateRecord.sol"],
  },
});
