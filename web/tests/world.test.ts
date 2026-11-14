// Stud ledges on each side, switches with a lever, tunnels, stations and platforms, and the check
// that every print part prints without support.
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { beforeAll, describe, expect, it } from "vitest";
import { BUILDING_KINDS, BUILDING_LIMITS, TUNNEL_CLEARANCE, boreHeight, makeBuilding, snapPlate } from "../src/core/buildings";
import { leverLayout } from "../src/core/lever";
import { analyze, partsList } from "../src/core/layout";
import { clearance, deserialize, newProject, serialize } from "../src/core/project";
import { PLAIN, elementShape, hasStuds, ledges, makeElement, standardElements } from "../src/core/track";
import type { ElementType } from "../src/core/track";
import { DEFAULT_FITS, VEHICLE_KINDS, makeVehicle } from "../src/core/vehicle";
import { buildBuilding } from "../src/geometry/buildings";
import { createEngine } from "../src/geometry/engine";
import type { Engine } from "../src/geometry/engine";
import { createKernel } from "../src/geometry/kernel";
import type { Kernel } from "../src/geometry/kernel";
import { overhang } from "../src/geometry/printability";
import { buildElement, buildSlider, buildSupport, printFlipped, printSlider, sweep } from "../src/geometry/track";
import { buildVehicle } from "../src/geometry/vehicle";
import { trackItems } from "../src/export/printItems";
import type { Names } from "../src/export/printItems";
import { DUPLO, LEGO, ledgeWidth, maxRows } from "../src/presets/bricks";
import { GROOVE_DEPTH, GROOVE_SPACING, GROOVE_WIDTH, PEG_HEAD_DIAMETER, PEG_REACH, TRACK_HEIGHT, TRACK_WIDTH } from "../src/presets/gauge";
import { OVERHANG_LIMIT } from "../src/presets/print";
import { VEHICLE_WIDTH } from "../src/presets/vehicle";

let engine: Engine;
let kernel: Kernel;
let wasm: ManifoldToplevel;
beforeAll(async () => {
  engine = await createEngine();
  kernel = await createKernel();
  wasm = kernel.wasm;
});
const options = { doubleSided: true, connectorFit: 0.4, sleepers: true };
const names: Names = { element: (t) => t.id, vehicle: (v) => v.kind, building: (b) => b.kind, part: (p) => p };

describe("stud ledges on each side", () => {
  const mixed = makeElement("straight", { length: 216, studs: { left: { kind: "lego", rows: 2 }, right: { kind: "duplo", rows: 1 } } });

  it("each side has its own system and rows", () => {
    expect(ledges(mixed)).toEqual({ left: 2 * LEGO.pitch, right: DUPLO.pitch });
    // mirrored, the sides swap
    expect(ledges(mixed, { mirror: true, swap: false })).toEqual({ left: DUPLO.pitch, right: 2 * LEGO.pitch });
    const part = engine.element(mixed, PLAIN, options);
    expect(part.status).toBe("NoError");
    expect(part.max[1]).toBeCloseTo(TRACK_WIDTH / 2 + 2 * LEGO.pitch, 3);
    expect(part.min[1]).toBeCloseTo(-TRACK_WIDTH / 2 - DUPLO.pitch, 3);
    expect(part.max[2]).toBeCloseTo(TRACK_HEIGHT + DUPLO.height, 2);
  });

  it("takes many rows, up to what still fits a 256 mm bed", () => {
    for (const kind of ["lego", "duplo"] as const) {
      const rows = maxRows(kind);
      expect(TRACK_WIDTH + 2 * ledgeWidth(kind, rows)).toBeLessThanOrEqual(256 - 12);
      const wide = makeElement("straight", { length: 108, studs: { left: { kind, rows }, right: { kind, rows } } });
      expect(engine.element(wide, PLAIN, options).status).toBe("NoError");
      // more than the most is cut back
      expect(ledges(makeElement("straight", { studs: { left: { kind, rows: 99 }, right: { kind: "none", rows: 1 } } })).left).toBe(ledgeWidth(kind, rows));
    }
  });

  it("on a curve each row of studs runs on its own arc", () => {
    const curve = makeElement("curve", { studs: { left: { kind: "lego", rows: 3 }, right: { kind: "lego", rows: 3 } } });
    const part = engine.element(curve, PLAIN, options);
    expect(part.status).toBe("NoError");
    // studs: the outer rows are longer, so they carry more studs than the inner ones
    const plain = engine.element(makeElement("curve", { studs: { left: { kind: "lego", rows: 3 }, right: { kind: "none", rows: 1 } } }), PLAIN, options);
    const outerOnly = engine.element(makeElement("curve", { studs: { left: { kind: "none", rows: 1 }, right: { kind: "lego", rows: 3 } } }), PLAIN, options);
    expect(outerOnly.volume).toBeGreaterThan(plain.volume);
  });

  it("old project files with one kind and a side are read as ledges per side", () => {
    const p = newProject("empty");
    const text = serialize(p).replace(/"studs": \{[^}]*\{[^}]*\}[^}]*\{[^}]*\}\s*\}/, '"studs": "lego", "studSide": "left", "studRows": 2');
    const old = JSON.parse(text);
    old.schema = 2;
    const read = deserialize(JSON.stringify(old)).elements[0]!;
    expect(read.studs).toEqual({ left: { kind: "lego", rows: 2 }, right: { kind: "none", rows: 1 } });
    expect("studSide" in read).toBe(false);
    expect(hasStuds(read)).toBe(true);
  });
});

