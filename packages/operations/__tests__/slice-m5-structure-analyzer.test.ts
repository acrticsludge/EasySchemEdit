// packages/operations/__tests__/slice-m5-structure-analyzer.test.ts
// Unit and integration tests for Slice M5: Structure Analyzer & Software PNG Renderer.
// Pure TypeScript, runs with node --experimental-strip-types.

// Ambient declarations for Node.js built-ins in test environment
declare const process: { exit(code?: number): void };

// @ts-ignore: node:fs module available at runtime in node
import { existsSync, readFileSync } from 'node:fs';
// @ts-ignore: node:path module available at runtime in node
import { resolve } from 'node:path';
import type { Bounds3i, Vec3i } from '../../domain/types.ts';
import { EditorSession } from '../src/session.ts';
import {
  setVoxelBlocksBatch,
  generateShape,
  generateStructure,
  inspectRegionVoxels,
} from '../src/build-generator.ts';
import {
  classifyBlock,
  analyzeSchematicStructures,
  generateSpatialAsciiMap,
  renderSchematicPng,
  encodeRgbaToPng,
  uint8ArrayToBase64,
  type SemanticRole,
  type StructureInfo,
} from '../src/structure-analyzer.ts';
import { importSchematic } from '../../formats/index.ts';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('--- Test Suite: Slice M5 Structure Analyzer & PNG Renderer ---');

// ============================================================================
// 1. Block Classification & Color Mapping
// ============================================================================
{
  console.log('1. Block Classifier');
  const grass = classifyBlock('minecraft:grass_block');
  assertEqual(grass.role, 'terrain', 'grass_block is terrain');
  assertEqual(grass.color[0], 100, 'grass_block red channel');

  const stoneBricks = classifyBlock('stone_bricks');
  assertEqual(stoneBricks.role, 'wall', 'stone_bricks is wall');

  const water = classifyBlock('minecraft:water');
  assertEqual(water.role, 'water', 'water is water');

  const oakLeaves = classifyBlock('minecraft:oak_leaves');
  assertEqual(oakLeaves.role, 'vegetation', 'oak_leaves is vegetation');

  const oakLog = classifyBlock('minecraft:oak_log');
  assertEqual(oakLog.role, 'vegetation', 'oak_log is vegetation');

  const oakPlanks = classifyBlock('minecraft:oak_planks');
  assertEqual(oakPlanks.role, 'structural', 'oak_planks is structural');

  const oakStairs = classifyBlock('minecraft:oak_stairs');
  assertEqual(oakStairs.role, 'roof', 'oak_stairs is roof');

  const glass = classifyBlock('minecraft:glass');
  assertEqual(glass.role, 'glass', 'glass is glass');

  const ironDoor = classifyBlock('minecraft:iron_door');
  assertEqual(ironDoor.role, 'door', 'iron_door is door');

  const torch = classifyBlock('minecraft:torch');
  assertEqual(torch.role, 'light', 'torch is light');

  const chest = classifyBlock('minecraft:chest');
  assertEqual(chest.role, 'interior', 'chest is interior');

  const redstone = classifyBlock('minecraft:redstone_wire');
  assertEqual(redstone.role, 'redstone', 'redstone_wire is redstone');

  const path = classifyBlock('minecraft:dirt_path');
  assertEqual(path.role, 'road', 'dirt_path is road');
}

// ============================================================================
// 2. Pure-TS PNG Encoder & Base64
// ============================================================================
{
  console.log('2. Pure-TS PNG Encoder & Base64');
  // Create a 4x4 RGBA test image
  const w = 4;
  const h = 4;
  const rgba = new Uint8Array(w * h * 4);
  // Red pixel at (0, 0)
  rgba[0] = 255; rgba[1] = 0; rgba[2] = 0; rgba[3] = 255;
  // Green pixel at (1, 1)
  const idx1 = (1 * w + 1) * 4;
  rgba[idx1] = 0; rgba[idx1 + 1] = 255; rgba[idx1 + 2] = 0; rgba[idx1 + 3] = 255;

  const pngBytes = encodeRgbaToPng(rgba, w, h);
  assert(pngBytes.length > 20, 'PNG bytes length > 20');

  // Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
  assertEqual(pngBytes[0], 0x89, 'PNG magic byte 0');
  assertEqual(pngBytes[1], 0x50, 'PNG magic byte 1 (P)');
  assertEqual(pngBytes[2], 0x4e, 'PNG magic byte 2 (N)');
  assertEqual(pngBytes[3], 0x47, 'PNG magic byte 3 (G)');
  assertEqual(pngBytes[4], 0x0d, 'PNG magic byte 4');
  assertEqual(pngBytes[5], 0x0a, 'PNG magic byte 5');
  assertEqual(pngBytes[6], 0x1a, 'PNG magic byte 6');
  assertEqual(pngBytes[7], 0x0a, 'PNG magic byte 7');

  const b64 = uint8ArrayToBase64(pngBytes);
  assert(b64.length > 0, 'Base64 string not empty');
  assert(b64.startsWith('iVBORw0KGgo'), 'Base64 begins with standard PNG data URL prefix');
}

