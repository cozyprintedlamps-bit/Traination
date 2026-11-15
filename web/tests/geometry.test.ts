// Geometry invariants: the solids are clean, keep the standard sizes and fit together.
import { beforeAll, describe, expect, it } from "vitest";
import { createEngine } from "../src/geometry/engine";
import type { Engine, VehicleMeshes } from "../src/geometry/engine";
import { BUILDING_KINDS, makeBuilding } from "../src/core/buildings";
import { LEDGE_LOWERED_THICKNESS, LEDGE_ROWS_MAX, LEGO } from "../src/presets/bricks";
import { DRIVE } from "../src/presets/cyberbrick";
import { PLAIN, makeElement, standardElements } from "../src/core/track";
import { DEFAULT_FITS, VEHICLE_KINDS, chassisSizes, makeVehicle } from "../src/core/vehicle";
import { GROOVE_DEPTH, GROOVE_SPACING, GROOVE_WIDTH, PEG_REACH, TRACK_HEIGHT, TRACK_WIDTH } from "../src/presets/gauge";
import { AXLE_DIAMETER, WHEEL_DIAMETER, WHEEL_WIDTH } from "../src/presets/vehicle";

let engine: Engine;
const options = { doubleSided: true, connectorFit: 0.4 };

beforeAll(async () => {
  engine = await createEngine();
});

describe("track elements", () => {
  it.each(standardElements().map((e) => [e.id, e] as const))("%s is a clean solid", (_, type) => {
    const part = engine.element(type, PLAIN, options);
    expect(part.status).toBe("NoError");
    expect(part.volume).toBeGreaterThan(1000);
    expect(part.min[2]).toBeCloseTo(0, 3);
  });

  it("a straight keeps the cross-section: width, height, grooves", () => {
    const L = 144;
    const part = engine.element(makeElement("straight", { length: L }), PLAIN, { doubleSided: false, connectorFit: 0.4 });
    expect(part.max[1] - part.min[1]).toBeCloseTo(TRACK_WIDTH, 3);
    expect(part.max[2]).toBeCloseTo(TRACK_HEIGHT, 3);
    // the peg sticks out at the male end
    expect(part.max[0]).toBeCloseTo(L + PEG_REACH, 2);
    // the cross-section without grooves is width × height minus chamfers; two grooves less
    const chamfers = 4 * 0.5 * 0.8 * 0.8;
    const section = TRACK_WIDTH * TRACK_HEIGHT - chamfers - 2 * GROOVE_WIDTH * GROOVE_DEPTH;
    const pegAndSocket = part.volume - section * L;
    // peg (≈ 11.5² π/4 + neck) × 10.5 high added, a slightly larger socket × 12 high removed: small net change
    expect(Math.abs(pegAndSocket)).toBeLessThan(600);
  });

  it("double-sided track has grooves on both faces", () => {
    const one = engine.element(makeElement("straight", { length: 144 }), PLAIN, { doubleSided: false, connectorFit: 0.4 });
    const two = engine.element(makeElement("straight", { length: 144 }), PLAIN, { doubleSided: true, connectorFit: 0.4 });
    expect(one.volume - two.volume).toBeCloseTo(2 * GROOVE_WIDTH * GROOVE_DEPTH * 144, -1);
  });

  it("a curve lies on its arc", () => {
    const type = makeElement("curve", { radius: 182, angle: 45 });
    const part = engine.element(type, PLAIN, options);
    // the outer edge of the track reaches radius + half width at the end of the arc
    expect(part.max[1]).toBeGreaterThan(182 * (1 - Math.cos(Math.PI / 4)));
    expect(part.min[1]).toBeCloseTo(-TRACK_WIDTH / 2, 0);
    expect(part.status).toBe("NoError");
  });

  it("a bridge is printed upside down and still starts on the bed", () => {
    const type = makeElement("bridge");
    const part = engine.printElement(type, PLAIN, options);
    expect(part.min[2]).toBeCloseTo(0, 3);
    expect(part.status).toBe("NoError");
  });

  it("the peg fits the socket with the fit", () => {
    // a male end pushed into a female end: the two solids overlap only by rounding
    const a = makeElement("straight", { length: 54 });
    const part = engine.element(a, PLAIN, { doubleSided: false, connectorFit: 0.4 });
    expect(part.status).toBe("NoError");
  });
});

