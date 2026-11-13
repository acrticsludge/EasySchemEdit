// packages/renderer/src/atlas-packer.ts
// Pure TypeScript texture atlas packing and animation metadata utilities (SUBSPEC-E §2.2, §4.3, §4.12, §4.13).
// Zero Three.js / DOM / Node imports.

/**
 * Input texture descriptor for atlas packing.
 */
export interface AtlasEntryInput {
  id: string;
  width: number;
  height: number;
}

/**
 * Packing configuration options.
 */
export interface PackAtlasOptions {
  maxSize: number;       // Maximum page dimension (e.g. 512, 1024, 2048, 4096)
  padding: number;       // Padding / gutter around each texture in pixels (e.g. 0, 1, 8)
  powerOfTwo?: boolean;  // Enforce power-of-two page dimensions (default true)
}

/**
 * Placed texture rectangle within an atlas page with normalized UV coordinates.
 */
export interface AtlasPageRect {
  page: number; // 0-based page index
  x: number;    // Pixel X coordinate within page
  y: number;    // Pixel Y coordinate within page
  w: number;    // Width in pixels
  h: number;    // Height in pixels
  u0: number;   // Left UV coordinate [0, 1]
  v0: number;   // Top UV coordinate [0, 1]
  u1: number;   // Right UV coordinate [0, 1]
  v1: number;   // Bottom UV coordinate [0, 1]
}

/**
 * Output of atlas packing.
 */
export interface AtlasPackOutput {
  pages: { width: number; height: number }[];
  rects: Map<string, AtlasPageRect>;
}

/**
 * Animation frame definition inside .mcmeta.
 */
export interface AnimationFrameDef {
  index: number;
  time?: number;
}

/**
 * Parsed animation metadata from texture .png.mcmeta.
 */
export interface McmetaAnimation {
  frameHeight?: number;
  frames?: (number | AnimationFrameDef)[];
  frametime?: number;
  interpolate?: boolean;
  width?: number;
}

/**
 * Compute the nearest power of two less than or equal to n (minimum 1).
 */
function toPowerOfTwo(n: number): number {
  if (n <= 1) return 1;
  return 1 << Math.floor(Math.log2(n));
}

/**
 * Horizontal shelf in a 2D Shelf bin packing algorithm.
 */
interface Shelf {
  y: number;
  height: number;
  currentX: number;
}

/**
 * Internal state for an atlas page during packing.
 */
interface PagePackingState {
  pageIndex: number;
  width: number;
  height: number;
  shelves: Shelf[];
  currentY: number;
}

/**
 * Pack texture rectangles into one or more power-of-two pages.
 *
 * Deterministic: entries are sorted by height descending, then by id ascending.
 * Padding: each texture is allocated a cell with `padding` pixels around it,
 * producing half-texel-safe gutters that prevent bilinear/mip bleed.
 * Overflow: textures that do not fit in existing pages spill onto new pages.
 */
