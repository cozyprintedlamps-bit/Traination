// Which Bambu Studio system profiles the exported project names: the standard process of the
// printer and, per filament slot, the profile of the chosen Bambu Lab filament. With these names
// Bambu Studio selects its own profiles; without them it makes profiles named after the file (the
// slot then shows "(slider.3mf)" as its material). A colour that is no Bambu Lab filament (an own
// colour) gets the printer's "Generic PLA" instead, so that no slot is left without a name.
//
// The names are those of Bambu Studio's profile library (resources/profiles/BBL, checked with
// Bambu Studio 02.04.00.70): the P1S lists "0.20mm Standard @BBL X1C" as default_print_profile and
// "Bambu PLA Basic @BBL P1S 0.4 nozzle" as default_filament_profile; PLA Matte has the same suffix.
// filament_id comes from the "@base" profiles (GFA00 PLA Basic, GFA01 PLA Matte, GFL99 Generic PLA).
import { bambuColor } from "../core/bambuColors";
import type { BambuColor } from "../core/bambuColors";
import { DEFAULT_PRESETS } from "./bambu3mf";
import type { FilamentPreset } from "./bambu3mf";

interface PrinterProfiles {
  /** the printer's default process */
  process: string;
  /** appended to "Bambu PLA Basic" / "Bambu PLA Matte" */
  filamentSuffix: string;
  /** the filament profile for a colour that is no Bambu Lab filament (made for this printer; no suffix for the P1S) */
  generic: string;
}

export const PRINTER_PROFILES: Readonly<Record<string, PrinterProfiles>> = {
  "Bambu Lab P1S 0.4 nozzle": { process: "0.20mm Standard @BBL X1C", filamentSuffix: "@BBL P1S 0.4 nozzle", generic: "Generic PLA" },
  // A1 and A1 mini: names from the Bambu Studio profile library, not yet checked with a loaded project
  "Bambu Lab A1 0.4 nozzle": { process: "0.20mm Standard @BBL A1", filamentSuffix: "@BBL A1", generic: "Generic PLA @BBL A1" },
  "Bambu Lab A1 mini 0.4 nozzle": { process: "0.20mm Standard @BBL A1M", filamentSuffix: "@BBL A1M", generic: "Generic PLA @BBL A1M" },
};

export const FILAMENT_IDS: Readonly<Record<BambuColor["type"], string>> = { "PLA Basic": "GFA00", "PLA Matte": "GFA01" };
export const GENERIC_FILAMENT_ID = "GFL99";

/** The standard process of a printer, or "" for a printer we know no profiles of. */
export const processProfile = (printer: string = DEFAULT_PRESETS.printer): string => PRINTER_PROFILES[printer]?.process ?? "";

/**
 * The system filament profile for a colour: that of the Bambu Lab filament of this colour, or
 * "Generic PLA" for any other colour. Nothing for a printer we know no profiles of.
 */
export function filamentProfile(hex: string, printer: string = DEFAULT_PRESETS.printer): FilamentPreset | undefined {
  const color = bambuColor(hex);
  const profiles = PRINTER_PROFILES[printer];
  if (!profiles) return undefined;
  if (!color) return { settingsId: profiles.generic, filamentId: GENERIC_FILAMENT_ID, vendor: "Generic", type: "PLA" };
  return { settingsId: `Bambu ${color.type} ${profiles.filamentSuffix}`, filamentId: FILAMENT_IDS[color.type], vendor: "Bambu Lab", type: "PLA" };
}
