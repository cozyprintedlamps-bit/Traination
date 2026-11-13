// Puts print parts on print beds (shelf packing) and writes them into 3MF files. A Bambu project
// keeps at most four plates in place, so more plates go into further files.
import type { MeshData, PartMesh } from "../core/mesh";
import { BED_SPACING } from "../presets/print";
import { MAX_PLATES, writeBambu3mf } from "./bambu3mf";
import type { PrintPart, PrintVolume } from "./bambu3mf";
import { filamentProfile, processProfile } from "./bambuProfiles";

export interface PrintItem {
  name: string;
  color: string;
  part: PartMesh;
  /** further volumes of the same object with their own colour */
  volumes?: { name: string; color: string; part: PartMesh }[];
  count: number;
}

export interface Placed {
  item: PrintItem;
  /** the copy of the mesh as placed (turned by 90° if that was needed) */
  mesh: MeshData;
  volumes: { name: string; color: string; mesh: MeshData }[];
  plate: number;
  /** middle of the part from the middle of the bed */
  offset: [number, number];
  size: [number, number];
}

export interface Packing {
  placed: Placed[];
  plates: number;
  /** parts that fit on no bed */
  tooBig: PrintItem[];
}

function turn(mesh: MeshData): MeshData {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = -(mesh.positions[i + 1] as number);
    positions[i + 1] = mesh.positions[i] as number;
    positions[i + 2] = mesh.positions[i + 2] as number;
  }
  return { positions, indices: mesh.indices };
}

/** Footprint of a part including its volumes (x, y) and the middle of it. */
function footprint(item: PrintItem): { size: [number, number]; mid: [number, number] } {
  const parts = [item.part, ...(item.volumes ?? []).map((v) => v.part)];
  const lo = [Math.min(...parts.map((p) => p.min[0])), Math.min(...parts.map((p) => p.min[1]))];
  const hi = [Math.max(...parts.map((p) => p.max[0])), Math.max(...parts.map((p) => p.max[1]))];
  return { size: [(hi[0] as number) - (lo[0] as number), (hi[1] as number) - (lo[1] as number)], mid: [((lo[0] as number) + (hi[0] as number)) / 2, ((lo[1] as number) + (hi[1] as number)) / 2] };
}

/** Shelf packing: rows from the back of the bed to the front, the tallest parts first. */
export function pack(items: PrintItem[], bed: [number, number], spacing = BED_SPACING): Packing {
  const usable: [number, number] = [bed[0] - 2 * spacing, bed[1] - 2 * spacing];
  const copies: { item: PrintItem; turned: boolean; size: [number, number] }[] = [];
  const tooBig: PrintItem[] = [];
  for (const item of items) {
    const { size } = footprint(item);
    const fits = size[0] <= usable[0] && size[1] <= usable[1];
    const fitsTurned = size[1] <= usable[0] && size[0] <= usable[1];
    if (!fits && !fitsTurned) {
      tooBig.push(item);
      continue;
    }
    // lie long parts along X: rows stay low
    const turned = !fits || (fitsTurned && size[1] > size[0]);
    const s: [number, number] = turned ? [size[1], size[0]] : size;
    for (let i = 0; i < item.count; i++) copies.push({ item, turned, size: s });
  }
  copies.sort((a, b) => b.size[1] - a.size[1] || b.size[0] - a.size[0]);

  const placed: Placed[] = [];
  let plate = 1;
  let x = 0;
  let y = 0;
  let row = 0;
  for (const copy of copies) {
    if (x > 0 && x + copy.size[0] > usable[0]) {
      x = 0;
      y += row + spacing;
      row = 0;
    }
    if (y + copy.size[1] > usable[1]) {
      plate += 1;
      x = 0;
      y = 0;
      row = 0;
    }
    const { item, turned } = copy;
    const mesh = turned ? turn(item.part.mesh) : item.part.mesh;
    const volumes = (item.volumes ?? []).map((v) => ({ name: v.name, color: v.color, mesh: turned ? turn(v.part.mesh) : v.part.mesh }));
    // the writer centres each object on its bounding box, so the offset is the middle of the footprint
    placed.push({
      item,
      mesh,
      volumes,
      plate,
      offset: [-usable[0] / 2 + x + copy.size[0] / 2, usable[1] / 2 - y - copy.size[1] / 2],
      size: copy.size,
    });
    x += copy.size[0] + spacing;
    row = Math.max(row, copy.size[1]);
  }
  return { placed, plates: placed.length === 0 ? 0 : plate, tooBig };
}

export interface ExportFile {
  name: string;
  data: Uint8Array;
  plates: number;
}

/** 3MF files of a packing, four plates each. */
export function writeFiles(packing: Packing, baseName: string, printer: { preset: string; bed: [number, number]; height: number }): ExportFile[] {
  const files: ExportFile[] = [];
  const fileCount = Math.ceil(packing.plates / MAX_PLATES);
  // copies of one part are numbered across all files
  const seen = new Map<PrintItem, number>();
  const numberOf = new Map<Placed, number>();
  for (const p of packing.placed) {
    const n = (seen.get(p.item) ?? 0) + 1;
    seen.set(p.item, n);
    numberOf.set(p, n);
  }
  for (let f = 0; f < fileCount; f++) {
    const first = f * MAX_PLATES + 1;
    const last = Math.min(packing.plates, first + MAX_PLATES - 1);
    const parts: PrintPart[] = packing.placed
      .filter((p) => p.plate >= first && p.plate <= last)
      .map((p) => {
        const volumes: PrintVolume[] = p.volumes.map((v) => withProfile({ name: v.name, mesh: v.mesh, color: v.color }, printer.preset));
        return withProfile(
          {
            name: `${p.item.name}${p.item.count > 1 ? ` ${numberOf.get(p)}` : ""}`,
            mesh: p.mesh,
            color: p.item.color,
            plate: p.plate - first + 1,
            offset: p.offset,
            ...(volumes.length > 0 ? { volumes } : {}),
          },
          printer.preset,
        );
      });
    const data = writeBambu3mf(parts, {
      bed: printer.bed,
      presets: { printer: printer.preset, process: processProfile(printer.preset), printableHeight: String(printer.height) },
    });
    files.push({ name: fileCount > 1 ? `${baseName}-${f + 1}.3mf` : `${baseName}.3mf`, data, plates: last - first + 1 });
  }
  return files;
}

function withProfile<T extends { color: string }>(part: T, printer: string): T {
  const filament = filamentProfile(part.color.toUpperCase(), printer);
  return filament ? { ...part, filament } : part;
}
