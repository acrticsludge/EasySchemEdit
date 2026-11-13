// packages/ui/__tests__/slice-g-6-inspector.test.ts
// Slice g-6 tests: inspector (SUBSPEC-G §6.3).
// Run: node --experimental-strip-types __tests__/slice-g-6-inspector.test.ts

import {
  createInspector,
  type Transform,
} from '../src/index.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) passed++;
  else { failed++; console.error(`FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

console.log('--- Slice g-6: context sensitivity ---');

{
  const ins = createInspector({ activeTool: 'select', selectedPlacementId: null });
  assertEqual(ins.view().hasSelection, false, 'g-6.1: no selection → no placement inspector');
  ins.setSelection('p1');
  ins.setPlacementTransform({ x: 1, y: 2, z: 3, originX: 0.5, originY: 1, originZ: 1.5, rotation: 0, mirror: 'none' });
  assertEqual(ins.view().hasSelection, true, 'g-6.1: selection → placement inspector');
  ins.setActiveTool('move');
  assertEqual(ins.context().activeTool, 'move', 'g-6.1: active tool is tracked');
}

console.log('--- Slice g-6: origin and transform always exposed ---');

{
  const ins = createInspector({ activeTool: null, selectedPlacementId: 'p1' });
  ins.setPlacementTransform({ x: 5, y: 6, z: 7, originX: 0.5, originY: 1, originZ: 1.5, rotation: 90, mirror: 'x' });
  const v = ins.view();
  assert(v.origin !== null, 'g-6.2: origin is always exposed for a selected placement');
  assert(v.transform !== null, 'g-6.2: transform is always exposed for a selected placement');
  assertEqual(v.origin!.x.value, 0.5, 'g-6.2: origin X value');
  assertEqual(v.transform!.position.x.value, 5, 'g-6.2: position X value');
  assertEqual(v.transform!.rotation, 90, 'g-6.2: rotation value');
  assertEqual(v.transform!.mirror, 'x', 'g-6.2: mirror value');
}

console.log('--- Slice g-6: position integer-only ---');

{
  const ins = createInspector();
  assertEqual(ins.validatePosition(3.7), 3, 'g-6.3: position truncates to integer');
  assertEqual(ins.validatePosition(-2.9), -2, 'g-6.3: position truncates negatives');
  const v = ins.view();
  // No selection → no transform inputs.
  assertEqual(v.transform, null, 'g-6.3: no transform without a selection');
}

console.log('--- Slice g-6: origin half-integer ---');

{
  const ins = createInspector();
  assertEqual(ins.validateOrigin(1.3), 1.5, 'g-6.3: origin snaps to nearest half-integer');
  assertEqual(ins.validateOrigin(2), 2, 'g-6.3: origin keeps integers');
  assertEqual(ins.validateOrigin(0.25), 0.5, 'g-6.3: origin snaps quarter to half');
}

console.log('--- Slice g-6: rotation constrained ---');

{
  const ins = createInspector();
  assertEqual(ins.setRotation(0), 0, 'g-6.4: 0° allowed');
  assertEqual(ins.setRotation(90), 90, 'g-6.4: 90° allowed');
  assertEqual(ins.setRotation(180), 180, 'g-6.4: 180° allowed');
  assertEqual(ins.setRotation(270), 270, 'g-6.4: 270° allowed');
  assertEqual(ins.setRotation(45), 0, 'g-6.4: 45° snaps to 0°');
  assertEqual(ins.setRotation(135), 90, 'g-6.4: 135° snaps to 90°');
  assertEqual(ins.setRotation(360), 0, 'g-6.4: 360° wraps to 0°');
}

console.log('--- Slice g-6: mirror ---');

{
  const ins = createInspector();
  assertEqual(ins.setMirror('none'), 'none', 'g-6.5: none allowed');
  assertEqual(ins.setMirror('x'), 'x', 'g-6.5: x allowed');
  assertEqual(ins.setMirror('z'), 'z', 'g-6.5: z allowed');
  assertEqual(ins.setMirror('y'), 'none', 'g-6.5: unknown snaps to none');
}

console.log('--- Slice g-6: block picker search ---');

{
  const ins = createInspector();
  const blocks = ['minecraft:stone', 'minecraft:dirt', 'mod:custom_block', 'minecraft:grass'];
  const results = ins.searchBlocks('mine', blocks);
  assertEqual(results.length, 3, 'g-6.6: search filters by substring');
  assert(results.includes('minecraft:stone'), 'g-6.6: stone included');
  assert(results.includes('minecraft:dirt'), 'g-6.6: dirt included');
  const empty = ins.searchBlocks('zzz', blocks);
  assertEqual(empty.length, 0, 'g-6.6: no matches → empty');
}

console.log('--- Slice g-6: recently used and palette ---');

{
  const ins = createInspector();
  ins.markBlockUsed('minecraft:stone');
  ins.markBlockUsed('minecraft:dirt');
  ins.markBlockUsed('minecraft:stone'); // moves to front
  const v = ins.view();
  assertEqual(v.blockPicker.recentlyUsed[0], 'minecraft:stone', 'g-6.8: recently used moves to front');
  assertEqual(v.blockPicker.recentlyUsed.length, 2, 'g-6.8: no duplicates in recently used');
  ins.addToPalette('minecraft:stone');
  ins.addToPalette('minecraft:stone'); // no duplicate
  assertEqual(ins.view().blockPicker.palette.length, 1, 'g-6.8: palette dedupes');
  ins.removeFromPalette('minecraft:stone');
  assertEqual(ins.view().blockPicker.palette.length, 0, 'g-6.8: palette removal works');
}

console.log('--- Slice g-6: property editor ---');

{
  const ins = createInspector();
  ins.setBlockMetadata({
    blockId: 'minecraft:chest',
    version: 1,
    properties: [
      { key: 'facing', type: 'enum', values: ['north', 'south'], version: 1 },
      { key: 'waterlogged', type: 'boolean', version: 1 },
    ],
  });
  ins.setBlockState({ facing: 'north', waterlogged: true, custom_prop: 42 });
  const props = ins.view().properties;
  assertEqual(props.length, 3, 'g-6.7: known + unknown properties rendered');
  const facing = props.find((p) => p.key === 'facing');
  assertEqual(facing?.known, true, 'g-6.7: known property marked known');
  assertEqual(facing?.type, 'enum', 'g-6.7: known property type preserved');
  const custom = props.find((p) => p.key === 'custom_prop');
  assertEqual(custom?.known, false, 'g-6.7: unknown property marked unknown');
  assertEqual(custom?.value, 42, 'g-6.7: unknown property value preserved');
}

console.log('--- Slice g-6: data fidelity warnings ---');

{
  const ins = createInspector();
  ins.setFidelityWarnings(['Block state truncated', 'Unknown property dropped']);
  const v = ins.view();
  assertEqual(v.warnings.length, 2, 'g-6.9: warnings attached to the view');
  assertEqual(v.warnings[0].message, 'Block state truncated', 'g-6.9: warning message preserved');
}

console.log('--- Slice g-6: numeric inputs direct + stepper ---');

{
  const ins = createInspector();
  const input = { value: 5, step: 1, integerOnly: true, halfIntegerAllowed: false, allowDirectTyping: true, allowStepper: true };
  assertEqual(ins.stepUp(input), 6, 'g-6.10: stepper up works');
  assertEqual(ins.stepDown(input), 4, 'g-6.10: stepper down works');
  assertEqual(ins.directType(input, '7'), 7, 'g-6.10: direct typing works');
  assertEqual(ins.directType(input, 'abc'), null, 'g-6.10: invalid direct typing returns null');
  assertEqual(ins.directType(input, '3.5'), null, 'g-6.10: integer-only rejects half values via direct typing');
  // Origin input allows half-integers.
  const originInput = { value: 1, step: 0.5, integerOnly: false, halfIntegerAllowed: true, allowDirectTyping: true, allowStepper: true };
  assertEqual(ins.directType(originInput, '1.5'), 1.5, 'g-6.10: origin direct typing accepts half-integers');
}

console.log('--- Slice g-6: context reset ---');

{
  const ins = createInspector({ activeTool: 'paint', selectedPlacementId: 'p1' });
  ins.setPlacementTransform({ x: 0, y: 0, z: 0, originX: 0, originY: 0, originZ: 0, rotation: 0, mirror: 'none' });
  ins.setSelection(null);
  assertEqual(ins.view().hasSelection, false, 'g-6.1: clearing selection hides the placement inspector');
  assertEqual(ins.view().origin, null, 'g-6.1: origin null without selection');
}

console.log('\n=== Slice g-6 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) process.exit(1);
