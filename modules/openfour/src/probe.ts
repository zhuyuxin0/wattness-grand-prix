import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { bscTestnet } from 'viem/chains';

const RPC = 'https://bsc-testnet.publicnode.com';
const SOURCE_COMMIT = '079a45e9c3358c9f357c84f336c7d915c9f0e9fc';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const addresses = {
  registry: '0xE5014c0616e528B0ABF7CC120A58032c1FbE7060',
  core: '0xd6DAC7815A3B007822E0829bcDB3f193041285Db',
  feeRouter: '0x5BEA99298A6E731897ef2516EafC1f0289e0cc87',
  createDeployer: '0x8B67c37f17856B13Ff86A33Cc5386bC0A589D37B',
  tools: '0xdECbE01E91A3c0Abf841d3E32c1587a3b62E38c6',
} as const;
const PRESET = 1778027615722n;
const allowedMethods = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getStorageAt', 'eth_call']);
const requests: unknown[] = [];
const results: Record<string, unknown> = {};
const startedAt = new Date().toISOString();
const stringify = (value: unknown) => JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v, 2);

const auditedFetch: typeof fetch = async (input, init) => {
  const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
  if (!body.method || !allowedMethods.has(body.method)) throw new Error('Read-only probe refused RPC method');
  const observedAt = new Date().toISOString();
  const start = performance.now();
  try {
    const response = await fetch(input, init);
    const payload = await response.clone().json() as unknown;
    requests.push({ observedAt, durationMs: Math.round(performance.now() - start), request: body, httpStatus: response.status, response: payload });
    return response;
  } catch (error) {
    requests.push({ observedAt, durationMs: Math.round(performance.now() - start), request: body, error: String(error) });
    throw error;
  }
};

const client = createPublicClient({ chain: bscTestnet, transport: http(RPC, { fetchFn: auditedFetch, timeout: 15_000, retryCount: 0 }) });

async function observe(label: string, call: () => Promise<unknown>): Promise<unknown> {
  try {
    const value = await call();
    results[label] = { ok: true, value };
    return value;
  } catch (error) {
    results[label] = { ok: false, error: String(error) };
    return undefined;
  }
}

const addressAbi = parseAbi([
  'function registry() view returns (address)',
  'function feeRouter() view returns (address)',
  'function wrappedNative() view returns (address)',
  'function signer() view returns (address)',
  'function openFourCore() view returns (address)',
  'function openFourTool() view returns (address)',
  'function createDeployer() view returns (address)',
]);
const presetAbi = parseAbi([
  'function getPresetIdsCount() view returns (uint256)',
  'function getPresetIdsByBatch(uint256 index,uint256 count) view returns (uint256[])',
  'function getPreset(uint256 presetId) view returns ((uint256 id,string name,string description,string version,bool active,bool createEnabled,address validator,bytes32 tokenModuleId,bytes32 vaultModuleId,bytes32 curveModuleId,bytes32 tradeModuleId,bytes32 migrateModuleId,bytes32 tokenImplId,bytes32 customDataId,address author))',
  'function resolvePresetImplementations(uint256 presetId) view returns ((uint256 id,string name,string description,string version,bool active,bool createEnabled,address validator,bytes32 tokenModuleId,bytes32 vaultModuleId,bytes32 curveModuleId,bytes32 tradeModuleId,bytes32 migrateModuleId,bytes32 tokenImplId,bytes32 customDataId,address author),address tokenModule,address vaultModule,address curveModule,address tradeModule,address migrateModule,address customDataModule)',
  'function getModuleImplementation(bytes32 moduleKey) view returns (address)',
  'function getModule(bytes32 moduleKey) view returns ((address beacon,uint8 kind,(bytes32 moduleId,string version,string name,string description,address author,uint16 feeShareBps) metadata,bool active))',
]);
const SCHEMA = '(string kind,uint8 version,(string name,string abiType,uint8 decimals,bool optional,string title,string defaultValue,string hint,string minValue,string maxValue)[] params)';
const moduleAbi = parseAbi([
  `function moduleEncodeSchema() pure returns (${SCHEMA})`,
  'function descriptor() view returns (bytes8 tagId,string tag,string version)',
]);
const toolsAbi = parseAbi([
  `function getPresetEncodeSchemas(uint256 presetId) view returns (${Array.from({ length: 6 }, (_, i) => `${SCHEMA} schema${i}`).join(',')})`,
]);

