// Stud grids of the common building bricks, for the stud ledge beside the track and stud plates
// (LEGO®- and DUPLO®-compatible; the names describe compatibility only, no trademark is used as a
// name).
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
  /** thickness of a plain plate of the system (stud plates) */
  plate: number;
}

export const LEGO: StudSystem = { pitch: 8, diameter: 4.8, height: 1.7, hollow: 0, plate: 3.2 };
export const DUPLO: StudSystem = { pitch: 16, diameter: 9.4, height: 4.5, hollow: 6.6, plate: 4.8 };

/** Printed studs come out a bit thin: they are made this much larger (whole diameter). */
export const STUD_FIT = 0.05;
/** The ledge keeps this much plain edge around the studs. */
export const LEDGE_MARGIN = 0.4;

export type StudKind = "none" | "lego" | "duplo";
export const STUD_KINDS: readonly StudKind[] = ["none", "lego", "duplo"];

/**
 * Rows of studs on one ledge: as many as the user wants, up to about 96 mm of ledge on each side
 * (track and both ledges then still fit a 256 mm bed; the elements page warns for smaller beds).
 */
export const LEDGE_ROWS_MAX: Readonly<Record<Exclude<StudKind, "none">, number>> = { lego: 12, duplo: 6 };

export function studSystem(kind: StudKind): StudSystem | undefined {
  return kind === "lego" ? LEGO : kind === "duplo" ? DUPLO : undefined;
}

/** Width of a ledge with `rows` rows of studs. */
export function ledgeWidth(kind: StudKind, rows: number): number {
  const s = studSystem(kind);
  return s ? s.pitch * Math.max(1, Math.round(rows)) : 0;
}

/** The most rows a ledge of this kind may have. */
export const maxRows = (kind: StudKind): number => (kind === "none" ? 1 : LEDGE_ROWS_MAX[kind]);
