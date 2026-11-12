// packages/renderer/src/missing-model.ts
// Missing model fallback types (SUBSPEC-E §2.3).
// Pure TypeScript, zero Three.js imports. Three.js types abstracted as `any`.

// Magenta-and-black checkerboard cube geometry, unlit material, thin outline.
// Used when base assets haven't loaded OR for genuinely missing blocks/textures.
export type MissingModelFallback = {
  geometry: any;       // THREE.BufferGeometry — magenta-and-black checkerboard cube (abstracted)
  material: any;       // THREE.Material — unlit, no culling (abstracted)
  outline: any;        // THREE.LineSegments — thin outline (abstracted)
};
