export type NbtTag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'float'; value: number }
  | { type: 'double'; value: number }
  | { type: 'byteArray'; value: Uint8Array }
  | { type: 'string'; value: string }
  | { type: 'list'; elementType: NbtElementType; value: NbtTag[] }
  | { type: 'compound'; value: ReadonlyMap<string, NbtTag> }
  | { type: 'intArray'; value: Int32Array }
  | { type: 'longArray'; value: BigInt64Array };

export type NbtElementType =
  | 'byte' | 'short' | 'int' | 'long' | 'float' | 'double'
  | 'byteArray' | 'string' | 'list' | 'compound' | 'intArray' | 'longArray';
