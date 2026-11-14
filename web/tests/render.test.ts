// Development tool, not a test: renders pictures of the geometry without a browser (a small
// software rasterizer writing PNG). Runs only with `npm run render`; the pictures land in
// web/renders/ (ignored by git). Useful to look at geometry changes before a test print.
import { mkdirSync, writeFileSync } from "node:fs";
import { zlibSync } from "fflate";
import { it } from "vitest";
import { analyze, rotate } from "../src/core/layout";
import type { PartMesh } from "../src/core/mesh";
import { TEMPLATES, newProject } from "../src/core/project";
import type { TemplateId } from "../src/core/project";
import { route, trainPoses } from "../src/core/route";
import { PLAIN, makeElement, standardElements } from "../src/core/track";
import { CATEGORIES, DEFAULT_FITS, KINDS_BY_CATEGORY, chassisSizes, makeVehicle } from "../src/core/vehicle";
import type { Vehicle } from "../src/core/vehicle";
import { BUILDING_CATEGORIES, BUILDING_CATEGORY_IDS, BUILDING_KINDS, makeBuilding } from "../src/core/buildings";
import type { Building } from "../src/core/buildings";
import { supports } from "../src/core/supports";
import { createEngine } from "../src/geometry/engine";
import { trackOptions } from "../src/export/printItems";
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

/** A vehicle in place: all its parts with their colours. */
function vehicleItems(engine: Engine, v: Vehicle, pose: { x: number; y: number; z: number; rotation: number }): Item[] {
  const m = engine.vehicle(v, DEFAULT_FITS);
  const s = chassisSizes(v);
  const at = (part: PartMesh, color: string, dz: number): Item => ({ part, x: pose.x, y: pose.y, z: pose.z + dz, rotation: pose.rotation, color: hex(color) });
  return [
    at(m.chassis, v.colors.chassis, 0),
    at(m.running, v.colors.wheels, 0),
    at(m.body, v.colors.body, s.deckTop),
    ...m.parts.map((p) => at(p.mesh, v.colors[p.slot], s.deckTop)),
  ];
}

function layoutItems(engine: Engine, template: TemplateId): Item[] {
  const project = newProject(template);
  const analysis = analyze(project.layout, project.elements);
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const options = trackOptions(project);
  const items: Item[] = [];
  for (const piece of project.layout.pieces) {
    const type = typeOf.get(piece.type);
    const pose = analysis.poses.get(piece.id);
    if (!type || !pose) continue;
    items.push({ part: engine.element(type, piece.variant, options), x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation, color: hex(type.color) });
  }
  for (const s of supports(project.layout, project.elements, analysis)) items.push({ part: engine.support(s.height, s.plain), x: s.x, y: s.y, z: 0, rotation: s.heading, color: hex("#8E9089") });
  for (const b of project.buildings) items.push(...buildingItems(engine, b));
  const poses = trainPoses(route(project.layout, project.elements, analysis), project.vehicles.map((v) => v.length));
  project.vehicles.forEach((v, i) => {
    const pose = poses[i];
    if (pose) items.push(...vehicleItems(engine, v, { ...pose, z: pose.z + TRACK_HEIGHT + TRACK_CLEARANCE }));
  });
  return items;
}

function buildingItems(engine: Engine, b: Building): Item[] {
  const m = engine.building(b);
  const at = (part: PartMesh, color: string): Item => ({ part, x: b.x, y: b.y, z: 0, rotation: b.rotation, color: hex(color) });
  return [at(m.base, b.colors.walls), ...m.roofs.map((r) => at(r, b.colors.roof)), ...(m.details ? [at(m.details, b.colors.details)] : [])];
}

