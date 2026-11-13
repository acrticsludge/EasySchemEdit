# Phase 0 Evidence: Coordinate & Block-State Transform Math (Gate 2)

This document records the Phase 0 Gate 2 evidence for coordinate math and block-state transformations per `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` (§8 Gate 2) and `docs/plans/e2e-rebuild/index.md` (§5 Slice E1.2).

---

## 1. Executive Summary

Phase 0 Gate 2 requires:
> "Correct transform round-trips for all 90-degree rotations and mirrors, including origin mapping and common directional block states. Evidence: `transform-tests.md` with property-based test results."

All coordinate math and block-state transformation tables are implemented in pure TypeScript inside `packages/domain/coordinates.ts` and `packages/domain/block-state-transforms.ts`.
Mathematical group properties (rotations form cyclic group $\mathbb{Z}_4$, mirrors are involutions $M^2 = I$, bijectivity of all property permutation tables) are verified by automated tests (`packages/domain/__tests__/slice-4-transform.test.ts` and `slice-6-block-state-transforms.test.ts`), with all 20 domain test files passing (20/20).

---

## 2. Pinned Coordinate Math (`packages/domain/coordinates.ts`)

### 2.1 Center-Based Transform Math & Doubled Half-Block Units
In a voxel grid, integer coordinates $[x, y, z] \in \mathbb{Z}^3$ denote the lower corner of a block cell. The geometric center of the cell is at:
$$\text{center} = [x + 0.5, y + 0.5, z + 0.5]$$

To avoid floating-point inaccuracies and guarantee exact lattice alignment:
- All transform math operates in **doubled half-block units** (`Vec3Half`).
- A block cell at lower corner $[x, y, z]$ has doubled center:
  $$\text{centerHalf} = 2 \cdot [x, y, z] + [1, 1, 1] = [2x + 1, 2y + 1, 2z + 1]$$
- Notice that every component of $\text{centerHalf}$ is an **odd integer**.
- Translations $T$ are integer block coordinates, corresponding to an **even triple** $2T$ in doubled units.
- An origin $O$ is grid-safe (`isLatticeSafe`) if and only if all its components are even (integral block boundary).
- If origin $O$ has fractional/odd components (such as $[0.5, 0, 0.5]$), rotating by 90° maps odd centers to non-odd coordinates, producing an off-grid condition. This counterexample is detected and rejected by `mapCellToWorld` (`valid: false`).

### 2.2 Rotation Matrix about Y-Axis
Rotations are restricted to multiples of 90° clockwise about the vertical Y-axis:
$$\begin{pmatrix} x' \\ y' \\ z' \end{pmatrix} = \begin{pmatrix} \cos\theta & 0 & \sin\theta \\ 0 & 1 & 0 \\ -\sin\theta & 0 & \cos\theta \end{pmatrix} \begin{pmatrix} x \\ y \\ z \end{pmatrix}$$

- **$0^\circ$**: $(x, y, z) \mapsto (x, y, z)$
- **$90^\circ$**: $(x, y, z) \mapsto (z, y, -x)$. Facing north $(0, 0, -1) \mapsto$ west $(-1, 0, 0)$.
- **$180^\circ$**: $(x, y, z) \mapsto (-x, y, -z)$
- **$270^\circ$**: $(x, y, z) \mapsto (-z, y, x)$

### 2.3 Mirrors
Mirror planes are applied in local space before rotation:
- **`none`**: $(x, y, z) \mapsto (x, y, z)$
- **`x`** (reflect across $x=0$): $(-x, y, z)$
- **`z`** (reflect across $z=0$): $(x, y, -z)$

### 2.4 Arbitrary Pivot Rotation (`rotateAboutPoint`)
When rotating a placement about a chosen world pivot point $P_2$ (in doubled half-block units):
1. Compute the local coordinate $L_2$ corresponding to world pivot $P_2$ under the current transform:
   $$L_2 = O + M_{\text{cur}}(R_{\text{cur}}^{-1}(P_2 - T_2))$$
