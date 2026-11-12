// Subspec B — Slice b-2: Signed-Size Normalization (Litematic)
// Reversal is for negative Size, not mirroring.
// Linear index = x + z*ax + y*ax*az (strides x=1, z=ax, y=ax*az).
// Reverse each axis with that axis's own dimension.
export type RegionSize = { ax: number; ay: number; az: number };

export function normalizeRegionSize(size: RegionSize): RegionSize {
  return { ax: Math.abs(size.ax), ay: Math.abs(size.ay), az: Math.abs(size.az) };
}

export function rawToNormalizedCoord(
  x: number,
  y: number,
  z: number,
  size: RegionSize,
): { x: number; y: number; z: number } {
  return {
    x: size.ax < 0 ? -size.ax - 1 - x : x,
    y: size.ay < 0 ? -size.ay - 1 - y : y,
    z: size.az < 0 ? -size.az - 1 - z : z,
  };
}

export function normalizedToWorld(
  nx: number,
  ny: number,
  nz: number,
  position: [number, number, number],
  size: RegionSize,
): [number, number, number] {
  return [
    position[0] + (size.ax < 0 ? -size.ax - 1 - nx : nx),
    position[1] + (size.ay < 0 ? -size.ay - 1 - ny : ny),
    position[2] + (size.az < 0 ? -size.az - 1 - nz : nz),
  ];
}

export function linearIndex(x: number, z: number, y: number, ax: number, az: number): number {
  return x + z * ax + y * ax * az;
}

export function reverseAxis(
  indices: Uint32Array,
  axis: 'x' | 'y' | 'z',
  dim: number,
  ax: number,
  az: number,
): void {
  const stride = axis === 'x' ? 1 : axis === 'z' ? ax : ax * az;
  const half = Math.floor(dim / 2);
  for (let i = 0; i < half; i++) {
    const j = dim - 1 - i;
    const tmp = indices[i * stride];
    indices[i * stride] = indices[j * stride];
    indices[j * stride] = tmp;
  }
}
