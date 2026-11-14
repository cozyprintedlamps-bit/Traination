// The CyberBrick locomotive: a driven chassis and a hollow body for the Bambu Lab CyberBrick
// electronics (core board on the receiver shield, 030 motor, 2S battery, power switch).
//
// Drive: the motor lies along X above the front axle; a printed worm on its shaft turns a printed
// helical worm wheel on the driven axle (15:1). The driven wheels are larger (Ø 26), so that the
// worm wheel stays above the track. Sizes: presets/cyberbrick.ts (partly provisional).
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { chassisSizes } from "../core/vehicle";
import type { ChassisSizes, Fits, Vehicle } from "../core/vehicle";
import { BATTERY, CORE, DRIVE, MOTOR, SHIELD, SWITCH } from "../presets/cyberbrick";
import { AXLE_DIAMETER } from "../presets/vehicle";
import { worm as makeWorm, wormWheel } from "./gears";
import { axleSection, box, cylinderX, roundedBlock } from "./vehicle";
import type { BodyShape, Section } from "./vehicle";

const WALL = 1.6;
const HALF = 16;
const MOTOR_GAP = 0.2;

/** Where the drive parts sit, in the chassis frame. */
export function driveLayout(v: Vehicle, s: ChassisSizes) {
  const driven = s.axles.find((a) => a.driven) ?? (s.axles[0] as ChassisSizes["axles"][number]);
  const wheelR = (DRIVE.module * DRIVE.wheelTeeth) / 2;
  const wormZ = driven.z + wheelR + DRIVE.wormPitchDiameter / 2;
  const wormX0 = driven.x - DRIVE.wormLength / 2;
  const motorFront = wormX0 - MOTOR.bossLength - 0.5;
  const motorBack = motorFront - MOTOR.length;
  const batteryX0 = -v.length / 2 + 4;
  const batteryX1 = batteryX0 + BATTERY.length;
  const shieldX = (batteryX1 + motorBack) / 2;
  return { driven, wheelR, wormZ, wormX0, motorFront, motorBack, batteryX0, batteryX1, shieldX };
}

/** Cuts the motor pocket and the gear slot into the chassis, adds the battery rails and the shield posts. */
export function cyberbrickChassis(wasm: ManifoldToplevel, v: Vehicle, s: ChassisSizes, chassis: Manifold): Manifold {
  const { Manifold } = wasm;
  const d = driveLayout(v, s);
  const tip = d.wheelR + DRIVE.module + 0.8;
  const slotHalf = Math.max(DRIVE.wheelWidth / 2, DRIVE.wormPitchDiameter / 2 + DRIVE.module) + 0.6;
  const cuts = [
    // the motor lies in a pocket, its flats against the walls
    box(wasm, [d.motorBack - 0.4, d.motorFront + 0.3, -(MOTOR.flats / 2 + 0.15), MOTOR.flats / 2 + 0.15, d.wormZ - MOTOR.diameter / 2 - MOTOR_GAP, s.deckTop + 1]),
    // worm wheel and worm turn in a slot through beam and deck
    box(wasm, [d.driven.x - tip, d.driven.x + tip, -slotHalf, slotHalf, -1, s.deckTop + 1]),
  ];
  let out = chassis.subtract(Manifold.union(cuts));
  // rails that keep the battery in place, and four posts for the shield
  const railY = BATTERY.width / 2 + 0.3;
  const rails = [railY, -railY - WALL].map((y) => box(wasm, [d.batteryX0, d.batteryX1 + 1, y, y + WALL, s.deckTop, s.deckTop + 5]));
  const hx = SHIELD.length / 2 - SHIELD.holeInset;
  const hy = SHIELD.width / 2 - SHIELD.holeInset;
  const posts = [
    [hx, hy],
    [hx, -hy],
    [-hx, hy],
    [-hx, -hy],
  ].map(([x, y]) =>
    Manifold.cylinder(SHIELD.standoff, 2.5, 2.5, 24)
      .subtract(Manifold.cylinder(SHIELD.standoff + 2, SHIELD.holeDiameter / 2, SHIELD.holeDiameter / 2, 16).translate([0, 0, -1]))
      .translate([d.shieldX + (x as number), y as number, s.deckTop]),
  );
  out = out.add(Manifold.union([...rails, ...posts]));
  return out;
}

