// Slice b-2: signed-Size normalization (Litematic)
import {
  normalizeRegionSize,
  rawToNormalizedCoord,
  normalizedToWorld,
  linearIndex,
  reverseAxis,
} from '../litematic-size.ts';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    console.assert(cond, msg);
    failures++;
  }
  console.log(msg + ' -> ' + cond);
}

// 1. normalizeRegionSize returns absolute dimensions
{
  const n = normalizeRegionSize({ ax: -5, ay: 3, az: -2 });
  check(n.ax === 5 && n.ay === 3 && n.az === 2, 'normalizeRegionSize abs');
}

// 2. rawToNormalizedCoord with negative ax reverses X using ax
{
  const c = rawToNormalizedCoord(0, 0, 0, { ax: -5, ay: 3, az: 2 });
  check(c.x === 4 && c.y === 0 && c.z === 0, 'rawToNormalizedCoord negative ax');
}

// 3. rawToNormalizedCoord with negative az reverses Z using az
{
  const c = rawToNormalizedCoord(0, 0, 0, { ax: 3, ay: 2, az: -5 });
  check(c.x === 0 && c.y === 0 && c.z === 4, 'rawToNormalizedCoord negative az');
}

// 4. rawToNormalizedCoord with negative ay reverses Y using ay
{
  const c = rawToNormalizedCoord(0, 0, 0, { ax: 3, ay: -5, az: 2 });
  check(c.x === 0 && c.y === 4 && c.z === 0, 'rawToNormalizedCoord negative ay');
}

// 5. normalizedToWorld with negative ay reverses Y using ay
{
  const c = normalizedToWorld(0, 0, 0, [10, 20, 30], { ax: 3, ay: -5, az: 2 });
  check(c[0] === 10 && c[1] === 24 && c[2] === 30, 'normalizedToWorld negative ay');
}

// 6. linearIndex = x + z*ax + y*ax*az
{
  const idx = linearIndex(1, 2, 3, 5, 7);
  check(idx === 1 + 2 * 5 + 3 * 5 * 7, 'linearIndex strides');
}

// 7. Non-cubic region 3x5x2 reversal uses each axis's own dimension
{
  // Reverse X: stride=1, dim=3 (ax=3). indices=[A,B,C] → [C,B,A]
  const indicesX = new Uint32Array([100, 101, 102]);
  reverseAxis(indicesX, 'x', 3, 3, 2);
  check(indicesX[0] === 102 && indicesX[2] === 100, 'reverseAxis X uses ax=3');

  // Reverse Y: stride=ax*az=6, dim=5 (ay=5). Positions 0,6,12,18,24 → reversed
  const indicesY = new Uint32Array(25);
  indicesY[0] = 100; indicesY[6] = 101; indicesY[12] = 102; indicesY[18] = 103; indicesY[24] = 104;
  reverseAxis(indicesY, 'y', 5, 3, 2);
  check(
    indicesY[0] === 104 && indicesY[6] === 103 && indicesY[24] === 100 && indicesY[12] === 102,
    'reverseAxis Y uses ay=5',
  );

  // Reverse Z: stride=ax=3, dim=2 (az=2). Positions 0,3 → reversed
  const indicesZ = new Uint32Array([100, 101, 102, 103, 104, 105]);
  reverseAxis(indicesZ, 'z', 2, 3, 2);
  check(
    indicesZ[0] === 103 && indicesZ[3] === 100 && indicesZ[1] === 101,
    'reverseAxis Z uses az=2',
  );
}

// 8. Positive size is identity
{
  const c = rawToNormalizedCoord(1, 2, 3, { ax: 5, ay: 5, az: 5 });
  check(c.x === 1 && c.y === 2 && c.z === 3, 'positive size identity');
}

console.log(failures === 0 ? 'All slice b-2 signed-size tests passed.' : failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