it.skipIf(!process.env.TRAINATION_RENDER)(
  "renders pictures of the geometry",
  async () => {
    mkdirSync(OUT, { recursive: true });
    const engine = await createEngine();
    const opts = { doubleSided: true, connectorFit: 0.4, sleepers: true };
    const wood = hex("#E4BD68");
    const elements = standardElements();
    render("elements", elements.map((e, i) => ({ part: engine.element(e, PLAIN, opts), x: (i % 5) * 300, y: -Math.floor(i / 5) * 300, z: 0, color: wood })), -0.5, 0.75);
    for (const category of CATEGORIES) {
      render(`vehicles-${category}`, KINDS_BY_CATEGORY[category].flatMap((k, i) => {
        const v = makeVehicle(k, k === "box" ? { front: "hook", rear: "eye" } : {});
        v.design = { ...v.design, split: i % 2 === 0, decor: (["stripe", "stars", "dots", "hearts", "rivets"] as const)[i % 5] ?? "none", lettering: i % 2 ? "" : "TRAIN", face: i === 0 };
        return vehicleItems(engine, v, { x: (i % 3) * 220, y: -Math.floor(i / 3) * 90, z: 0, rotation: 0 });
      }), -0.55, 0.45);
    }
    render("cyberbrick", vehicleItems(engine, makeVehicle("cyberbrick"), { x: 0, y: 0, z: 0, rotation: 0 }), -0.6, 0.4, 1000, 700);
    const cb = makeVehicle("cyberbrick");
    const cm = engine.vehicle(cb, DEFAULT_FITS);
    render("cyberbrick-inside", [
      { part: cm.chassis, x: 0, y: 0, z: 0, color: [120, 120, 120] },
      { part: cm.running, x: 0, y: 0, z: 0, color: [40, 40, 40] },
      ...(cm.inside ? [{ part: cm.inside, x: 0, y: 0, z: 0, color: [40, 120, 200] as RGB }] : []),
    ], -0.6, 0.5, 1000, 700);
    render("buildings", BUILDING_KINDS.flatMap((k, i) => buildingItems(engine, { ...makeBuilding(k), name: "BAHNHOF", x: (i % 4) * 260, y: -Math.floor(i / 4) * 160 })), -0.5, 0.6);
    for (const category of BUILDING_CATEGORY_IDS) {
      render(`buildings-${category}`, BUILDING_CATEGORIES[category].flatMap((k, i) => buildingItems(engine, { ...makeBuilding(k), name: "BAHNHOF", x: i * 270, y: 0 })), -0.45, 0.5, 1400, 700);
    }
    // switches with a lever (slider in place, route A open), and the sliders as printed; studs on both sides
    const levers = [makeElement("switch", { hand: "left", lever: true }), makeElement("switch", { hand: "right", lever: true }), makeElement("yswitch", { lever: true })];
    render("levers", [
      ...levers.map((e, i) => ({ part: engine.element(e, PLAIN, opts), x: i * 260, y: 0, z: 0, color: wood })),
      ...levers.map((e, i) => ({ part: engine.slider(e, PLAIN), x: i * 260, y: -150, z: 0, color: hex("#C12E1F") })),
    ], -0.5, 0.7, 1400, 800);
    const studded = [
      makeElement("straight", { length: 216, studs: { left: { kind: "lego", rows: 3 }, right: { kind: "duplo", rows: 2 } } }),
      makeElement("curve", { studs: { left: { kind: "lego", rows: 4 }, right: { kind: "lego", rows: 2 } } }),
    ];
    render("studs", studded.map((e, i) => ({ part: engine.element(e, PLAIN, opts), x: i * 300, y: 0, z: 0, color: wood })), -0.5, 0.75, 1400, 800);
    // close-ups of sleepers, viaduct ramps, bridge pillars and supports
    const byId = new Map(elements.map((e) => [e.id, e]));
    const detail = ["straight-144", "curve-large", "buffer", "ramp-1", "ramp-2", "bridge"].map((id, i) => ({ part: engine.element(byId.get(id)!, PLAIN, opts), x: (i % 3) * 280, y: -Math.floor(i / 3) * 140, z: 0, color: wood }));
    detail.push({ part: engine.support(38, false), x: 0, y: -300, z: 0, color: hex("#8E9089") }, { part: engine.support(76, false), x: 120, y: -300, z: 0, color: hex("#8E9089") });
    render("track-detail", detail, -0.45, 0.55);
    render("sleepers-top", ["straight-144", "curve-small"].map((id, i) => ({ part: engine.element(byId.get(id)!, PLAIN, opts), x: i * 200, y: 0, z: 0, color: wood })), -0.02, 1.45, 1200, 600);
    render("ramp-side", [{ part: engine.element(byId.get("ramp-2")!, PLAIN, opts), x: 0, y: 0, z: 0, color: wood }], -0.05, 0.12, 1200, 600);
    for (const template of TEMPLATES) if (template !== "empty") render(`layout-${template}`, layoutItems(engine, template), -0.4, 0.8);
  },
  600_000,
);
