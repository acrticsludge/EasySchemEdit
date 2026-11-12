# Subspec C — Slice c-8: .vxproj Archive Format

**Source:** `docs/specs/subs/SUBSPEC-C_PROJECT_PERSISTENCE.md` §4.8 (.vxproj archive), §2.3.10 (Archive format)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` and `@easyschemedit/persistence` only. Compression via injected services.

## Goal

Implement .vxproj archive format: serialize project to ZIP archive (manifest + chunks + ancillary), deserialize from archive, manifest.checksums as single source of truth.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/persistence/src/vxproj.ts` | create | `VxprojArchive`, `VxprojManifest`, `VxprojServices` types + serialize/deserialize functions |

## Types / APIs

```ts
export interface VxprojManifest {
  version: number;
  projectId: string;
  createdAt: string;
  checksums: Record<string, string>;  // single source of truth
  chunks: Record<string, string>;     // chunkKey → checksum
  ancillary: Record<string, string>;  // ancillary type → checksum
}

export interface VxprojArchive {
  manifest: VxprojManifest;
  chunks: Map<string, ArrayBuffer>;
  ancillary: Map<string, ArrayBuffer>;
}

export interface VxprojServices {
  zip: (entries: { name: string; data: ArrayBuffer }[]) => Promise<ArrayBuffer>;
  unzip: (data: ArrayBuffer) => Promise<{ name: string; data: ArrayBuffer }[]>;
  sha256: (data: ArrayBuffer) => Promise<string>;
}

export async function serializeVxproj(
  archive: VxprojArchive,
  services: VxprojServices
): Promise<ArrayBuffer>;

export async function deserializeVxproj(
  data: ArrayBuffer,
  services: VxprojServices
): Promise<VxprojArchive>;
```

## Acceptance criteria

1. serializeVxproj produces ZIP with manifest.json + chunk files + ancillary files
2. manifest.checksums is single source of truth (no separate checksums.json)
3. deserializeVxproj verifies all checksums against manifest
4. Mismatched checksums → deserialization error
5. Missing files → deserialization error

## Tests

No test file yet — verification via typecheck. Test file `slice-c-8-vxproj.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/persistence exec tsc --noEmit` exit code 0