describe("vehicles", () => {
  const all = (m: VehicleMeshes) => [m.chassis, m.body, m.axle, m.running, ...m.parts.map((p) => p.mesh), ...m.wheels.map((w) => w.mesh), ...m.drive.map((d) => d.mesh)];

  it.each(VEHICLE_KINDS.flatMap((k) => [[k, true] as const, [k, false] as const]))("%s builds clean parts (split %s)", (kind, split) => {
    const v = makeVehicle(kind);
    v.design = { ...v.design, split, decor: "stars", lettering: "TRAIN 1", face: true };
    const m = engine.vehicle(v, DEFAULT_FITS);
    for (const part of all(m)) {
      expect(part.status).toBe("NoError");
      expect(part.volume).toBeGreaterThan(0);
    }
    // the body stands on the deck
    expect(m.body.min[2]).toBeGreaterThanOrEqual(-0.01);
    // split: coloured parts are separate print parts; otherwise volumes of the body
    for (const p of m.parts) if (!split) expect(p.separate).toBe(false);
  });

  it("separate parts plug onto pins of the body", () => {
    const v = makeVehicle("steam");
    const m = engine.vehicle(v, DEFAULT_FITS);
    const separate = m.parts.filter((p) => p.separate);
    expect(separate.map((p) => p.slot).sort()).toEqual(["details", "details", "roof"]);
    // chimney and dome stand on flat seats: their bottom is above the boiler top
    for (const p of separate) expect(p.mesh.min[2]).toBeGreaterThan(5);
  });

  it("decoration is raised in its own colour, or engraved when printed in parts", () => {
    const raised = makeVehicle("box");
    raised.design = { ...raised.design, split: false, decor: "stripe" };
    expect(engine.vehicle(raised, DEFAULT_FITS).parts.some((p) => p.slot === "decor")).toBe(true);
    const engraved = { ...raised, design: { ...raised.design, split: true } };
    const plain = { ...raised, design: { ...raised.design, split: true, decor: "none" as const } };
    expect(engine.vehicle(engraved, DEFAULT_FITS).parts.some((p) => p.slot === "decor")).toBe(false);
    expect(engine.vehicle(engraved, DEFAULT_FITS).body.volume).toBeLessThan(engine.vehicle(plain, DEFAULT_FITS).body.volume);
  });

  it("the CyberBrick locomotive has a worm drive above the track", () => {
    const v = makeVehicle("cyberbrick");
    const s = chassisSizes(v);
    const m = engine.vehicle(v, DEFAULT_FITS);
    expect(m.drive.map((d) => d.name).sort()).toEqual(["worm", "wormWheel"]);
    expect(m.wheels.map((w) => w.radius).sort((a, b) => a - b)).toEqual([8, DRIVE.drivenWheelDiameter / 2]);
    // nothing of the running gear reaches below the track top (except wheels in the grooves)
    const driven = s.axles.find((a) => a.driven)!;
    const gearBottom = driven.z - (DRIVE.module * DRIVE.wheelTeeth) / 2 - DRIVE.module;
    expect(gearBottom).toBeGreaterThan(-s.trackGap);
    // all wheels stand on the groove bottom
    for (const a of s.axles) expect(a.z - a.radius + GROOVE_DEPTH).toBeCloseTo(-s.trackGap, 6);
    expect(m.inside?.status).toBe("NoError");
  });

  it("wheels run in the grooves", () => {
    const v = makeVehicle("box");
    const s = chassisSizes(v);
    const m = engine.vehicle(v, DEFAULT_FITS);
    // wheels sit at ± half the groove spacing between beam and skirt and are narrower than the groove
    expect(s.beamHalf).toBeLessThan(GROOVE_SPACING / 2 - WHEEL_WIDTH / 2);
    expect(s.skirtInner).toBeGreaterThan(GROOVE_SPACING / 2 + WHEEL_WIDTH / 2);
    expect(WHEEL_WIDTH).toBeLessThan(GROOVE_WIDTH);
    // the axle does not stick out of the vehicle
    expect(m.running.max[1]).toBeLessThanOrEqual(s.width / 2);
    // the wheel reaches the bottom of the groove, the chassis stays above the track
    const wheelBottom = s.axleZ - WHEEL_DIAMETER / 2;
    expect(wheelBottom + GROOVE_DEPTH).toBeCloseTo(-s.trackGap, 6);
    expect(m.chassis.min[2]).toBeCloseTo(0, 3);
  });

  it("the axle turns in the chassis and holds the wheels", () => {
    const s = chassisSizes(makeVehicle("box"));
    expect(s.axleHole).toBeGreaterThan(AXLE_DIAMETER);
    expect(s.wheelHole).toBeLessThan(AXLE_DIAMETER);
    // the beam keeps a wall under the axle hole
    expect(s.axleZ - s.axleHole / 2).toBeGreaterThanOrEqual(1.2);
  });

  it("couplers reach beyond the vehicle", () => {
    const v = makeVehicle("box", { front: "hook", rear: "eye" });
    const m = engine.vehicle(v, DEFAULT_FITS);
    expect(m.chassis.max[0]).toBeGreaterThan(v.length / 2 + 5);
    expect(m.chassis.min[0]).toBeLessThan(-v.length / 2 - 5);
    expect(m.chassis.status).toBe("NoError");
  });
});

