// Vehicle standard sizes. Wheels run in the grooves of the track, so the wheel spacing is the groove
// spacing and a wheel is narrower than a groove.
import { GROOVE_SPACING, GROOVE_WIDTH } from "./gauge";

export const WHEEL_DIAMETER = 16;
/** narrower than the groove (6 mm), so that the wheel runs freely in it */
export const WHEEL_WIDTH = 4.5;
/** centre to centre of the two wheels of an axle */
export const WHEEL_SPACING = GROOVE_SPACING;
export const AXLE_DIAMETER = 4;
/** the wheels sit flush with the axle ends */
export const AXLE_LENGTH = WHEEL_SPACING + WHEEL_WIDTH;

/** Width of the deck (the vehicle above the wheels). */
export const VEHICLE_WIDTH = 34;
export const DECK_THICKNESS = 3.5;
export const VEHICLE_MIN_LENGTH = 50;
export const VEHICLE_MAX_LENGTH = 180;
/** axles sit this far from the vehicle ends at least */
export const AXLE_END_DISTANCE = 13;

/** Couplers: centre height above the bottom of the chassis, how far they reach beyond the vehicle end. */
export const COUPLER_HEIGHT = 7;
export const COUPLER_REACH = 12;
export const COUPLER_ARM_WIDTH = 7;
export const COUPLER_ARM_THICKNESS = 3;
/** hook coupler: the pin of the hook end, the eye of the other end drops over it */
export const HOOK_PIN_DIAMETER = 4;
export const HOOK_PIN_HEIGHT = 5;
export const HOOK_EYE_FIT = 1;

export interface MagnetSize {
  diameter: number;
  height: number;
}

/** Round magnets that fit the coupler head. */
export const MAGNET_CATALOG: readonly MagnetSize[] = [
  { diameter: 6, height: 2 },
  { diameter: 6, height: 3 },
  { diameter: 8, height: 2 },
  { diameter: 8, height: 3 },
  { diameter: 10, height: 2 },
  { diameter: 10, height: 3 },
];

export const DEFAULT_MAGNET: MagnetSize = { diameter: 8, height: 3 };

// sanity of the standard, checked once at load time
if (WHEEL_WIDTH >= GROOVE_WIDTH) throw new Error("wheels must be narrower than the grooves");
