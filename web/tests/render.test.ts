// Development tool, not a test: renders pictures of the geometry without a browser (a small
// software rasterizer writing PNG). Runs only with `npm run render`; the pictures land in
// web/renders/ (ignored by git). Useful to look at geometry changes before a test print.
import { mkdirSync, writeFileSync } from "node:fs";
import { zlibSync } from "fflate";
import { it } from "vitest";
import { analyze, rotate } from "../src/core/layout";
import type { PartMesh } from "../src/core/mesh";
import { newProject } from "../src/core/project";
import type { TemplateId } from "../src/core/project";
import { route, trainPoses } from "../src/core/route";
import { PLAIN, standardElements } from "../src/core/track";
import { DEFAULT_FITS, VEHICLE_KINDS, chassisSizes, makeVehicle } from "../src/core/vehicle";
import { createEngine } from "../src/geometry/engine";
import type { Engine } from "../src/geometry/engine";
import { TRACK_HEIGHT } from "../src/presets/gauge";
import { TRACK_CLEARANCE } from "../src/presets/print";

const OUT = process.env.TRAINATION_RENDER_DIR ?? "renders";
type RGB = [number, number, number];

interface Item {
  part: PartMesh;
  x: number;
  y: number;
  z: number;
  rotation?: number;
  color: RGB;
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function png(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw)), chunk("IEND", new Uint8Array())];
  const file = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    file.set(p, o);
    o += p.length;
  }
  return file;
}

/** Orthographic picture: turned by `yaw` about Z, looked at from `pitch` above; flat shading. */
function render(name: string, items: Item[], yaw: number, pitch: number, W = 1400, H = 900): void {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * cy - y * sy;
    const y1 = x * sy + y * cy;
    return [x1, z * cp + y1 * sp, -y1 * cp + z * sp];
  };
  const world = items.map((it) => {
    const p = it.part.mesh.positions;
    const out = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) {
      const [rx, ry] = rotate(p[i] as number, p[i + 1] as number, it.rotation ?? 0);
      out[i] = rx + it.x;
      out[i + 1] = ry + it.y;
      out[i + 2] = (p[i + 2] as number) + it.z;
    }
    return out;
  });
  let lo: [number, number] = [Infinity, Infinity];
  let hi: [number, number] = [-Infinity, -Infinity];
  for (const p of world) {
    for (let i = 0; i < p.length; i += 3) {
      const [u, v] = project(p[i] as number, p[i + 1] as number, p[i + 2] as number);
      lo = [Math.min(lo[0], u), Math.min(lo[1], v)];
      hi = [Math.max(hi[0], u), Math.max(hi[1], v)];
    }
  }
  const scale = Math.min((W - 40) / (hi[0] - lo[0]), (H - 40) / (hi[1] - lo[1]));
  const rgb = new Uint8Array(W * H * 3).fill(235);
  const depth = new Float32Array(W * H).fill(-Infinity);
  const light = [0.4, -0.6, 0.7];
  const ln = Math.hypot(...light);
  items.forEach((it, n) => {
    const p = world[n] as Float32Array;
    const ix = it.part.mesh.indices;
    for (let t = 0; t < ix.length; t += 3) {
      const v: [number, number, number][] = [0, 1, 2].map((k) => {
        const j = (ix[t + k] as number) * 3;
        return [p[j] as number, p[j + 1] as number, p[j + 2] as number];
      }) as [number, number, number][];
      const [a, b, c] = v as [[number, number, number], [number, number, number], [number, number, number]];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nl = Math.hypot(nx, ny, nz) || 1;
      const shade = 0.35 + 0.65 * Math.abs((nx * (light[0] as number) + ny * (light[1] as number) + nz * (light[2] as number)) / (nl * ln));
      const s = v.map((q) => {
        const [u, w, d] = project(q[0], q[1], q[2]);
        return [20 + (u - lo[0]) * scale, H - 20 - (w - lo[1]) * scale, d] as [number, number, number];
      });
      const [p0, p1, p2] = s as [[number, number, number], [number, number, number], [number, number, number]];
      const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
      const minY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
          const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const d = w0 * p0[2] + w1 * p1[2] + w2 * p2[2];
          const k = y * W + x;
          if (d <= (depth[k] as number)) continue;
          depth[k] = d;
          rgb[k * 3] = it.color[0] * shade;
          rgb[k * 3 + 1] = it.color[1] * shade;
          rgb[k * 3 + 2] = it.color[2] * shade;
        }
      }
    }
  });
  writeFileSync(`${OUT}/${name}.png`, png(W, H, rgb));
}

const hex = (h: string): RGB => [1, 3, 5].map((i) => Math.max(parseInt(h.slice(i, i + 2), 16), 40)) as RGB;

function layoutItems(engine: Engine, template: TemplateId): Item[] {
  const project = newProject(template);
  const analysis = analyze(project.layout, project.elements);
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const options = { doubleSided: project.settings.doubleSided, connectorFit: project.settings.connectorFit };
  const items: Item[] = [];
  for (const piece of project.layout.pieces) {
    const type = typeOf.get(piece.type);
    const pose = analysis.poses.get(piece.id);
    if (!type || !pose) continue;
    items.push({ part: engine.element(type, piece.variant, options), x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation, color: hex(type.color) });
  }
  const poses = trainPoses(route(project.layout, project.elements, analysis), project.vehicles.map((v) => v.length));
  project.vehicles.forEach((v, i) => {
    const pose = poses[i];
    if (!pose) return;
    const m = engine.vehicle(v, DEFAULT_FITS);
    const s = chassisSizes(v);
    const z = pose.z + TRACK_HEIGHT + TRACK_CLEARANCE;
    const at = (part: PartMesh, color: string, dz: number): Item => ({ part, x: pose.x, y: pose.y, z: z + dz, rotation: pose.rotation, color: hex(color) });
    items.push(at(m.chassis, v.colors.chassis, 0), at(m.running, v.colors.wheels, 0), at(m.body, v.colors.body, s.deckTop));
    if (m.accent) items.push(at(m.accent, v.colors.accent, s.deckTop));
  });
  return items;
}

it.skipIf(!process.env.TRAINATION_RENDER)(
  "renders pictures of the geometry",
  async () => {
    mkdirSync(OUT, { recursive: true });
    const engine = await createEngine();
    const opts = { doubleSided: true, connectorFit: 0.4 };
    const wood = hex("#E4BD68");
    const elements = standardElements();
    render("elements", elements.map((e, i) => ({ part: engine.element(e, PLAIN, opts), x: (i % 5) * 300, y: -Math.floor(i / 5) * 300, z: 0, color: wood })), -0.5, 0.75);
    render("vehicles", VEHICLE_KINDS.flatMap((k, i) => {
      const v = makeVehicle(k, k === "box" ? { front: "hook", rear: "eye" } : {});
      const m = engine.vehicle(v, DEFAULT_FITS);
      const deck = chassisSizes(v).deckTop;
      const x = (i % 3) * 220;
      const y = -Math.floor(i / 3) * 90;
      return [
        { part: m.chassis, x, y, z: 0, color: hex(v.colors.chassis) },
        { part: m.body, x, y, z: deck, color: hex(v.colors.body) },
        ...(m.accent ? [{ part: m.accent, x, y, z: deck, color: hex(v.colors.accent) }] : []),
        { part: m.running, x, y, z: 0, color: hex(v.colors.wheels) },
      ];
    }), -0.55, 0.45);
    for (const template of ["oval", "siding", "hill"] as const) render(`layout-${template}`, layoutItems(engine, template), -0.4, 0.8);
  },
  600_000,
);