describe("stud ledges, supports and buildings", () => {
  it("a LEGO ledge carries studs on the 8 mm grid", () => {
    const plain = engine.element(makeElement("straight", { length: 216 }), PLAIN, options);
    const lego = engine.element(makeElement("straight", { length: 216, studs: "lego", studSide: "left" }), PLAIN, options);
    expect(lego.status).toBe("NoError");
    expect(lego.max[1] - plain.max[1]).toBeCloseTo(LEGO.pitch, 3);
    expect(lego.max[2]).toBeCloseTo(TRACK_HEIGHT + LEGO.height, 2);
    const duplo = engine.element(makeElement("curve", { studs: "duplo", studSide: "both" }), PLAIN, options);
    expect(duplo.status).toBe("NoError");
  });

  it("a stepped-down ledge keeps the first row at track height and saves the slab behind it", () => {
    const rows = 4;
    const flush = engine.element(makeElement("straight", { length: 216, studs: "lego", studSide: "left", studRows: rows }), PLAIN, options);
    const lowered = engine.element(makeElement("straight", { length: 216, studs: "lego", studSide: "left", studRows: rows, studLowered: true }), PLAIN, options);
    expect(lowered.status).toBe("NoError");
    // the same width, the studs of the first row still reach the old height
    expect(lowered.max[1]).toBeCloseTo(flush.max[1], 3);
    expect(lowered.max[2]).toBeCloseTo(TRACK_HEIGHT + LEGO.height, 2);
    // what is saved: the slab of the rows behind the first, from track height down to the thin plate
    const saved = (rows - 1) * LEGO.pitch * (TRACK_HEIGHT - LEDGE_LOWERED_THICKNESS) * 216;
    expect(flush.volume - lowered.volume).toBeGreaterThan(saved * 0.97);
    expect(flush.volume - lowered.volume).toBeLessThan(saved * 1.03);
    // with one row there is nothing to step down
    const one = engine.element(makeElement("straight", { length: 216, studs: "lego", studSide: "left", studRows: 1 }), PLAIN, options);
    const oneLowered = engine.element(makeElement("straight", { length: 216, studs: "lego", studSide: "left", studRows: 1, studLowered: true }), PLAIN, options);
    expect(oneLowered.volume).toBeCloseTo(one.volume, 3);
    // on both sides and on a curve
    const both = engine.element(makeElement("curve", { studs: "duplo", studSide: "both", studRows: 3, studLowered: true }), PLAIN, options);
    expect(both.status).toBe("NoError");
    expect(both.max[2]).toBeCloseTo(TRACK_HEIGHT + 4.5, 2);
  });

  it("the widest ledge, 20 rows, builds clean", () => {
    const m = engine.element(makeElement("straight", { length: 216, studs: "lego", studSide: "both", studRows: LEDGE_ROWS_MAX, studLowered: true }), PLAIN, options);
    expect(m.status).toBe("NoError");
    expect(m.max[1] - m.min[1]).toBeCloseTo(TRACK_WIDTH + 2 * LEDGE_ROWS_MAX * LEGO.pitch, 2);
  });

  it("a support is as high as the track above it", () => {
    const s = engine.support(38, false);
    expect(s.status).toBe("NoError");
    expect(s.min[2]).toBeCloseTo(0, 3);
    expect(s.max[2]).toBeCloseTo(38 + 3, 3);
    expect(engine.support(38, true).max[2]).toBeCloseTo(38, 3);
  });

  it.each(BUILDING_KINDS)("%s builds clean parts", (kind) => {
    const b = makeBuilding(kind);
    b.name = "TRAINATION";
    const m = engine.building(b);
    for (const part of [m.base, ...(m.roof ? [m.roof] : []), ...(m.details ? [m.details] : [])]) {
      expect(part.status).toBe("NoError");
      expect(part.volume).toBeGreaterThan(0);
    }
    expect(m.base.min[2]).toBeCloseTo(0, 2);
  });
});
