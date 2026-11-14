// A small stroke font (A–Z, 0–9, a few signs) for names and numbers on vehicles and buildings.
// Each glyph is a set of polylines on a 4 × 6 grid; the strokes are drawn as rounded bars, so the
// text prints well even when small. No font files, the same result everywhere.
import type { CrossSection, ManifoldToplevel } from "manifold-3d";

type Line = [number, number][];
const O: Line = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P: Line = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];
const DOT: Line = [[2, 0], [2, 0.01]];

export const GLYPHS: Readonly<Record<string, Line[]>> = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [1, 6], [0, 5], [0, 1], [1, 0], [4, 0]]],
  D: [[[0, 0], [0, 6], [2, 6], [4, 4], [4, 2], [2, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[1, 6], [3, 6]], [[2, 6], [2, 0]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1, 3], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P: [P],
  Q: [O, [[2, 2], [4, 0]]],
  R: [P, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  "0": [O, [[1, 1], [3, 5]]],
  "1": [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  "2": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
  "3": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]], [[1, 3], [3, 3]]],
  "4": [[[3, 0], [3, 6], [0, 2], [4, 2]]],
  "5": [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  "6": [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  "7": [[[0, 6], [4, 6], [1, 0]]],
  "8": [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
  "9": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [4, 3]]],
  ".": [DOT],
  "-": [[[1, 3], [3, 3]]],
  "!": [[[2, 6], [2, 2]], DOT],
  " ": [],
};

const ADVANCE = 5.5;
const GLYPH_HEIGHT = 6;

/** Width of a text drawn `height` mm high. */
export function textWidth(text: string, height: number): number {
  const scale = height / GLYPH_HEIGHT;
  return text.length === 0 ? 0 : (text.length * ADVANCE - (ADVANCE - 4)) * scale;
}

/**
 * The text as a cross-section: baseline at y = 0, centred on x = 0, `height` mm high (letters),
 * strokes `stroke` mm wide. Unknown characters are left out.
 */
export function textOutline(wasm: ManifoldToplevel, text: string, height: number, stroke: number): CrossSection | undefined {
  const scale = height / GLYPH_HEIGHT;
  const start = -textWidth(text, height) / 2;
  const r = stroke / 2;
  const pieces: CrossSection[] = [];
  [...text].forEach((ch, i) => {
    const lines = GLYPHS[ch];
    if (!lines) return;
    const ox = start + i * ADVANCE * scale;
    for (const line of lines) {
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, ay] = line[k] as [number, number];
        const [bx, by] = line[k + 1] as [number, number];
        const a = wasm.CrossSection.circle(r, 12).translate([ox + ax * scale, ay * scale]);
        const b = wasm.CrossSection.circle(r, 12).translate([ox + bx * scale, by * scale]);
        pieces.push(wasm.CrossSection.hull([a, b]));
      }
    }
  });
  if (pieces.length === 0) return undefined;
  return wasm.CrossSection.union(pieces);
}
