# Subspec A — Slice 13: Archive Serialization + Manifest Checksums

**Goal:** Define the deterministic `.vxproj` archive structure: ZIP64 with DEFLATE, `manifest.json` with `checksums` as single source of truth, no separate `checksums.json`.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/archive.ts` | Archive structure + checksum validation |

## Archive Structure

```
project.vxproj
├── manifest.json            // schemaVersion, app version, asset profile, createdAt, modifiedAt, checksums
├── project.json             // canonical JSON: placements, importGroups, metadata, revision
├── placements/
│   └── <placement-id>/
│       ├── volume.json
│       ├── transform.json
│       ├── origin.json
│       ├── ancillary.json   // typed NBT AST as JSON
│       └── chunks/
│           └── <cx>_<cy>_<cz>.bin   // binary chunk codec
├── assets/
│   └── custom-resource-pack-references.json
└── (no separate checksums.json — manifest.checksums is authoritative)
```

## Rules

- `manifest.checksums` maps every archive entry path to its SHA-256 (single source of truth)
- `manifest.checksums` covers `project.json` (replaces per-file checksum)
- On re-open, every path in `manifest.checksums` verified against entry's SHA-256; no unlisted entries, no missing ones
- Mismatch → `CORRUPT_ARCHIVE` diagnostic and recovery offer
- ZIP64 with DEFLATE compression level 6
- Path traversal prevention: reject `..`, absolute paths, backslashes
- Reject duplicate entry names
- Absolute size caps: max entry size, max total size, max entry count
- Ratio check only when compressed entry size > 64 KiB floor (not a blanket 100:1 per-entry)
- Deterministic ordering: entries sorted by path, zero timestamps, fixed compression level
- Unknown entries preserved on load/save

## Acceptance Criteria

- [ ] `manifest.checksums` is single source of truth; no separate `checksums.json`
- [ ] Checksum mismatch on re-open → `CORRUPT_ARCHIVE`
- [ ] Path traversal entries rejected
- [ ] Duplicate entry names rejected
- [ ] Deterministic bytes: same project twice → identical archive bytes
- [ ] Absolute caps replace blanket 100:1 decompression ratio
- [ ] Unknown entries preserved on load/save

## Tests

**File:** `packages/domain/__tests__/slice-13-archive.test.ts`

1. Create archive with manifest checksums, verify on read
2. Corrupt one byte in an entry → `CORRUPT_ARCHIVE` detected
3. Archive with `..` path entry rejected
4. Archive with duplicate entry names rejected

## Verification Checklist

- [ ] Change does one thing completely (archive structure + checksums)
- [ ] TypeScript compiles without errors
- [ ] All new tests pass
- [ ] Change committed with descriptive message
