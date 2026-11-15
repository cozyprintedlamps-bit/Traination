// Stud grids of the common building bricks, for the stud ledge beside the track (LEGO®- and
// DUPLO®-compatible; the names describe compatibility only, no trademark is used as a name).
//
// PROVISIONAL: values from public descriptions of the systems, confirm the clutch with a test
// print (printed studs are often a little smaller than moulded ones; see STUD_FIT).

export interface StudSystem {
  /** distance between stud centres */
  pitch: number;
  diameter: number;
  height: number;
  /** studs are hollow with this inner diameter (0 = solid) */
  hollow: number;
}

export const LEGO: StudSystem = { pitch: 8, diameter: 4.8, height: 1.7, hollow: 0 };
export const DUPLO: StudSystem = { pitch: 16, diameter: 9.4, height: 4.5, hollow: 6.6 };

/** Printed studs come out a bit thin: they are made this much larger (whole diameter). */
export const STUD_FIT = 0.05;
/** The ledge keeps this much plain edge around the studs. */
export const LEDGE_MARGIN = 0.4;
/** Rows of studs on a ledge (up to this many). */
export const LEDGE_ROWS_MAX = 20;
/**
 * A stepped-down ledge: the first row beside the track stays as high as the track, the rows behind
 * it stand on a plate of this thickness (mm). That saves a lot of filament on wide ledges.
 */
export const LEDGE_LOWERED_THICKNESS = 3;

export type StudKind = "none" | "lego" | "duplo";
export const STUD_KINDS: readonly StudKind[] = ["none", "lego", "duplo"];

export function studSystem(kind: StudKind): StudSystem | undefined {
  return kind === "lego" ? LEGO : kind === "duplo" ? DUPLO : undefined;
}

/** Width of a ledge with `rows` rows of studs. */
export function ledgeWidth(kind: StudKind, rows: number): number {
  const s = studSystem(kind);
  return s ? s.pitch * rows : 0;
}
