# Subspec B — Slice b-4: Litematic Adapter

**Goal:** Implement Litematic format adapter with real structure: root Version/SubVersion/MinecraftDataVersion/Metadata/Regions. Each region has Position, Size, BlockStatePalette[{Name,Properties}], BlockStates long[], TileEntities, Entities, PendingBlockTicks, PendingFluidTicks. Uses signed-Size normalization from slice b-2.

## Files to Create

| File | Purpose |
|------|---------|
| `packages/formats/litematic.ts` | Litematic format adapter |

## Litematic Root Structure

```
Root compound:
  Version: Int        (Litematic format version)
  SubVersion: Int
  MinecraftDataVersion: Int
  Metadata: Compound {
    Name: String
    Author: String
    Description: String
    TimeCreated: Long
    TimeModified: Long
    EnclosingSize: Int[3]
    TotalVolume: Long
    TotalBlocks: Long
    RegionCount: Int
  }
  Regions: Compound {
    <regionName>: Compound {
      Position: Int[3]
      Size: Int[3]                    // may be negative (signed)
      BlockStatePalette: List<Compound { Name: String, Properties: Compound }>
      BlockStates: Long[]             // packed, bitsPerEntry from palette size
      TileEntities: List<Compound>
      Entities: List<Compound>
      PendingBlockTicks: List<Compound>
      PendingFluidTicks: List<Compound>
    }
  }
```

## Block States

Palette entries are `Compound { Name: String, Properties: Compound }` → `BlockStateId`. BlockStates is a packed long array decoded per slice b-3.

## Ancillary Data

- TileEntities → blockEntities (position + NBT)
- Entities → entities (position, rotation, NBT)
- PendingBlockTicks → pendingTicks
- PendingFluidTicks → pendingTicks (fluid variant)

## Size Normalization

Uses `normalizeRegionSize`, `rawToNormalizedCoord`, `normalizedToWorld` from slice b-2. Reversal is for negative Size only.

## Acceptance Criteria

- [ ] Root structure: Version, SubVersion, MinecraftDataVersion, Metadata, Regions
- [ ] Metadata: Name, Author, Description, TimeCreated, TimeModified, EnclosingSize, TotalVolume, TotalBlocks, RegionCount
- [ ] Region: Position, Size (signed), BlockStatePalette[{Name,Properties}], BlockStates long[], TileEntities, Entities, PendingBlockTicks, PendingFluidTicks
- [ ] Signed-Size normalization from slice b-2 applied
- [ ] Block entities/entities/ticks consistent with reversal
- [ ] Palette entries {Name, Properties} → BlockStateId

## Tests

**File:** `packages/formats/__tests__/slice-b-4-litematic.test.ts`

1. Litematic root structure parsed correctly
2. Metadata fields read (Name, Author, Description, timestamps, EnclosingSize, TotalVolume, TotalBlocks, RegionCount)
3. Region Position/Size read; negative Size normalized via slice b-2
4. BlockStatePalette {Name, Properties} → BlockStateId mapping
5. Block entities/entities/ticks preserved with positions
6. Non-cubic region with hand-computed expected coordinates after reversal

## Verification Checklist

- [ ] Change does one thing completely (Litematic adapter with real structure)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
