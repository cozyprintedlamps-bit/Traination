// Bambu Lab CyberBrick electronics for a driven locomotive. Sizes from the official datasheets
// (Accessories Specification; "030 Micro DC Motor LA024"), read on 13.11.2026.
//
// PROVISIONAL where marked: the datasheets give no hole positions and no battery size. Measure
// the parts and correct these values before the first test print.

/** Receiver shield XA004: 29 × 30 mm, four mounting holes in the corners (positions measured from photos: provisional). */
export const SHIELD = { length: 30, width: 29, holeInset: 3, holeDiameter: 2.2, standoff: 3, height: 16 } as const;
/** Multi-function core XA003, 22 × 27 mm, plugs onto the shield (in the shield's height). */
export const CORE = { length: 27, width: 22 } as const;
/** 2S Li-ion pack 7.4 V, two cells side by side (provisional size). */
export const BATTERY = { length: 53, width: 29, height: 15 } as const;
/** Power switch module XA007, 32 × 20.5 mm; the slide sticks out through the body wall. */
export const SWITCH = { length: 32, width: 20.5, slotLength: 10, slotHeight: 5 } as const;
/** "030" micro DC motor: round body with two flats, shaft Ø 1.5 × 8.2, bearing boss Ø 4.7 × 1.5. */
export const MOTOR = { diameter: 15.5, flats: 12, length: 18.6, shaft: 1.5, shaftLength: 8.2, boss: 4.7, bossLength: 1.5 } as const;

/** Drive: a printed worm on the motor shaft turns a printed worm wheel on the drive axle. */
export const DRIVE = {
  /** gear module (mm) */
  module: 1,
  /** teeth of the worm wheel; a single-start worm gives this ratio (15:1) */
  wheelTeeth: 15,
  /** worm: pitch diameter (outer = pitch + 2 × module) and length */
  wormPitchDiameter: 6,
  wormLength: 7,
  /** the worm bore grips the motor shaft */
  wormBorePress: 0.1,
  /** worm wheel width */
  wheelWidth: 5,
  /** the driven wheels are larger, so that the worm wheel stays above the track */
  drivenWheelDiameter: 26,
  /** play between the gear teeth (whole tooth thickness) */
  backlash: 0.15,
} as const;

/** What a builder has to buy (shown in the parts list). */
export const SHOPPING_LIST = ["core", "shield", "motor", "battery", "switch"] as const;