describe("switches with a lever", () => {
  const switches: [string, ElementType][] = [
    ["left switch", makeElement("switch", { hand: "left", lever: true })],
    ["right switch", makeElement("switch", { hand: "right", lever: true })],
    ["Y-switch", makeElement("yswitch", { lever: true })],
  ];

  /** The groove band of one path of the element (the room a wheel runs in), above the groove floor. */
  function corridor(type: ElementType, route: 0 | 1, side: number): Manifold {
    const path = elementShape(type, PLAIN).paths[route]!;
    const u = side * (GROOVE_SPACING / 2);
    const band = wasm.CrossSection.ofPolygons([
      [
        [u - GROOVE_WIDTH / 2 + 0.05, TRACK_HEIGHT - GROOVE_DEPTH + 0.05],
        [u + GROOVE_WIDTH / 2 - 0.05, TRACK_HEIGHT - GROOVE_DEPTH + 0.05],
        [u + GROOVE_WIDTH / 2 - 0.05, TRACK_HEIGHT + 2],
        [u - GROOVE_WIDTH / 2 + 0.05, TRACK_HEIGHT + 2],
      ],
    ]);
    return sweep(wasm, band, path);
  }

  it.each(switches)("%s: the slider moves by one groove width and fits the track in both positions", (_, type) => {
    const l = leverLayout(type, PLAIN)!;
    expect(l).toBeDefined();
    expect(Math.abs(l.shift)).toBeCloseTo(GROOVE_WIDTH, 6);
    const track = buildElement(wasm, type, PLAIN, options);
    for (const shifted of [false, true]) {
      const slider = buildSlider(wasm, l, shifted);
      expect(String(slider.status())).toBe("NoError");
      // no part of the slider runs into the track
      expect(track.intersect(slider).volume()).toBeLessThan(0.5);
      // the open route stays free for the wheels, the other one is blocked by the blade
      const open = corridor(type, shifted ? 1 : 0, l.side);
      const closed = corridor(type, shifted ? 0 : 1, l.side);
      expect(open.intersect(slider).volume()).toBeLessThan(0.5);
      expect(closed.intersect(slider).volume()).toBeGreaterThan(40);
    }
    kernel.release();
  });

  it.each(switches)("%s: the slider is printed flat on its top, the switch only from the top", (_, type) => {
    const slider = engine.slider(type, PLAIN);
    expect(slider.status).toBe("NoError");
    expect(slider.min[2]).toBeCloseTo(0, 3);
    // no grooves on the bottom (turned over, the slider would not work): double-sided changes nothing
    const one = engine.printElement(type, PLAIN, { ...options, doubleSided: false });
    const two = engine.printElement(type, PLAIN, options);
    expect(two.volume).toBeCloseTo(one.volume, 1);
    expect(two.min[2]).toBeCloseTo(0, 3);
  });

  it("a left switch with a lever used as a right one is a part of its own, with its slider", async () => {
    const project = newProject("empty");
    const sw = makeElement("switch", { id: "lever-switch", lever: true });
    project.elements.push(sw);
    project.layout.pieces.push({ id: "a", type: sw.id, variant: PLAIN, port: 0 }, { id: "b", type: sw.id, variant: { mirror: true, swap: false }, port: 0, at: { x: 0, y: 300, rotation: 0 } });
    expect(partsList(project.layout, project.elements, true)).toHaveLength(2);
    const items = await trackItems(project, engine, names);
    expect(items.filter((i) => i.name.endsWith("slider"))).toHaveLength(2);
  });
});

