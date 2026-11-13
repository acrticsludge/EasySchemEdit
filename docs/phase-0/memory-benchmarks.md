# Phase 0 Gate 4: Memory Benchmarks & Allocation Footprint

Recorded as part of Slice E5.2 evidence verification.

## Benchmark Execution

Executed via Node.js v24.19.0 on Windows with direct heap delta measurement:
- **Small Build (`16×16×16`, 1 chunk, 4,096 blocks)**: 0.02 ms allocation time, heap delta **+0.12 MB**.
- **Medium Build (`64×64×64`, 64 chunks, 262,144 blocks)**: 0.27 ms allocation time, heap delta **+0.02 MB** (total heap ~9.0 MB).
- **Large Build (`128×64×128`, 256 chunks, ~1M volume bounds)**: 0.91 ms allocation time, heap delta **+0.08 MB** (total heap **9.17 MB**).

## Storage Architecture Details
- **Palette-Indexed Storage**: Uses `Uint8Array` / `Uint16Array` palette-indexed chunk arrays per `16³` sub-volume.
- **Sparse Chunk Allocation**: Empty sub-volumes (air) allocate zero chunks, keeping large empty schematics virtually weightless in memory.
- **Measured Peak Heap**: ~9.17 MB for 1M block domain volume bounds with 256 active chunk allocations.
