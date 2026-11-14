// How much material a slicer puts into a part. A slicer prints the surface solid (walls on the
// sides, skins on top and bottom) and fills the inside sparsely. So the estimate is: the shell
// (surface area × wall or skin thickness, depending on which way each face looks) plus the
// sparse infill of the rest of the volume. Thin parts are nearly all shell; for them the estimate
// never exceeds the volume.
import type { MeshData } from "./mesh";
import { PRINT_BOTTOM_SKIN, PRINT_INFILL, PRINT_TOP_SKIN, PRINT_WALL } from "../presets/print";

/** Surface area (mm²) and the shell volume (mm³) of a closed mesh. */
export function shell(mesh: MeshData): { area: number; shell: number } {
  const p = mesh.positions;
  const t = mesh.indices;
  let area = 0;
  let volume = 0;
  for (let i = 0; i < t.length; i += 3) {
    const a = (t[i] as number) * 3;
    const b = (t[i + 1] as number) * 3;
    const c = (t[i + 2] as number) * 3;
    const ux = (p[b] as number) - (p[a] as number);
    const uy = (p[b + 1] as number) - (p[a + 1] as number);
    const uz = (p[b + 2] as number) - (p[a + 2] as number);
    const vx = (p[c] as number) - (p[a] as number);
    const vy = (p[c + 1] as number) - (p[a + 1] as number);
    const vz = (p[c + 2] as number) - (p[a + 2] as number);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const twice = Math.hypot(nx, ny, nz);
    if (twice === 0) continue;
    const face = twice / 2;
    const up = nz / twice;
    const side = Math.sqrt(Math.max(0, 1 - up * up));
    area += face;
    // a face looking up gets the top skin, one looking down the bottom skin, a side face the walls
    volume += face * (side * PRINT_WALL + Math.abs(up) * (up > 0 ? PRINT_TOP_SKIN : PRINT_BOTTOM_SKIN));
  }
  return { area, shell: volume };
}

/** Estimated printed material in mm³ for a part of `volume` mm³. */
export function printedMaterial(mesh: MeshData, volume: number): number {
  if (volume <= 0) return 0;
  const s = shell(mesh).shell;
  const solid = Math.min(volume, s);
  return solid + PRINT_INFILL * (volume - solid);
}