/** The hollow body: walls, roof, bosses for the chassis pins, openings for switch and USB. */
export function cyberbrickBody(wasm: ManifoldToplevel, v: Vehicle, H: number): BodyShape {
  const { Manifold } = wasm;
  const L = v.length - 2;
  const x0 = -L / 2;
  const x1 = L / 2;
  const style = v.design.roof;
  const drop = style === "round" ? 4 : style === "peaked" ? 8 : 0;
  const shape = (inset: number) => {
    const half = HALF - inset;
    const top = H - inset;
    let full = box(wasm, [x0 + inset, x1 - inset, -half, half, inset > 0 ? -1 : 0, top]);
    if (style === "round") {
      const r = (half * half) / (2 * drop) + drop / 2;
      full = full.intersect(cylinderX(wasm, r, x0 - 1, x1 + 1, 0, top - r));
    } else if (style === "peaked") {
      full = full.intersect(
        wasm.CrossSection.ofPolygons([
          [
            [-half - 1, -2],
            [half + 1, -2],
            [half + 1, top - drop],
            [0, top],
            [-half - 1, top - drop],
          ],
        ])
          .extrude(L + 2)
          .rotate([90, 0, 90])
          .translate([x0 - 1, 0, 0]),
      );
    }
    return full;
  };
  const outer = shape(0);
  // inside, the ceiling rises at 45° from the walls to a ridge: the body prints upright without
  // support (the electronics stay below the slopes: they are at most 19 mm high)
  const hi = HALF - WALL;
  const apex = H - WALL - 0.5;
  const pointedInside = wasm.CrossSection.ofPolygons([
    [
      [-hi - 1, -2],
      [hi + 1, -2],
      [hi + 1, apex - hi - 1],
      [0, apex],
      [-hi - 1, apex - hi - 1],
    ],
  ])
    .extrude(L + 2)
    .rotate([90, 0, 90])
    .translate([x0 - 1, 0, 0]);
  let shell = outer.subtract(shape(WALL).intersect(pointedInside));
  // bosses that take the chassis pins
  for (const x of [v.length / 2 - 7, -v.length / 2 + 7]) shell = shell.add(Manifold.cylinder(7, 4.5, 4.5, 32).translate([x, 0, 0]).intersect(outer));
  // the switch slide through the left wall near the rear, the USB port of the core through the right wall
  const switchX = x0 + 14 + SWITCH.slotLength / 2;
  shell = shell.subtract(box(wasm, [switchX - SWITCH.slotLength / 2, switchX + SWITCH.slotLength / 2, -HALF - 1, -HALF + WALL + 1, 4, 4 + SWITCH.slotHeight]));
  const { shieldX } = driveLayout(v, chassisSizes(v));
  shell = shell.subtract(box(wasm, [shieldX - 7, shieldX + 7, HALF - WALL - 1, HALF + 1, SHIELD.standoff + 9, SHIELD.standoff + 16]));
  // cab windows at the front, a front window
  if (v.design.windows) {
    shell = shell.subtract(box(wasm, [x1 - 22, x1 - 8, -HALF - 1, -HALF + 1.2, H - 15, H - 7])).subtract(box(wasm, [x1 - 22, x1 - 8, HALF - 1.2, HALF + 1, H - 15, H - 7]));
    shell = shell.subtract(box(wasm, [x1 - 1.2, x1 + 1, -10, 10, H - 15, H - 7]));
  }
  // the roof: the top of the shell in its own colour (it stays one part with the shell)
  const roofZ = H - drop - 3;
  const roof: Section = { slot: "roof", solid: shell.intersect(box(wasm, [x0 - 1, x1 + 1, -HALF - 1, HALF + 1, roofZ, H + 1])) };
  return {
    body: shell,
    sections: [roof],
    band: { x0: x0 + 22, x1: x1 - 26, z0: 2, z1: Math.min(roofZ - 2, 13), half: HALF },
    face: { x: x1, z: (H - 16) / 2 + 1, r: Math.min((H - 16) / 2 - 1, 9) },
    lamps: { x: x1, spots: [[-9, 5], [9, 5]] },
  };
}

/** Worm, worm wheel (print orientation) and both in place; motor, battery and boards for the preview. */
export function cyberbrickDrive(wasm: ManifoldToplevel, v: Vehicle, s: ChassisSizes, fits: Fits) {
  const { Manifold } = wasm;
  const d = driveLayout(v, s);
  const wormSolid = makeWorm(wasm, DRIVE.module, DRIVE.wormPitchDiameter, DRIVE.wormLength, MOTOR.shaft - DRIVE.wormBorePress);
  const hole = axleSection(wasm, AXLE_DIAMETER - fits.wheelPress).extrude(DRIVE.wheelWidth + 2).translate([0, 0, -1]);
  const wheel = wormWheel(wasm, DRIVE.module, DRIVE.wheelTeeth, DRIVE.wheelWidth, DRIVE.wormPitchDiameter, DRIVE.backlash).subtract(hole);
  const wormInPlace = wormSolid.rotate([0, 90, 0]).translate([d.wormX0, 0, d.wormZ]);
  const wheelInPlace = wheel.translate([0, 0, -DRIVE.wheelWidth / 2]).rotate([90, 0, 0]).translate([d.driven.x, 0, d.driven.z]);
  // the electronics, only for the preview
  const motor = cylinderX(wasm, MOTOR.diameter / 2, d.motorBack, d.motorFront, 0, d.wormZ).intersect(box(wasm, [d.motorBack - 1, d.motorFront + 1, -MOTOR.flats / 2, MOTOR.flats / 2, 0, 100]));
  const shaft = cylinderX(wasm, MOTOR.shaft / 2, d.motorFront, d.motorFront + MOTOR.shaftLength, 0, d.wormZ);
  const battery = roundedBlock(wasm, BATTERY.length, BATTERY.width, 3, s.deckTop, s.deckTop + BATTERY.height, (d.batteryX0 + d.batteryX1) / 2, 0);
  const shieldZ = s.deckTop + SHIELD.standoff;
  const shield = box(wasm, [d.shieldX - SHIELD.length / 2, d.shieldX + SHIELD.length / 2, -SHIELD.width / 2, SHIELD.width / 2, shieldZ, shieldZ + 1.6]);
  const core = box(wasm, [d.shieldX - CORE.length / 2, d.shieldX + CORE.length / 2, -CORE.width / 2, CORE.width / 2, shieldZ + 9, shieldZ + 10.6]);
  const inside = Manifold.union([motor, shaft, battery, shield, core]);
  return { worm: wormSolid, wheel, wormInPlace, wheelInPlace, inside };
}
