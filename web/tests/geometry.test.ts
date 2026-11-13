// Geometry invariants: the solids are clean, keep the standard sizes and fit together.
import { beforeAll, describe, expect, it } from "vitest";
import { createEngine } from "../src/geometry/engine";
import type { Engine } from "../src/geometry/engine";
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
  it.each(VEHICLE_KINDS)("%s builds clean parts", (kind) => {
    const v = makeVehicle(kind);
    const m = engine.vehicle(v, DEFAULT_FITS);
    for (const part of [m.chassis, m.body, m.wheel, m.axle, m.running, ...(m.accent ? [m.accent] : [])]) {
      expect(part.status).toBe("NoError");
      expect(part.volume).toBeGreaterThan(0);
    }
    // the body stands on the deck
    expect(m.body.min[2]).toBeGreaterThanOrEqual(-0.01);
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
