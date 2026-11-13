// Printed gears for the CyberBrick drive: an involute (helical) worm wheel and a single-start worm.
import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";

const PRESSURE_ANGLE = (20 * Math.PI) / 180;
const inv = (a: number) => Math.tan(a) - a;

/** The outline of an involute spur gear, centred on the origin. */
export function gearOutline(wasm: ManifoldToplevel, module: number, teeth: number, backlash = 0): CrossSection {
  const r = (module * teeth) / 2;
  const rb = r * Math.cos(PRESSURE_ANGLE);
  const ra = r + module;
  const rf = r - 1.25 * module;
  // half the tooth angle at the pitch circle, thinner by the backlash
  const half = Math.PI / (2 * teeth) - backlash / (2 * r);
  const steps = 8;
  const flank: [number, number][] = []; // (radius, angle from the tooth middle)
  const start = Math.max(rb, rf);
  if (rf < rb) flank.push([rf, half + inv(PRESSURE_ANGLE)]);
  for (let i = 0; i <= steps; i++) {
    const rr = start + ((ra - start) * i) / steps;
    const a = Math.acos(Math.min(rb / rr, 1));
    flank.push([rr, half + inv(PRESSURE_ANGLE) - inv(a)]);
  }
  const points: [number, number][] = [];
  for (let k = 0; k < teeth; k++) {
    const mid = (2 * Math.PI * k) / teeth;
    for (const [rr, a] of flank) points.push([rr * Math.cos(mid - a), rr * Math.sin(mid - a)]);
    for (const [rr, a] of [...flank].reverse()) points.push([rr * Math.cos(mid + a), rr * Math.sin(mid + a)]);
  }
  return wasm.CrossSection.ofPolygons([points]);
}

/**
 * A helical worm wheel lying flat (axis Z, from 0 to width). The teeth lean by the lead angle of
 * the worm, so that they mesh along a line instead of a point.
 */
export function wormWheel(wasm: ManifoldToplevel, module: number, teeth: number, width: number, wormPitchDiameter: number, backlash: number): Manifold {
  const r = (module * teeth) / 2;
  const lead = Math.PI * module; // single start
  const leadAngle = Math.atan(lead / (Math.PI * wormPitchDiameter));
  const twist = ((width * Math.tan(leadAngle)) / r) * (180 / Math.PI);
  return gearOutline(wasm, module, teeth, backlash).extrude(width, Math.max(4, Math.ceil(width / 0.4)), twist);
}

/** A single-start worm (axis Z, from 0 to length) with a bore for the motor shaft. */
export function worm(wasm: ManifoldToplevel, module: number, pitchDiameter: number, length: number, bore: number): Manifold {
  const pitch = Math.PI * module;
  const r1 = pitchDiameter / 2;
  const ra = r1 + module;
  const rf = r1 - 1.25 * module;
  const slope = Math.tan(PRESSURE_ANGLE);
  const halfPitchThick = pitch / 4;
  const tipHalf = Math.max(halfPitchThick - (ra - r1) * slope, 0.1);
  const rootHalf = halfPitchThick + (r1 - rf) * slope;
  // radius over one turn: the thread profile along the axis, wrapped around
  const n = 96;
  const contour: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const phi = (2 * Math.PI * i) / n;
    let dz = (phi / (2 * Math.PI)) * pitch;
    if (dz > pitch / 2) dz -= pitch;
    const d = Math.abs(dz);
    const rr = d <= tipHalf ? ra : d >= rootHalf ? rf : r1 - (d - halfPitchThick) / slope;
    contour.push([rr * Math.cos(phi), rr * Math.sin(phi)]);
  }
  const thread = wasm.CrossSection.ofPolygons([contour]).extrude(length, Math.ceil(length / 0.15), (360 * length) / pitch);
  const hole = wasm.Manifold.cylinder(length + 2, bore / 2, bore / 2, 24).translate([0, 0, -1]);
  return thread.subtract(hole);
}
