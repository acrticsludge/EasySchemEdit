import {
  encodeChunk,
  decodeChunk,
  type ChunkCodecServices,
} from '../chunk-codec.ts';
import type { VoxelChunk } from '../volume.ts';
import { CANONICAL_AIR } from '../block-state.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// Mock SHA-256 service (not real crypto, just for testing round-trip)
const mockServices: ChunkCodecServices = {
  async hashSha256(bytes: Uint8Array): Promise<Uint8Array> {
    // Simple hash for testing — not cryptographic
    const hash = new Uint8Array(32);
    for (let i = 0; i < bytes.length; i++) {
      hash[i % 32] ^= bytes[i];
    }
    return hash;
  },
};

// Test 1: Encode/decode round-trip with 3 palette entries
async function testRoundTrip() {
  const chunk: VoxelChunk = {
    key: '0_0_0',
    palette: [
      CANONICAL_AIR,
      { id: 'minecraft:stone', props: {} },
      { id: 'minecraft:oak_log', props: { axis: 'y' } },
    ],
    indices: new Uint8Array(4096),
    revision: 0,
  };
  // Set some blocks
  chunk.indices[0] = 1; // stone
  chunk.indices[1] = 2; // oak_log

  const encoded = await encodeChunk(chunk, mockServices);
  assert(encoded.length > 0, 'encoded chunk has data');

  // Verify magic bytes
  assert(encoded[0] === 0x56 && encoded[1] === 0x4F && encoded[2] === 0x4F && encoded[3] === 0x58, 'magic bytes VOOX');

  const decoded = await decodeChunk(encoded, mockServices);
  assert(decoded.valid, 'SHA-256 valid');
  assert(decoded.chunk.palette.length === 3, 'palette has 3 entries');
  assert(decoded.chunk.palette[0].id === 'minecraft:air', 'palette[0] is air');
  assert(decoded.chunk.palette[1].id === 'minecraft:stone', 'palette[1] is stone');
  assert(decoded.chunk.indices[0] === 1, 'index[0] is stone');
  assert(decoded.chunk.indices[1] === 2, 'index[1] is oak_log');
}

// Test 2: Corrupt one byte → SHA-256 mismatch
async function testCorruption() {
  const chunk: VoxelChunk = {
    key: '0_0_0',
    palette: [CANONICAL_AIR],
    indices: new Uint8Array(4096),
    revision: 0,
  };
  const encoded = await encodeChunk(chunk, mockServices);
  const corrupted = new Uint8Array(encoded);
  corrupted[10] ^= 0xFF; // corrupt a byte

  const decoded = await decodeChunk(corrupted, mockServices);
  assert(!decoded.valid, 'corrupted chunk detected as invalid');
}

async function main() {
  await testRoundTrip();
  await testCorruption();

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
