// Decoration on vehicle sides and fronts: patterns, lettering, a face. Drawn as 2D outlines and
// put onto a wall, raised (its own colour, multi-filament print) or engraved (one colour).
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import type { Decor } from "../core/vehicle";
import { textOutline, textWidth } from "./text";

/** How deep decoration goes into the wall and how far it stands out. */
export const DECOR_RAISE = 0.6;
export const DECOR_EMBED = 1;
export const ENGRAVE_DEPTH = 0.6;

/** A strip on both side walls (at y = ±half) where patterns and lettering go. */
export interface Band {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  half: number;
}

/** A spot on the front wall (at x) for the face; z is its middle, r how much room there is. */
export interface FaceSpot {
  x: number;
  z: number;
  r: number;
}

function star(wasm: ManifoldToplevel, r: number): CrossSection {
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    points.push([rr * Math.cos(a), rr * Math.sin(a)]);
  }
  return wasm.CrossSection.ofPolygons([points]);
}

function heart(wasm: ManifoldToplevel, size: number): CrossSection {
  const r = size * 0.27;
  const left = wasm.CrossSection.circle(r, 20).translate([-r * 0.9, r * 0.5]);
  const right = wasm.CrossSection.circle(r, 20).translate([r * 0.9, r * 0.5]);
  const tip = wasm.CrossSection.square([0.01, 0.01], true).translate([0, -size * 0.5]);
  return wasm.CrossSection.hull([left, tip]).add(wasm.CrossSection.hull([right, tip]));
}

/** The pattern of a band as a 2D outline in (x, z), leaving out `gap` mm around x = middle (for lettering). */
export function patternOutline(wasm: ManifoldToplevel, decor: Decor, band: Band, gap = 0): CrossSection | undefined {
  const { x0, x1, z0, z1 } = band;
  const mid = (x0 + x1) / 2;
  const zm = (z0 + z1) / 2;
  const free = (x: number, w: number) => Math.abs(x - mid) > gap / 2 + w / 2;
  const along = (step: number, w: number) => {
    const xs: number[] = [];
    const n = Math.floor((x1 - x0 - w) / step);
    const start = mid - (n * step) / 2;
    for (let i = 0; i <= n; i++) {
      const x = start + i * step;
      if (free(x, w)) xs.push(x);
    }
    return xs;
  };
  const parts: CrossSection[] = [];
  switch (decor) {
    case "none":
      return undefined;
    case "stripe": {
      const h = Math.min(3, (z1 - z0) / 3);
      if (gap > 0) {
        const left = mid - gap / 2 - x0;
        const right = x1 - (mid + gap / 2);
        if (left > 2) parts.push(wasm.CrossSection.square([left, h]).translate([x0, zm - h / 2]));
        if (right > 2) parts.push(wasm.CrossSection.square([right, h]).translate([mid + gap / 2, zm - h / 2]));
      } else parts.push(wasm.CrossSection.square([x1 - x0, h]).translate([x0, zm - h / 2]));
      break;
    }
    case "rivets":
      for (const x of along(5, 2)) for (const z of [z0 + 1.2, z1 - 1.2]) parts.push(wasm.CrossSection.circle(0.8, 12).translate([x, z]));
      break;
    case "dots":
      for (const x of along(9, 4)) parts.push(wasm.CrossSection.circle(2, 20).translate([x, zm]));
      break;
    case "stars":
      for (const x of along(12, 7)) parts.push(star(wasm, Math.min(3.4, (z1 - z0) / 2 - 0.5)).translate([x, zm]));
      break;
    case "hearts":
      for (const x of along(12, 7)) parts.push(heart(wasm, Math.min(6.5, z1 - z0 - 1)).translate([x, zm]));
      break;
  }
  return parts.length > 0 ? wasm.CrossSection.union(parts) : undefined;
}

/** Lettering in the middle of a band; its width (for leaving a gap in the pattern). */
export function letteringOutline(wasm: ManifoldToplevel, text: string, band: Band): { outline: CrossSection; width: number } | undefined {
  if (!text.trim()) return undefined;
  const room = band.z1 - band.z0;
  let height = Math.min(7, room - 1.5);
  const maxWidth = band.x1 - band.x0 - 4;
  if (textWidth(text, height) > maxWidth) height = (height * maxWidth) / textWidth(text, height);
  if (height < 2.5) return undefined;
  const outline = textOutline(wasm, text, height, Math.max(0.9, height * 0.17));
  if (!outline) return undefined;
  return { outline: outline.translate([(band.x0 + band.x1) / 2, (band.z0 + band.z1) / 2 - height / 2]), width: textWidth(text, height) + 4 };
}

/**
 * A 2D outline in (x, z) put onto both side walls of a band (y = ±half): from `inner` mm inside
 * the wall to `outer` mm outside. The +Y copy is mirrored about the middle of the band, so that
 * text reads right from both sides and stays in its place.
 */
export function onSides(outline: CrossSection, band: Band, inner: number, outer: number): Manifold {
  const depth = inner + outer;
  const mid = (band.x0 + band.x1) / 2;
  // −Y side: extrude along Z and turn: the outline's y becomes world Z, the extrusion runs to −Y
  const place = (o: CrossSection) => o.extrude(depth).rotate([90, 0, 0]).translate([0, -band.half + inner, 0]);
  const minus = place(outline);
  const plus = place(outline.translate([-mid, 0]).mirror([1, 0]).translate([mid, 0])).mirror([0, 1, 0]);
  return minus.add(plus);
}

/** The face as a 2D outline in (y, z) around (0, 0): two eyes and a smile. */
export function faceOutline(wasm: ManifoldToplevel, r: number): CrossSection {
  const eye = Math.max(0.9, r * 0.17);
  const parts: CrossSection[] = [wasm.CrossSection.circle(eye, 20).translate([-r * 0.38, r * 0.3]), wasm.CrossSection.circle(eye, 20).translate([r * 0.38, r * 0.3])];
  const stroke = Math.max(0.5, r * 0.08);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (1.18 + (0.64 * i) / 8);
    pts.push([Math.cos(a) * r * 0.5, r * 0.05 + Math.sin(a) * r * 0.5]);
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i] as [number, number];
    const [bx, by] = pts[i + 1] as [number, number];
    parts.push(wasm.CrossSection.hull([wasm.CrossSection.circle(stroke, 10).translate([ax, ay]), wasm.CrossSection.circle(stroke, 10).translate([bx, by])]));
  }
  return wasm.CrossSection.union(parts);
}

/** Column-major 4×4: outline x → world Y, outline y → world Z, extrusion → world X. */
const YZ_TO_FRONT: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] = [
  0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1,
];

/** An outline in (y, z) put onto a front wall at x (facing +X), from `inner` inside to `outer` outside. */
export function onFront(outline: CrossSection, spot: FaceSpot, inner: number, outer: number): Manifold {
  return outline
    .extrude(inner + outer)
    .transform(YZ_TO_FRONT)
    .translate([spot.x - inner, 0, spot.z]);
}
