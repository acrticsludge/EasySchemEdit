// Slice b-10: Legacy ID Table
import {
  LEGACY_ID_TABLE,
  addLegacyIdMappings,
  lookupLegacyId,
  legacyIdToBlockStateId,
  type LegacyIdEntry,
} from '../legacy-id-table.ts';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { console.assert(cond, msg); failures++; }
  console.log(msg + ' -> ' + cond);
}

// 1. Keyed by (id, data)
{
  const entry = lookupLegacyId(1, 0);
  check(entry !== undefined, 'lookup (1, 0) exists');
  check(entry?.blockState.id === 'minecraft:stone', 'stone id correct');
}

// 2. BlockStateId with properties
{
  const entry = lookupLegacyId(6, 0);
  check(entry !== undefined, 'lookup (6, 0) sapling exists');
  check(entry?.blockState.props.tree === 'oak', 'sapling tree=oak');
  check(entry?.blockState.props.stage === '0', 'sapling stage=0');
}

// 3. AddBlocks support
{
  const newEntry: LegacyIdEntry = {
    id: 999,
    data: 0,
    blockState: { id: 'minecraft:test_block', props: { custom: 'true' } },
    version: '1.21',
  };
  addLegacyIdMappings([newEntry]);
  const result = lookupLegacyId(999, 0);
  check(result !== undefined, 'added mapping exists');
  check(result?.blockState.id === 'minecraft:test_block', 'added id correct');
  check(result?.blockState.props.custom === 'true', 'added props correct');
}

// 4. Unknown ID returns undefined
{
  const result = lookupLegacyId(99999, 0);
  check(result === undefined, 'unknown ID returns undefined');
}

// 5. legacyIdToBlockStateId convenience
{
  const bs = legacyIdToBlockStateId(1, 0);
  check(bs !== undefined && bs.id === 'minecraft:stone', 'convenience function works');
  const bs2 = legacyIdToBlockStateId(99999, 0);
  check(bs2 === undefined, 'convenience function undefined for unknown');
}

console.log(failures === 0 ? 'All slice b-10 legacy ID table tests passed.' : failures + ' failure(s)');
process.exit(failures === 0 ? 0 : 1);