try {
  const chainId = await client.getChainId();
  results.chainId = chainId;
  if (chainId !== 97) throw new Error(`Expected chain 97, received ${chainId}`);
  const block = await client.getBlock(process.argv[3] ? { blockNumber: BigInt(process.argv[3]) } : { blockTag: 'latest' });
  const blockNumber = block.number;
  results.block = { number: blockNumber, hash: block.hash, timestamp: block.timestamp, observedAt: new Date().toISOString(), ageSecondsAtRead: Math.floor(Date.now() / 1_000) - Number(block.timestamp) };
  await Promise.all(Object.entries(addresses).map(async ([name, address]) => {
    await observe(`${name}.proxy`, async () => {
      const [code, slot] = await Promise.all([
        client.getBytecode({ address, blockNumber }),
        client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
      ]);
      const implementation = slot && slot.length === 66 ? `0x${slot.slice(-40)}` as Address : undefined;
      const implementationCode = implementation ? await client.getBytecode({ address: implementation, blockNumber }) : undefined;
      const digest = (value: string | undefined) => value && value !== '0x' ? createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex') : null;
      return { address, byteLength: code ? (code.length - 2) / 2 : 0, codeSha256: digest(code), implementationSlot: slot, implementation, implementationByteLength: implementationCode ? (implementationCode.length - 2) / 2 : 0, implementationCodeSha256: digest(implementationCode) };
    });
  }));
  await Promise.all([
    ...(['registry', 'feeRouter', 'wrappedNative', 'signer'] as const).map((functionName) => observe(`core.${functionName}`, () => client.readContract({ address: addresses.core, abi: addressAbi, functionName, blockNumber }))),
    ...(['openFourCore', 'openFourTool', 'createDeployer'] as const).map((functionName) => observe(`registry.${functionName}`, () => client.readContract({ address: addresses.registry, abi: addressAbi, functionName, blockNumber }))),
    observe('registry.getPresetIdsCount', () => client.readContract({ address: addresses.registry, abi: presetAbi, functionName: 'getPresetIdsCount', blockNumber })),
    observe('registry.getPresetIdsByBatch', () => client.readContract({ address: addresses.registry, abi: presetAbi, functionName: 'getPresetIdsByBatch', args: [0n, 10n], blockNumber })),
    observe('registry.getPreset', () => client.readContract({ address: addresses.registry, abi: presetAbi, functionName: 'getPreset', args: [PRESET], blockNumber })),
    observe('tools.getPresetEncodeSchemas', () => client.readContract({ address: addresses.tools, abi: toolsAbi, functionName: 'getPresetEncodeSchemas', args: [PRESET], blockNumber })),
  ]);
  const resolved = await observe('registry.resolvePresetImplementations', () => client.readContract({ address: addresses.registry, abi: presetAbi, functionName: 'resolvePresetImplementations', args: [PRESET], blockNumber }));
  if (Array.isArray(resolved)) {
    await Promise.all(['token', 'vault', 'curve', 'trade', 'migrate', 'customData'].map(async (name, index) => {
      const address: unknown = resolved[index + 1];
      if (typeof address !== 'string' || /^0x0{40}$/i.test(address)) return;
      await Promise.all([
        observe(`resolvedAddress.${name}.schema`, () => client.readContract({ address: address as Address, abi: moduleAbi, functionName: 'moduleEncodeSchema', blockNumber })),
        observe(`resolvedAddress.${name}.descriptor`, () => client.readContract({ address: address as Address, abi: moduleAbi, functionName: 'descriptor', blockNumber })),
      ]);
    }));
    const preset: unknown = resolved[0];
    if (typeof preset === 'object' && preset !== null) {
      await Promise.all(['token', 'vault', 'curve', 'trade', 'migrate'].map(async (name) => {
        const key: unknown = (preset as Record<string, unknown>)[`${name}ModuleId`];
        if (typeof key !== 'string') return;
        const args = [key as `0x${string}`] as const;
        const implementation = await observe(`module.${name}.implementation`, () => client.readContract({ address: addresses.registry, abi: presetAbi, functionName: 'getModuleImplementation', args, blockNumber }));
        await observe(`module.${name}.record`, () => client.readContract({ address: addresses.registry, abi: presetAbi, functionName: 'getModule', args, blockNumber }));
        if (typeof implementation !== 'string' || /^0x0{40}$/i.test(implementation)) return;
        await Promise.all([
          observe(`module.${name}.schema`, () => client.readContract({ address: implementation as Address, abi: moduleAbi, functionName: 'moduleEncodeSchema', blockNumber })),
          observe(`module.${name}.descriptor`, () => client.readContract({ address: implementation as Address, abi: moduleAbi, functionName: 'descriptor', blockNumber })),
        ]);
      }));
    }
  }
} catch (error) {
  results.fatal = String(error);
  process.exitCode = 1;
} finally {
  const output = resolve(process.argv[2] ?? '../../evidence/openfour/testnet-probe.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${stringify({ sourceCommit: SOURCE_COMMIT, rpc: RPC, startedAt, completedAt: new Date().toISOString(), mode: 'read-only', results, requests, transactions: [] })}\n`);
  console.log(stringify({ output, observations: Object.keys(results).length, rpcCalls: requests.length, failed: Object.entries(results).filter(([, v]) => typeof v === 'object' && v !== null && 'ok' in v && v.ok === false).map(([key]) => key), fatal: results.fatal ?? null }));
}