// ============================================================================
// 3. Multi-Structure Town Scene: Segmentation & Semantic Classification
// ============================================================================
{
  console.log('3. Multi-Structure Town Scene Analysis');
  const session = new EditorSession();

  // A. Ground terrain plane: 80x80 grass at Y=64
  const groundBlocks: Array<{ pos: Vec3i; block: string }> = [];
  for (let z = 0; z < 80; z++) {
    for (let x = 0; x < 80; x++) {
      groundBlocks.push({ pos: [x, 64, z], block: 'minecraft:grass_block' });
    }
  }
  setVoxelBlocksBatch(session, groundBlocks, { placementName: 'Ground Terrain' });

  // B. Stone road running across Z: 38..41 at Y=64
  const roadBlocks: Array<{ pos: Vec3i; block: string }> = [];
  for (let x = 0; x < 80; x++) {
    for (let z = 38; z <= 41; z++) {
      roadBlocks.push({ pos: [x, 64, z], block: 'minecraft:dirt_path' });
    }
  }
  setVoxelBlocksBatch(session, roadBlocks, { placementName: 'Town Road' });

  // C. River channel running across X: 38..41 at Y=64
  const riverBlocks: Array<{ pos: Vec3i; block: string }> = [];
  for (let z = 0; z < 80; z++) {
    for (let x = 38; x <= 41; x++) {
      riverBlocks.push({ pos: [x, 64, z], block: 'minecraft:water' });
    }
  }
  setVoxelBlocksBatch(session, riverBlocks, { placementName: 'River Channel' });

  // D. Structure 1: Tall Watchtower at NW [12, 65, 12] (height: 18, width: 6, depth: 6)
  const towerBlocks: Array<{ pos: Vec3i; block: string }> = [];
  for (let y = 65; y <= 82; y++) {
    for (let z = 12; z <= 17; z++) {
      for (let x = 12; x <= 17; x++) {
        // Hollow tower with walls and floor
        const isWall = x === 12 || x === 17 || z === 12 || z === 17;
        const isFloor = y === 65 || y === 73 || y === 81;
        if (isWall || isFloor) {
          towerBlocks.push({ pos: [x, y, z], block: 'minecraft:stone_bricks' });
        }
      }
    }
  }
  // Add lighting on top of tower
  towerBlocks.push({ pos: [14, 83, 14], block: 'minecraft:lantern' });
  towerBlocks.push({ pos: [15, 83, 15], block: 'minecraft:lantern' });
  setVoxelBlocksBatch(session, towerBlocks, { placementName: 'Stone Watchtower' });

  // E. Structure 2: Timber House at NE [60, 65, 15] (height: 7, width: 8, depth: 8)
  const houseBlocks: Array<{ pos: Vec3i; block: string }> = [];
  for (let y = 65; y <= 69; y++) {
    for (let z = 15; z <= 22; z++) {
      for (let x = 60; x <= 67; x++) {
        const isWall = x === 60 || x === 67 || z === 15 || z === 22;
        if (isWall) {
          // Windows on sides
          if (y === 66 && (x === 63 || x === 64 || z === 18 || z === 19)) {
            houseBlocks.push({ pos: [x, y, z], block: 'minecraft:glass' });
          } else {
            houseBlocks.push({ pos: [x, y, z], block: 'minecraft:oak_planks' });
          }
        }
      }
    }
  }
  // Door at entrance
  houseBlocks.push({ pos: [63, 65, 15], block: 'minecraft:oak_door' });
  houseBlocks.push({ pos: [63, 66, 15], block: 'minecraft:oak_door' });
  // Interior furniture
  houseBlocks.push({ pos: [61, 65, 20], block: 'minecraft:crafting_table' });
  houseBlocks.push({ pos: [61, 65, 21], block: 'minecraft:chest' });
  houseBlocks.push({ pos: [65, 65, 21], block: 'minecraft:furnace' });
  // Pitched roof (oak_stairs / slabs) at Y=70..71
  for (let z = 14; z <= 23; z++) {
    for (let x = 59; x <= 68; x++) {
      houseBlocks.push({ pos: [x, 70, z], block: 'minecraft:oak_stairs' });
    }
  }
  setVoxelBlocksBatch(session, houseBlocks, { placementName: 'Timber Cottage' });

  // F. Structure 3: Oak Tree at SW [16, 65, 60]
  const treeBlocks: Array<{ pos: Vec3i; block: string }> = [];
  for (let y = 65; y <= 70; y++) {
    treeBlocks.push({ pos: [16, y, 60], block: 'minecraft:oak_log' });
  }
  for (let y = 68; y <= 71; y++) {
    for (let z = 58; z <= 62; z++) {
      for (let x = 14; x <= 18; x++) {
        if (x !== 16 || z !== 60 || y > 70) {
          treeBlocks.push({ pos: [x, y, z], block: 'minecraft:oak_leaves' });
        }
      }
    }
  }
  setVoxelBlocksBatch(session, treeBlocks, { placementName: 'Oak Tree' });

  // Run structure analysis
  const t0 = performance.now();
  const analysis = analyzeSchematicStructures(session, {
    bounds: { min: [0, 60, 0], maxExclusive: [80, 90, 80] },
    minFootprint: 8,
    minVoxels: 15,
  });
  const elapsed = performance.now() - t0;
  console.log(`Town analysis took ${elapsed.toFixed(2)}ms, found ${analysis.structures.length} structures`);

  assert(elapsed < 200, `Town analysis completed in < 200ms (got ${elapsed.toFixed(2)}ms)`);
  assertEqual(analysis.groundLevelY, 64, 'Ground level estimated at Y=64');
  assert(analysis.environment.hasWater, 'Environment detected water');
  assert(analysis.environment.hasRoads, 'Environment detected roads');
  assert(analysis.structures.length >= 3, `Detected at least 3 structures (got ${analysis.structures.length})`);

  // Verify structure categories
  const categories = analysis.structures.map((s) => s.category);
  console.log('Detected structure categories:', categories.join(', '));
  assert(categories.includes('tower'), 'Watchtower classified as tower');
  assert(categories.includes('house') || categories.includes('building'), 'Cottage classified as house/building');
  assert(categories.includes('tree-or-vegetation'), 'Tree classified as tree-or-vegetation');

  // Verify tower attributes
  const tower = analysis.structures.find((s) => s.category === 'tower');
  assert(tower !== undefined, 'Tower structure exists');
  if (tower) {
    assertEqual(tower.compassZone, 'NW', 'Tower is in NW compass zone');
    assert(tower.heightAboveGround >= 15, `Tower height above ground >= 15 (got ${tower.heightAboveGround})`);
    assert(tower.architecturalFeatures.hasLighting, 'Tower has lighting detected');
    assert(tower.architecturalFeatures.wallBlocks.length > 0, 'Tower has wall blocks');
  }

  // Verify house attributes
  const house = analysis.structures.find((s) => s.category === 'house' || s.category === 'building');
  assert(house !== undefined, 'House structure exists');
  if (house) {
    assert(house.hasInteriorCavity, 'House has interior cavity detected');
    assert(house.architecturalFeatures.hasWindows, 'House has windows detected');
    assert(house.architecturalFeatures.hasDoors, 'House has doors detected');
    assert(house.architecturalFeatures.hasRoofStairsOrSlabs, 'House has roof stairs/slabs detected');
  }

  // Verify spatial ASCII map
  const sm = analysis.spatialMap;
  assert(sm.grid.length > 5, 'Spatial ASCII map has grid lines');
  assert(sm.legend.length >= 3, 'Spatial ASCII map legend contains items');
  console.log('Sample Spatial ASCII Map:\n' + sm.grid.slice(0, 10).join('\n'));

  // Test multi-view PNG rendering
  const renderRes = renderSchematicPng(session, {
    analysis,
    view: 'composite',
    width: 840,
    height: 440,
    annotateStructures: true,
    highlightRegions: [
      { name: 'R1', bounds: { min: [10, 64, 10], maxExclusive: [20, 85, 20] } },
    ],
  });

  assertEqual(renderRes.view, 'composite', 'Render result view is composite');
  assertEqual(renderRes.width, 840, 'Render width 840');
  assertEqual(renderRes.height, 440, 'Render height 440');
  assertEqual(renderRes.pngBytes[0], 0x89, 'PNG magic byte 0');
  assertEqual(renderRes.pngBytes[1], 0x50, 'PNG magic byte 1 (P)');
  assertEqual(renderRes.pngBytes[2], 0x4e, 'PNG magic byte 2 (N)');
  assertEqual(renderRes.pngBytes[3], 0x47, 'PNG magic byte 3 (G)');
  assert(renderRes.base64.length > 100, 'Render base64 string non-empty');

  // Test other view modes: top, isometric, front, side
  const topRes = renderSchematicPng(session, { analysis, view: 'top', width: 400, height: 400 });
  assertEqual(topRes.view, 'top', 'Top view rendered ok');
  assertEqual(topRes.pngBytes[0], 0x89, 'Top view PNG magic valid');

  const isoRes = renderSchematicPng(session, { analysis, view: 'isometric', width: 400, height: 400 });
  assertEqual(isoRes.view, 'isometric', 'Isometric view rendered ok');
  assertEqual(isoRes.pngBytes[0], 0x89, 'Isometric view PNG magic valid');

  const frontRes = renderSchematicPng(session, { analysis, view: 'front', width: 400, height: 400 });
  assertEqual(frontRes.view, 'front', 'Front view rendered ok');

  const sideRes = renderSchematicPng(session, { analysis, view: 'side', width: 400, height: 400 });
  assertEqual(sideRes.view, 'side', 'Side view rendered ok');
}

