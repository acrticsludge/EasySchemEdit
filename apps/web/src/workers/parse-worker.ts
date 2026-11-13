// apps/web/src/workers/parse-worker.ts
// Web Worker for offloading NBT parsing from the main thread.

export interface ParseRequest {
  type: 'parse';
  bytes: Uint8Array;
  fileName: string;
}

export interface ParseResponse {
  type: 'result';
  blockCount: number;
  nonAirCount: number;
  dimensions: { width: number; height: number; length: number };
  blocks: Array<{ x: number; y: number; z: number; color: number }>;
}

export interface ParseError {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<ParseRequest>) => {
  const { type, bytes, fileName } = e.data;
  if (type !== 'parse') return;

  try {
    // NbtServices using DecompressionStream
    const services = {
      gzipCompress: (b: Uint8Array) => b,
      gzipDecompress: async (b: Uint8Array, max: number) => {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(b as any);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.length;
          if (total > max) throw new Error('decompressed too large');
        }
        const result = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { result.set(c, off); off += c.length; }
        return result;
      },
    };

    const { decodeNbtFromBytes } = await import('@easyschemedit/formats');
    const root = decodeNbtFromBytes(bytes) as any;
    if (root.type !== 'compound') throw new Error('Not a compound NBT');

    const entries = root.value as Map<string, any>;
    const blocks: Array<{ x: number; y: number; z: number; color: number }> = [];
    let blockCount = 0;
    let nonAirCount = 0;
    let width = 0, height = 0, length = 0;

    const regions = entries.get('Regions')?.value as Map<string, any> | undefined;

    if (regions) {
      for (const [regionName, regionEntry] of regions) {
        const region = regionEntry.value as Map<string, any>;
        const pos = region.get('Position')?.value as number[] ?? [0, 0, 0];
        const size = region.get('Size')?.value as number[] ?? [0, 0, 0];
        const paletteEntry = region.get('BlockStatePalette')?.value as any[] ?? [];
        const blockStatesEntry = region.get('BlockStates')?.value;

        const ax = Math.abs(size[0] ?? 1);
        const ay = Math.abs(size[1] ?? 1);
        const az = Math.abs(size[2] ?? 1);
        const paletteNames: string[] = paletteEntry.map((e: any) => {
          const name = e.value?.get?.('Name')?.value ?? 'minecraft:air';
          return name;
        });

        let indices: number[] = [];
        if (blockStatesEntry?.value instanceof Uint8Array) {
          let byteOffset = 0;
          const data = blockStatesEntry.value as Uint8Array;
          while (byteOffset < data.length) {
            let result = 0;
            let bytesRead = 0;
            let byte: number;
            do {
              byte = data[byteOffset + bytesRead];
              result |= (byte & 0x7F) << (7 * bytesRead);
              bytesRead++;
            } while ((byte & 0x80) !== 0 && bytesRead < 5);
            indices.push(result);
            byteOffset += bytesRead;
          }
        }

        const total = ax * ay * az;
        blockCount += total;
        for (let i = 0; i < Math.min(indices.length, total); i++) {
          const idx = indices[i];
          const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
          if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air') continue;

          const color = Math.abs(name.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % 0xffffff;
          blocks.push({
            x: (pos[0] ?? 0) + (i % ax),
            y: (pos[1] ?? 0) + Math.floor(i / (ax * az)),
            z: (pos[2] ?? 0) + (Math.floor(i / ax) % az),
            color,
          });
          nonAirCount++;
        }
      }
    } else {
      const w = entries.get('Width')?.value ?? 0;
      const h = entries.get('Height')?.value ?? 0;
      const l = entries.get('Length')?.value ?? 0;
      width = w; height = h; length = l;

      const blocksData = entries.get('Blocks')?.value as Map<string, any>;
      const paletteList = blocksData?.get('Palette')?.value as any[];
      const paletteNames: string[] = paletteList ? paletteList.map((e: any) => (typeof e === 'string' ? e : e.value ?? 'minecraft:air')) : [];
      const dataBytes = blocksData?.get('Data')?.value as Uint8Array;

      let indices: number[] = [];
      if (dataBytes) {
        let byteOffset = 0;
        while (byteOffset < dataBytes.length) {
          let result = 0;
          let bytesRead = 0;
          let byte: number;
          do {
            byte = dataBytes[byteOffset + bytesRead];
            result |= (byte & 0x7F) << (7 * bytesRead);
            bytesRead++;
          } while ((byte & 0x80) !== 0 && bytesRead < 5);
          indices.push(result);
          byteOffset += bytesRead;
        }
      }

      const total = w * h * l;
      blockCount = total;
      for (let i = 0; i < Math.min(indices.length, total); i++) {
        const idx = indices[i];
        const name = idx >= 0 && idx < paletteNames.length ? paletteNames[idx] : 'minecraft:air';
        if (name === 'minecraft:air' || name === 'minecraft:cave_air' || name === 'minecraft:void_air') continue;

        const color = Math.abs(name.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % 0xffffff;
        blocks.push({
          x: i % w,
          y: Math.floor(i / (w * l)),
          z: Math.floor(i / w) % l,
          color,
        });
        nonAirCount++;
      }
    }

    const response: ParseResponse = {
      type: 'result',
      blockCount,
      nonAirCount,
      dimensions: { width, height, length },
      blocks,
    };
    self.postMessage(response);
  } catch (err) {
    const error: ParseError = {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(error);
  }
};