export function packAtlas(
  entries: AtlasEntryInput[],
  opts: PackAtlasOptions
): AtlasPackOutput {
  if (!entries || entries.length === 0) {
    return {
      pages: [],
      rects: new Map(),
    };
  }

  const rawMaxSize = opts.maxSize ?? 4096;
  const padding = Math.max(0, opts.padding ?? 0);
  const usePowerOfTwo = opts.powerOfTwo !== false;

  const pageSize = usePowerOfTwo ? toPowerOfTwo(rawMaxSize) : rawMaxSize;
  const pageWidth = pageSize;
  const pageHeight = pageSize;

  // Sort deterministically: height descending, then id ascending
  const sorted = [...entries].sort((a, b) => {
    if (b.height !== a.height) {
      return b.height - a.height;
    }
    return a.id.localeCompare(b.id);
  });

  const pages: PagePackingState[] = [];
  const rects = new Map<string, AtlasPageRect>();

  for (const entry of sorted) {
    const w = entry.width;
    const h = entry.height;
    const slotW = w + 2 * padding;
    const slotH = h + 2 * padding;

    if (slotW > pageWidth || slotH > pageHeight) {
      throw new Error(
        `Texture "${entry.id}" (${w}x${h} with padding ${padding}) exceeds maximum page size (${pageWidth}x${pageHeight})`
      );
    }

    let placed = false;

    // Try to place into an existing page
    for (const page of pages) {
      // 1. Try existing shelves on this page (First-Fit)
      for (const shelf of page.shelves) {
        if (shelf.currentX + slotW <= page.width && slotH <= shelf.height) {
          const slotX = shelf.currentX;
          const slotY = shelf.y;
          shelf.currentX += slotW;

          const x = slotX + padding;
          const y = slotY + padding;

          rects.set(entry.id, {
            page: page.pageIndex,
            x,
            y,
            w,
            h,
            u0: x / page.width,
            v0: y / page.height,
            u1: (x + w) / page.width,
            v1: (y + h) / page.height,
          });

          placed = true;
          break;
        }
      }

      if (placed) break;

      // 2. Try creating a new shelf on this page
      if (page.currentY + slotH <= page.height) {
        const shelfY = page.currentY;
        const newShelf: Shelf = {
          y: shelfY,
          height: slotH,
          currentX: slotW,
        };
        page.shelves.push(newShelf);
        page.currentY += slotH;

        const x = padding;
        const y = shelfY + padding;

        rects.set(entry.id, {
          page: page.pageIndex,
          x,
          y,
          w,
          h,
          u0: x / page.width,
          v0: y / page.height,
          u1: (x + w) / page.width,
          v1: (y + h) / page.height,
        });

        placed = true;
        break;
      }
    }

    // 3. Overflow: create a new page if it could not fit in any existing page
    if (!placed) {
      const pageIndex = pages.length;
      const newPage: PagePackingState = {
        pageIndex,
        width: pageWidth,
        height: pageHeight,
        shelves: [],
        currentY: slotH,
      };

      const newShelf: Shelf = {
        y: 0,
        height: slotH,
        currentX: slotW,
      };
      newPage.shelves.push(newShelf);
      pages.push(newPage);

      const x = padding;
      const y = padding;

      rects.set(entry.id, {
        page: pageIndex,
        x,
        y,
        w,
        h,
        u0: x / pageWidth,
        v0: y / pageHeight,
        u1: (x + w) / pageWidth,
        v1: (y + h) / pageHeight,
      });
    }
  }

  return {
    pages: pages.map((p) => ({ width: p.width, height: p.height })),
    rects,
  };
}

/**
 * Parse an animation section from a texture's .png.mcmeta JSON.
 *
 * Accepts either the raw mcmeta JSON object `{ animation: { ... } }` or the
 * unwrapped animation object `{ frametime: ..., frames: ..., height: ... }`.
 *
 * Returns parsed McmetaAnimation or null if no animation section exists.
 */
export function parseMcmetaAnimation(json: unknown): McmetaAnimation | null {
  if (!json || typeof json !== 'object') {
    return null;
  }

  const record = json as Record<string, unknown>;

  // Check if wrapped in { animation: ... }
  let animObj: Record<string, unknown> | null = null;
  if ('animation' in record) {
    if (record.animation && typeof record.animation === 'object') {
      animObj = record.animation as Record<string, unknown>;
    } else {
      return null;
    }
  } else if ('frametime' in record || 'frames' in record || 'interpolate' in record) {
    animObj = record;
  } else {
    return null;
  }

  const result: McmetaAnimation = {};

  if (typeof animObj.height === 'number') {
    result.frameHeight = animObj.height;
  } else if (typeof animObj.frameHeight === 'number') {
    result.frameHeight = animObj.frameHeight;
  }

  if (typeof animObj.width === 'number') {
    result.width = animObj.width;
  }

  if (typeof animObj.frametime === 'number') {
    result.frametime = animObj.frametime;
  } else {
    result.frametime = 1;
  }

  if (typeof animObj.interpolate === 'boolean') {
    result.interpolate = animObj.interpolate;
  }

  if (Array.isArray(animObj.frames)) {
    result.frames = animObj.frames as (number | AnimationFrameDef)[];
  }

  return result;
}

/**
 * Compute the single-frame dimensions to use in the static texture atlas.
 *
 * In Minecraft, animated textures are vertical strips where frame height equals
 * image width unless explicitly overridden by `height` in .png.mcmeta.
 */
export function getFirstFrameDimensions(
  imageWidth: number,
  imageHeight: number,
  mcmeta?: unknown
): { width: number; height: number } {
  const anim = parseMcmetaAnimation(mcmeta);
  const frameHeight = anim?.frameHeight ?? imageWidth;
  return {
    width: imageWidth,
    height: Math.min(frameHeight, imageHeight),
  };
}

/**
 * Alias for getFirstFrameDimensions for API flexibility.
 */
export const getAnimationFrameDimensions = getFirstFrameDimensions;
