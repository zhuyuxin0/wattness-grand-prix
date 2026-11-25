import { decodeAbiParameters, encodeAbiParameters, parseAbiParameters, type Hex } from 'viem';

export interface ModuleEncodeSchema {
  readonly kind: string;
  readonly version: number;
  readonly params: readonly { readonly name: string; readonly abiType: string }[];
}

function tupleParameters(schema: ModuleEncodeSchema) {
  if (schema.params.some((field) => !field.abiType.trim())) throw new Error('Empty ABI type');
  return parseAbiParameters(`(${schema.params.map((field) => field.abiType).join(',')})`);
}

/** Values are already in contract units; field order follows the live schema. */
export function encodeModuleParams(schema: ModuleEncodeSchema, values: readonly unknown[]): Hex {
  if (values.length !== schema.params.length) throw new Error('Schema/value count mismatch');
  if (schema.params.length === 0) return '0x';
  return encodeAbiParameters(tupleParameters(schema), [values]);
}

export function decodeModuleParams(schema: ModuleEncodeSchema, blob: Hex): readonly unknown[] {
  if (schema.params.length === 0) {
    if (blob !== '0x') throw new Error('Unexpected bytes for an empty schema');
    return [];
  }
  const tuple = decodeAbiParameters(tupleParameters(schema), blob)[0];
  if (!Array.isArray(tuple)) throw new Error('Expected a single module tuple');
  return tuple;
}