2. Compute the new translation $T_{2,\text{new}}$ so that local coordinate $L_2$ maps exactly to $P_2$ under the new rotation $R_{\text{new}}$ and mirror $M_{\text{new}}$:
   $$T_{2,\text{new}} = P_2 - R_{\text{new}}(M_{\text{new}}(L_2 - O))$$
3. Set new translation:
   $$T_{\text{new}} = \left[\text{round}\left(\frac{T_{2,\text{new},x}}{2}\right), \text{round}\left(\frac{T_{2,\text{new},y}}{2}\right), \text{round}\left(\frac{T_{2,\text{new},z}}{2}\right)\right]$$
- **Guarantee**: World cell at the pivot point remains completely stationary under rotation.

### 2.5 Coordinate Inversion (`worldPointToLocal`)
The inverse transformation $T^{-1}$ inverts translation, applies inverse rotation $R^{-1}$ (where $R_{90}^{-1} = R_{270}$), and applies inverse mirror $M^{-1}$ (where $M_x^2 = I$ and $M_z^2 = I$ are self-inverse involutions):
- Verified round-trip: for all test cells and transforms, `worldPointToLocal(localBlockToWorld(c)) == c`.

---

## 3. Pinned Block-State Transforms (`packages/domain/block-state-transforms.ts`)

Every transform table is mathematically verified to form a permutation (bijective mapping) across its domain by `validateBijectivity()`.

### 3.1 Directional Properties
| Block Property | Values | $90^\circ$ CW | $180^\circ$ | $270^\circ$ CW | Mirror X | Mirror Z |
|---|---|---|---|---|---|---|
| `facing` | `north` | `west` | `south` | `east` | `north` | `south` |
| | `east` | `north` | `west` | `south` | `west` | `east` |
| | `south` | `east` | `north` | `west` | `south` | `north` |
| | `west` | `south` | `east` | `north` | `east` | `west` |
| | `up` | `up` | `up` | `up` | `up` | `up` |
| | `down` | `down` | `down` | `down` | `down` | `down` |
| `axis` | `x` | `z` | `x` | `z` | `x` | `x` |
| | `y` | `y` | `y` | `y` | `y` | `y` |
| | `z` | `x` | `z` | `x` | `z` | `z` |

### 3.2 Chirality & Sub-Block Properties
- **Stair Shape (`shape`)**:
  - Rotation preserves chirality: `inner_left` rotated $90^\circ$ remains `inner_left` (facing changes).
  - Mirror reverses chirality: `inner_left` $\leftrightarrow$ `inner_right`, `outer_left` $\leftrightarrow$ `outer_right`.
- **Rail Shape (`shape`)**:
  - Flat rails: `north_south` $\leftrightarrow$ `east_west` on $90^\circ$/$270^\circ$.
  - Sloped rails: `ascending_north` $\to$ `ascending_east` $\to$ `ascending_south` $\to$ `ascending_west`.
  - Curved rails (`north_west`, `north_east`, `south_west`, `south_east`): mirrored by swapping axis reflections.
- **Door Hinge (`hinge`)**:
  - Rotation: invariant.
  - Mirror: `left` $\leftrightarrow$ `right`.
- **Double Chests (`type`)**:
  - Rotation: invariant.
  - Mirror: `left` $\leftrightarrow$ `right`.
- **Sign / Banner Rotation (`rotation`: 0..15)**:
  - 16-way compass direction ($22.5^\circ$ per step).
  - Rotation: $(r + \text{shift}) \pmod{16}$ where shift is $+12$ ($90^\circ$ CW), $+8$ ($180^\circ$), $+4$ ($270^\circ$).
  - Mirror X: $(16 - r) \pmod{16}$.
  - Mirror Z: $(8 - r + 16) \pmod{16}$.