describe("tunnels, stations and platforms", () => {
  it("a train passes through the bore: as much room as under a bridge", () => {
    expect(TUNNEL_CLEARANCE).toBeGreaterThanOrEqual(60);
    expect(boreHeight(VEHICLE_WIDTH / 2) - TRACK_HEIGHT).toBe(TUNNEL_CLEARANCE);
    for (const kind of ["tunnel", "portal", "shed"] as const) {
      const solid = buildBuilding(wasm, makeBuilding(kind)).base;
      // the room of a vehicle (with the track below it) along the whole building
      const room = wasm.Manifold.cube([400, VEHICLE_WIDTH, TRACK_HEIGHT + TUNNEL_CLEARANCE - 0.5], false).translate([-200, -VEHICLE_WIDTH / 2, 0]);
      const track = wasm.Manifold.cube([400, TRACK_WIDTH, TRACK_HEIGHT], false).translate([-200, -TRACK_WIDTH / 2, 0]);
      expect(solid.intersect(room.add(track)).volume(), kind).toBeLessThan(0.5);
    }
    kernel.release();
  });

  it("the curved tunnel of the mountain line lies over its curve without touching it", () => {
    const project = newProject("mountain");
    const a = analyze(project.layout, project.elements);
    const tunnel = project.buildings.find((b) => b.kind === "tunnel_curve")!;
    const tunnelSolid = buildBuilding(wasm, tunnel).base.rotate([0, 0, tunnel.rotation]).translate([tunnel.x, tunnel.y, 0]);
    let touching = 0;
    for (const piece of project.layout.pieces) {
      const type = project.elements.find((e) => e.id === piece.type)!;
      const pose = a.poses.get(piece.id)!;
      const solid = buildElement(wasm, type, piece.variant, options).rotate([0, 0, pose.rotation]).translate([pose.x, pose.y, pose.z]);
      touching += tunnelSolid.intersect(solid).volume();
    }
    expect(touching).toBeLessThan(1);
    kernel.release();
  });

  it("a plan with a tunnel limits the height of the vehicles like a bridge", () => {
    expect(clearance(newProject("mountain"))).toBe(TUNNEL_CLEARANCE);
  });

  it("stud plates snap to the stud grid", () => {
    const plate = snapPlate({ ...makeBuilding("plate_lego"), length: 101, width: 37, height: 9 });
    expect(plate.length % LEGO.pitch).toBe(0);
    expect(plate.width % LEGO.pitch).toBe(0);
    expect(plate.height).toBe(LEGO.plate);
    const m = engine.building(plate);
    expect(m.base.max[2]).toBeCloseTo(LEGO.plate + LEGO.height, 2);
  });

  it.each(BUILDING_KINDS)("%s: its roofs lie flat on the bed", (kind) => {
    const m = engine.building(makeBuilding(kind));
    for (const roof of m.roofs) expect(roof.status).toBe("NoError");
    expect(m.base.min[2]).toBeCloseTo(0, 2);
  });
});

describe("everything prints without support", () => {
  const check = (name: string, solid: Manifold, limit = OVERHANG_LIMIT) => {
    const o = overhang(solid);
    expect(o.area, `${name}: ${o.area.toFixed(1)} mm² at ${o.z.toFixed(1)} mm`).toBeLessThanOrEqual(limit);
  };
  /** The peg at the high end of a ramp reaches into the air: a short ledge left as it is (see CLAUDE.md). */
  const PEG_LEDGE = PEG_HEAD_DIAMETER * PEG_REACH;

  it("track, sliders and supports", () => {
    const types = [...standardElements(), makeElement("switch", { lever: true }), makeElement("yswitch", { lever: true }), makeElement("straight", { studs: { left: { kind: "lego", rows: 4 }, right: { kind: "duplo", rows: 2 } } })];
    for (const type of types) {
      let solid = buildElement(wasm, type, PLAIN, options);
      if (printFlipped(type)) solid = solid.rotate([180, 0, 0]);
      check(type.id, solid, type.kind === "ramp" ? PEG_LEDGE : OVERHANG_LIMIT);
      const lever = leverLayout(type, PLAIN);
      if (lever) check(`${type.kind} slider`, printSlider(wasm, lever));
      kernel.release();
    }
    check("support", buildSupport(wasm, 76, false));
    kernel.release();
  });

  it.each(VEHICLE_KINDS)("%s: chassis, body and separate parts", (kind) => {
    for (const split of [true, false]) {
      const v = makeVehicle(kind);
      v.design = { ...v.design, split, decor: "stars", lettering: "TRAIN 1", face: true, lamps: true, buffers: true };
      const s = buildVehicle(wasm, v, DEFAULT_FITS);
      check(`${kind} chassis`, s.chassis);
      check(`${kind} body (${split ? "split" : "one part"})`, s.body);
      for (const p of s.parts.filter((x) => x.separate)) check(`${kind} ${p.slot}`, p.solid);
      for (const w of s.wheels) check(`${kind} wheel`, w.solid);
      kernel.release();
    }
  });

  it.each(BUILDING_KINDS)("%s: base and roofs, at its standard, smallest and largest size", (kind) => {
    const limits = BUILDING_LIMITS[kind];
    const sizes = [{}, { length: limits.length[0], width: limits.width[0], height: limits.height[0] }, { length: limits.length[1], width: limits.width[1], height: limits.height[1] }];
    for (const size of sizes) {
      const b = snapPlate({ ...makeBuilding(kind), name: "TRAINATION", ...size });
      const s = buildBuilding(wasm, b);
      const label = `${kind} ${b.length}×${b.width}×${b.height}`;
      check(`${label} base`, s.details ? s.base.add(s.details) : s.base);
      s.roofs.forEach((r, i) => check(`${label} roof ${i + 1}`, r.solid));
      kernel.release();
    }
  });
});
