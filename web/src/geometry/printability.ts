// Can a part be printed without support material? The part is cut into layers; every layer has to
// stand on the layer a little below it, grown by the 45° a printer bridges by itself. What reaches
// further out hangs in the air: its area (roughly the flat underside that would need support) is
// the overhang. Thin slivers (round edges, raised details of a millimetre) do not count.
import type { CrossSection, Manifold } from "manifold-3d";
import { OVERHANG_BRIDGE, OVERHANG_MIN_WIDTH, OVERHANG_STEP, OVERHANG_TOLERANCE, OVERHANG_WINDOW } from "../presets/print";

export interface Overhang {
  /** mm² that would need support (0: prints without) */
  area: number;
  /** height above the bed of the worst layer (mm) */
  z: number;
}

/** The overhang of a part in the orientation it is printed (bed at its lowest point). */
export function overhang(solid: Manifold): Overhang {
  const box = solid.boundingBox();
  const bottom = box.min[2];
  const top = box.max[2];
  const layers: CrossSection[] = [];
  for (let z = bottom + OVERHANG_STEP / 2; z < top; z += OVERHANG_STEP) layers.push(solid.slice(z));
  const window = Math.max(1, Math.round(OVERHANG_WINDOW / OVERHANG_STEP));
  let area = 0;
  let worst = { area: 0, z: 0 };
  for (let k = 1; k < layers.length; k++) {
    const m = Math.min(window, k);
    const below = layers[k - m] as CrossSection;
    const layer = layers[k] as CrossSection;
    if (layer.isEmpty()) continue;
    const reach = m * OVERHANG_STEP + OVERHANG_TOLERANCE;
    // a printer bridges narrow gaps held on both sides (and ledges of half that): grow the support by it
    let rest = below.isEmpty() ? layer : layer.subtract(below.offset(reach + OVERHANG_BRIDGE / 2, "Round", 2, 16));
    if (rest.isEmpty()) continue;
    // opening: slivers thinner than OVERHANG_MIN_WIDTH vanish
    rest = rest.offset(-OVERHANG_MIN_WIDTH / 2, "Miter", 2).offset(OVERHANG_MIN_WIDTH / 2, "Miter", 2);
    const a = rest.area();
    if (a <= 0.01) continue;
    // a flat underside shows up in `window` layers in a row: count it once
    area += a / window;
    if (a > worst.area) worst = { area: a, z: (k + 0.5) * OVERHANG_STEP };
  }
  return { area, z: worst.z };
}
