// The wooden-railway standard (Brio, IKEA Lillabo and compatible). All track and vehicle geometry
// derives from these constants, so that printed parts fit bought ones.
//
// PROVISIONAL: values from public descriptions of the standard, not yet measured. Measure real
// Brio and IKEA track with calipers and update them here (see CLAUDE.md, "Spurweite").

/** Track cross-section. */
export const TRACK_WIDTH = 40;
export const TRACK_HEIGHT = 12;
export const GROOVE_WIDTH = 6;
export const GROOVE_DEPTH = 3;
/** distance between the centres of the two grooves */
export const GROOVE_SPACING = 25;
/** small chamfer on the outer top and bottom edges of the track */
export const TRACK_EDGE_CHAMFER = 0.8;

/** The connector peg (male) seen from above: a neck and a round head. */
export const PEG_NECK_WIDTH = 6.5;
export const PEG_HEAD_DIAMETER = 11.5;
/** from the track end to the far side of the head */
export const PEG_REACH = 17;
/** the peg is a bit lower than the track, so that it does not stick up */
export const PEG_HEIGHT = 10.5;

/** Standard pieces (centre-line lengths and radii). */
export const STRAIGHT_LENGTHS = [216, 144, 108, 54] as const;
export const CURVE_LARGE_RADIUS = 182;
export const CURVE_SMALL_RADIUS = 90;
/** eight standard curves make a full circle */
export const CURVE_ANGLE = 45;

/** Ramps and bridges. */
export const RAMP_LENGTH = 216;
/** two ramps climb to the bridge height */
export const RAMP_RISE = 38;
/** height of the track bottom on a bridge; a train on the track below must pass */
export const BRIDGE_HEIGHT = 2 * RAMP_RISE;
export const BRIDGE_PILLAR_LENGTH = 16;
/** slab under the track of a bridge */
export const BRIDGE_DECK = 4;
/** ramps are hollow: side walls and cross ribs carry the track */
export const RAMP_WALL = 3;
export const RAMP_RIB_SPACING = 36;

/** Supports (pillars) under raised track: footprint along the track, foot, side lips that hold the track. */
export const SUPPORT_LENGTH = 16;
export const SUPPORT_FOOT = 3;
export const SUPPORT_FOOT_GROW = 8;
export const SUPPORT_LIP = 3;
export const SUPPORT_LIP_THICKNESS = 2.4;
/** room between the lips and the track (whole width) */
export const SUPPORT_FIT = 0.6;
/** a raised piece longer than this gets a support in its middle as well */
export const SUPPORT_SPAN = 150;

/** "Close the loop": pieces shorter than this cannot be printed as a fitting straight. */
export const MIN_FILL_LENGTH = 20;

/** Short connector pieces. */
export const ADAPTER_LENGTH = 30;
export const BUFFER_LENGTH = 54;