// ============================================================================
// 4. Large Schematic Benchmark: Augustograd-cleaned-v2.schem
// ============================================================================
{
  console.log('4. Large Schematic Benchmark (Augustograd-cleaned-v2.schem)');
  const schemPath = resolve('Augustograd-cleaned-v2.schem');

  if (!existsSync(schemPath)) {
    console.log('Notice: Augustograd-cleaned-v2.schem not found at root, skipping benchmark');
  } else {
    const fileBytes = new Uint8Array(readFileSync(schemPath));
    const importRes = await importSchematic(fileBytes, 'Augustograd-cleaned-v2.schem');
    const project = {
      schemaVersion: 1,
      id: 'augustograd',
      name: 'Augustograd',
      placements: importRes.placements,
      importGroups: importRes.importGroups ?? [],
      overlapPolicy: 'top-wins' as const,
      conflictOverlay: 'off' as const,
      metadata: {
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
      revision: 0,
    };
    const session = new EditorSession(project);

    console.log(`Loaded Augustograd: ${importRes.placements.length} placement(s), ${importRes.placements[0]!.volume.chunks.size} chunks, ${importRes.placements[0]!.volume.nonAirCount} non-air voxels`);

    // Benchmark analyzeSchematicStructures
    const t0 = performance.now();
    const analysis = analyzeSchematicStructures(session, {
      maxStructures: 25,
      minFootprint: 15,
      minVoxels: 35,
    });
    const elapsedAnalysis = performance.now() - t0;

    console.log(`Augustograd structure analysis completed in ${elapsedAnalysis.toFixed(2)} ms!`);
    console.log(`Detected ${analysis.structures.length} distinct structures in compound`);
    console.log(`Top 5 structures:`);
    for (const s of analysis.structures.slice(0, 5)) {
      console.log(`  - [${s.id}] (${s.category}) ${s.name}: ${s.summary}`);
    }

    assert(elapsedAnalysis < 500, `Augustograd analysis completed in < 500ms (got ${elapsedAnalysis.toFixed(2)}ms)`);
    assert(analysis.structures.length >= 3, `Augustograd segmented into multiple structures (got ${analysis.structures.length})`);
    assert(analysis.totalVoxels > 1_000_000, `Augustograd voxels > 1,000,000 (got ${analysis.totalVoxels})`);

    // Benchmark renderSchematicPng on Augustograd
    const t1 = performance.now();
    const pngResult = renderSchematicPng(session, {
      analysis,
      view: 'composite',
      width: 840,
      height: 440,
      annotateStructures: true,
    });
    const elapsedPng = performance.now() - t1;

    console.log(`Augustograd renderSchematicPng completed in ${elapsedPng.toFixed(2)} ms! Output PNG size: ${pngResult.pngBytes.length} bytes`);
    assert(elapsedPng < 500, `Augustograd render completed in < 500ms (got ${elapsedPng.toFixed(2)}ms)`);
    assertEqual(pngResult.pngBytes[0], 0x89, 'Augustograd PNG magic byte valid');
    assert(pngResult.base64.length > 5000, 'Augustograd base64 non-empty');

    // Also test optimized inspectRegionVoxels on large Augustograd region
    const tInspect = performance.now();
    const inspectRes = inspectRegionVoxels(session, {
      min: [-300, 0, -250],
      maxExclusive: [-150, 100, -100], // 150 * 100 * 150 = 2,250,000 volume!
    }, { maxBlocks: 20 });
    const elapsedInspect = performance.now() - tInspect;

    console.log(`inspectRegionVoxels on 2.25M voxel region took ${elapsedInspect.toFixed(2)} ms, nonAirCount: ${inspectRes.nonAirCount}`);
    assert(elapsedInspect < 250, `inspectRegionVoxels completed in < 250ms (got ${elapsedInspect.toFixed(2)}ms)`);
    assert(inspectRes.nonAirCount > 0, 'Found non-air blocks in Augustograd region');
  }
}

// ============================================================================
// Summary
// ============================================================================
console.log('----------------------------------------');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
