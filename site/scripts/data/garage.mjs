// Garage data: the GateRecord deployments and the planner the record names.
// Written to public/data/garage.json.

import { existsSync } from "node:fs";
import { join } from "node:path";

const NETWORKS = [
  { file: "bsc-mainnet.json", explorer: "https://bscscan.com" },
  { file: "bsc-testnet.json", explorer: "https://testnet.bscscan.com" },
];

export default function garage(ctx) {
  const deployments = NETWORKS.flatMap(({ file, explorer }) => {
    const p = join(ctx.repo, "contracts", "deployments", file);
    if (!existsSync(p)) return [];
    const d = ctx.readJson(p);
    return [
      {
        chainId: d.chainId,
        network: d.network,
        contract: d.contract,
        address: d.address,
        txHash: d.txHash,
        blockNumber: Number(d.blockNumber),
        deployer: d.deployer,
        deployedAt: d.deployedAt,
        compiler: d.compiler,
        runtimeCodeHash: d.runtimeCodeHash,
        explorer,
        sourcifyUrl: `https://repo.sourcify.dev/${d.chainId}/${d.address}`,
      },
    ];
  });

  const showcase = ctx.leaf(ctx.day.showcase);
  ctx.writeJson(
    "garage.json",
    {
      schema: "grand-prix.garage.v1",
      deployments,
      engine: showcase?.engine ?? null,
      agent: showcase?.agent ?? null,
      manifestSchema: showcase?.schema ?? null,
      indexSchema: ctx.day.schema,
      scopeLabel: ctx.day.scope_label,
      codeTree: ctx.day.code_tree,
      operatingDay: ctx.day.operating_day,
    },
    "contracts/deployments, the showcase leaf",
  );
}
