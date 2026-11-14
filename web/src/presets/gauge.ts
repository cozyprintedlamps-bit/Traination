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
/** Fitting curves are never tighter than the small standard curve. */
export const MIN_FIT_RADIUS = 90;
export const MAX_FIT_RADIUS = 3000;
/** A fitting curve turns at most this much; longer arcs are split into equal pieces. */
export const MAX_FIT_ANGLE = 90;

/** Short connector pieces. */
export const ADAPTER_LENGTH = 30;
export const BUFFER_LENGTH = 54;
/** the standard crossing: two straights of this length crossing in the middle */
export const CROSSING_LENGTH = 144;
/** The block at the end of a buffer stop. */
export const BUFFER_BLOCK_LENGTH = 14;
export const BUFFER_BLOCK_HEIGHT = 30;

/**
 * Sleepers: between the grooves the track is open between sleepers, like real track. The openings
 * are rounded slots; next to each groove a wall of 2 mm stays.
 */
export const SLEEPER_PITCH = 18;
/** length of an opening along the track */
export const SLEEPER_GAP = 10;
/** width of an opening across the track */
export const SLEEPER_GAP_WIDTH = GROOVE_SPACING - GROOVE_WIDTH - 2 * 2;
export const SLEEPER_GAP_ROUND = 2;
/** no opening closer than this to a female end (the socket) or a male end */
export const SLEEPER_KEEP_FEMALE = 22;
export const SLEEPER_KEEP_MALE = 6;

/**
 * Arches open up the walls of ramps, the pillars of bridges and tall supports (viaduct look). The
 * top of an arch ends in a 45° point, so that it prints without support material.
 */
export const ARCH_PIER = 5;
/** solid strip on the bed below an opening */
export const ARCH_FOOT = 3;
/** solid strip between the top of an opening and the track */
export const ARCH_CROWN = 4;
/** openings lower than this are left out */
export const ARCH_MIN_HEIGHT = 12;

/**
 * Switches with a lever: a slider lies in the track. Its blade fills the part of the widened groove
 * at the switch point that only the other route uses; pushing or pulling the knob moves it across
 * by one groove width. The slider is a separate print part (printed upside down).
 */
/** clearance around blade, post and arm (whole size) */
export const LEVER_FIT = 0.4;
/** width of the arm and the post along the track */
export const LEVER_ARM_WIDTH = 4;
/** the post sits where the two grooves have moved this far apart */
export const LEVER_POST_SPREAD = 4.6;
/** the blade starts where it is this wide (its thin front edge would break) */
export const LEVER_BLADE_MIN = 0.8;
/** the arm passes this far below the floor of an open groove */
export const LEVER_LOW_CLEAR = 0.6;
/** the knob outside the track: along the track, outward, and its gap to the track in the inner position */
export const LEVER_KNOB_LENGTH = 12;
export const LEVER_KNOB_DEPTH = 8;
export const LEVER_KNOB_GAP = 0.8;
/** the slider stays this much below the top of the track */
export const LEVER_TOP_GAP = 0.2;
