// Fits, minimum sizes and printer data. Fits are allowances on the whole size (diameter, width),
// not per side: a peg head of 11.5 mm with a fit of 0.4 gets a socket of 11.9 mm.
//
// PROVISIONAL: confirm every start value with a test print.

/** Socket = peg + this (head diameter and neck width). */
export const DEFAULT_CONNECTOR_FIT = 0.4;
/** Axle hole in the chassis = axle + this, so that the axle turns freely. */
export const DEFAULT_AXLE_FIT = 0.5;
/** Wheel hole = axle − this: the wheel is pressed onto the axle. */
export const DEFAULT_WHEEL_PRESS = 0.15;
/** Magnet pocket = magnet + this (diameter and depth). */
export const DEFAULT_MAGNET_FIT = 0.1;

/** Smallest wall the printer makes reliably. */
export const MIN_WALL = 1.2;
/** Gap between a wheel and the chassis beam. */
export const WHEEL_SIDE_GAP = 0.5;
/** Room between the bottom of the chassis and the top of the track. */
export const TRACK_CLEARANCE = 1.5;
/** Room between the top of a wheel and the deck above it. */
export const WHEEL_TOP_GAP = 1;
/** Parts on one print bed keep this distance (and from the bed edge). */
export const BED_SPACING = 6;

/** Printers we know, with their usable bed. */
export interface PrinterProfile {
  id: string;
  /** Bambu Studio printer preset */
  preset: string;
  label: string;
  bed: [number, number];
  height: number;
}

export const PRINTERS: readonly PrinterProfile[] = [
  { id: "p1s", preset: "Bambu Lab P1S 0.4 nozzle", label: "Bambu Lab P1S / X1C", bed: [256, 256], height: 250 },
  { id: "a1", preset: "Bambu Lab A1 0.4 nozzle", label: "Bambu Lab A1", bed: [256, 256], height: 256 },
  { id: "a1mini", preset: "Bambu Lab A1 mini 0.4 nozzle", label: "Bambu Lab A1 mini", bed: [180, 180], height: 180 },
];

export const DEFAULT_PRINTER = "p1s";

export function printerById(id: string): PrinterProfile {
  return PRINTERS.find((p) => p.id === id) ?? (PRINTERS[0] as PrinterProfile);
}