- **Connection Properties (`north`, `east`, `south`, `west`)**:
  - Fences, iron bars, glass panes, walls:
  - $90^\circ$ rotation: 4-cycle permutation `[north → west → south → east → north]`.
  - Mirror X: swaps `east` $\leftrightarrow$ `west`.
  - Mirror Z: swaps `north` $\leftrightarrow$ `south`.

---

## 4. Test Evidence & Results

### 4.1 Domain Test Suite Execution (`scripts/run-tests.mjs domain`)
Executed on Node.js 24 with `--experimental-strip-types`:

| Test File | Topic | Status |
|---|---|---|
| `slice-0-types.test.ts` | Basic vector & coordinate types | PASS |
| `slice-0.5-shared-types.test.ts` | Diagnostic and shared types | PASS |
| `slice-1-nbt-ast.test.ts` | NBT AST tag types | PASS |
| `slice-10-nbt-codec.test.ts` | Binary NBT parser and serializer | PASS |
| `slice-11-validation.test.ts` | Project and schema validation | PASS |
| `slice-12-worker-protocol.test.ts` | Background worker message envelope | PASS |
| `slice-13-archive.test.ts` | Archive packaging | PASS |
| `slice-14-acceptance.test.ts` | Domain integration acceptance | PASS |
| `slice-2-volume.test.ts` | Sparse chunk volume storage | PASS |
| `slice-2.5-volume-api.test.ts` | Sparse voxel operations | PASS |
| `slice-3-chunk-mapping.test.ts` | World to chunk coordinate mapping | PASS |
| `slice-4-transform.test.ts` | Center-based transforms, pivot rotation, lattice safety | PASS |
| `slice-5-block-state.test.ts` | BlockStateId canonicalization | PASS |
| `slice-5.5-block-state-string.test.ts` | Block state string formatting and parsing | PASS |
| `slice-6-block-state-transforms.test.ts` | Bijective block state transform tables | PASS |
| `slice-8-invariants.test.ts` | Placement invariants | PASS |
| `slice-8.5-effective-block.test.ts` | Overlap resolution and effective block state | PASS |
| `slice-8.6-ancillary-transforms.test.ts` | Block entity and entity coordinate transformation | PASS |
| `slice-8.7-bounds.test.ts` | Bounds union and intersection math | PASS |
| `slice-9-chunk-codec.test.ts` | Binary chunk payload codec | PASS |

**Result**: 20/20 test files pass in 1.54s.

### 4.2 Property-Based & Algebraic Verification Details

#### `slice-4-transform.test.ts`:
- **Counterexample Rejection**: Half-integer origin `[0.5, 0, 0.5]` correctly classified off-grid (`valid === false`).
- **Lattice Safety Check**: `isLatticeSafe` accepts even multiples in doubled units; rejects half-integer origins.
- **Rotation Group Identity**: Applying $90^\circ$ rotation 4 times restores initial coordinate exactly (`c == c`).
- **Mirror Involution**: Applying mirror twice restores initial coordinate exactly ($M^2 = I$).
- **Round-Trip Inverse**: `localBlockToWorld` followed by inverse mapping restores initial local coordinates across all tested rotations and mirror planes.
- **Pivot Fixedness**: `rotateAboutPoint` about block center `[21, 1, 21]` (cell `[10, 0, 10]`) leaves the cell stationary in world space.

#### `slice-6-block-state-transforms.test.ts`:
- **Bijectivity Verification**: `validateBijectivity()` evaluates all tables; confirms every column is a complete permutation with zero collisions and zero missing mappings.
- **Involution Check**: For every mirror table, $M(M(s)) = s$.
- **4-Cycle Check**: For every rotation table, $R_{90}^4(s) = s$ and $R_{90}(R_{270}(s)) = s$.
- **Stair Chirality**: Rotation preserves stair shape; mirror swaps left/right.

---

## 5. Phase 0 Gate 2 Status

**GATE 2 PASSED**: Coordinate transform math, grid lattice preservation, pivot rotation, and bijective block-state transformations are fully specified, implemented, and verified by passing test suites.
