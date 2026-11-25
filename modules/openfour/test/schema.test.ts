import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { decodeModuleParams, encodeModuleParams, type ModuleEncodeSchema } from '../src/schema.js';

const dynamic: ModuleEncodeSchema = {
  kind: 'migrate', version: 1,
  params: [
    { name: 'minimumQuote', abiType: 'uint256' },
    { name: 'evidenceUri', abiType: 'string' },
    { name: 'evidenceHash', abiType: 'bytes' },
  ],
};

describe('OpenFour struct parameter encoding', () => {
  it('round-trips dynamic evidence fields as one Solidity tuple', () => {
    const values = [100n, 'ipfs://evidence', '0x010203'] as const;
    expect(decodeModuleParams(dynamic, encodeModuleParams(dynamic, values))).toEqual(values);
  });

  it('exposes the stale flat-root comment: dynamic layouts differ', () => {
    const values = [100n, 'ipfs://evidence', '0x010203'] as const;
    const flat = encodeAbiParameters(parseAbiParameters('uint256,string,bytes'), values);
    const tuple = encodeModuleParams(dynamic, values);
    expect(flat).not.toEqual(tuple);
    expect(() => decodeModuleParams(dynamic, flat)).toThrow();
  });

  it('shows why static-only examples conceal the layout error', () => {
    const schema = { kind: 'migrate', version: 1, params: [{ name: 'a', abiType: 'uint256' }, { name: 'b', abiType: 'bool' }] };
    expect(encodeModuleParams(schema, [10n, true])).toEqual(
      encodeAbiParameters(parseAbiParameters('uint256,bool'), [10n, true]),
    );
  });

  it('requires schema order and the exact number of values', () => {
    expect(() => encodeModuleParams(dynamic, [100n, 'ipfs://evidence'])).toThrow('count mismatch');
  });

  it('keeps a parameterless module as empty bytes', () => {
    const empty = { kind: 'curve', version: 1, params: [] };
    expect(encodeModuleParams(empty, [])).toBe('0x');
    expect(decodeModuleParams(empty, '0x')).toEqual([]);
    expect(() => decodeModuleParams(empty, '0x00')).toThrow('Unexpected bytes');
  });
});
