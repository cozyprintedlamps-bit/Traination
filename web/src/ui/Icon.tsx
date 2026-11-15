// Small line icons for the kinds of pieces and the toolbar (inline SVG, currentColor).
import type { BuildingKind } from "../core/buildings";
import type { ElementKind } from "../core/track";
import type { VehicleKind } from "../core/vehicle";

export function KindIcon({ kind }: { kind: ElementKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const };
  const paths: Record<ElementKind, string[]> = {
    straight: ["M4 16 H28"],
    curve: ["M4 26 Q16 26 26 6"],
    switch: ["M4 22 H28", "M4 22 Q18 22 26 6"],
    yswitch: ["M4 16 Q14 16 26 4", "M4 16 Q14 16 26 28"],
    crossing: ["M4 16 H28", "M16 4 V28"],
    ramp: ["M4 26 Q16 26 28 8"],
    bridge: ["M4 10 H28", "M8 10 V28", "M24 10 V28"],
    buffer: ["M4 16 H22", "M24 8 V24"],
    adapter: ["M10 16 H22", "M6 16 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", "M26 16 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0"],
  };
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
      {paths[kind].map((d) => (
        <path key={d} d={d} {...common} />
      ))}
    </svg>
  );
}

export function BuildingIcon({ kind }: { kind: BuildingKind }) {
  const d: Record<BuildingKind, string[]> = {
    station: ["M3 26 H29", "M6 26 V14 L16 6 L26 14 V26", "M13 26 V19 H19 V26"],
    platform: ["M3 22 H29", "M5 22 L7 17 H25 L27 22"],
    house: ["M6 27 V15 L16 6 L26 15 V27 Z", "M14 27 V20 H18 V27"],
    signalbox: ["M8 27 V12 H24 V27", "M6 12 L16 5 L26 12", "M10 15 H22 V19 H10 Z"],
    watertower: ["M9 8 H23 V17 H9 Z", "M8 8 L16 3 L24 8", "M11 17 L9 28", "M21 17 L23 28"],
    shed: ["M4 27 V13 L16 5 L28 13 V27", "M10 27 V16 H22 V27"],
    signal: ["M16 28 V10", "M12 28 H20", "M13 4 H19 V12 H13 Z"],
  };
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d[kind].map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}

/** A small side view of a vehicle kind, drawn in its body colour. */
export function VehicleIcon({ kind, color }: { kind: VehicleKind; color: string }) {
  const shapes: Record<string, string> = {
    steam: "M3 20 V10 H10 V15 H24 A4 4 0 0 1 28 19 V20 Z M20 15 V10 H23 V15",
    diesel: "M3 20 V13 H20 V8 H29 V20 Z",
    electric: "M3 20 V10 Q16 6 29 10 V20 Z",
    highspeed: "M3 20 V10 H20 Q28 11 30 20 Z",
    box: "M3 20 V8 H29 V20 Z",
    tank: "M5 20 V18 A8 6 0 0 1 5 8 H27 A8 6 0 0 1 27 18 V20 Z",
    flat: "M3 20 V17 H29 V20 Z M7 17 V11 H15 V17 M17 17 V12 H25 V17",
    hopper: "M3 8 H29 L23 20 H9 Z",
    passenger: "M3 20 V9 Q16 6 29 9 V20 Z",
    tender: "M5 20 V11 H27 V20 Z",
    crane: "M3 20 V17 H29 V20 Z M8 17 V12 H14 V17 M12 13 L24 4",
  };
  const map: Record<VehicleKind, string> = {
    steam: "steam",
    tankloco: "steam",
    diesel: "diesel",
    shunter: "diesel",
    electric: "electric",
    highspeed: "highspeed",
    cyberbrick: "electric",
    box: "box",
    reefer: "box",
    mail: "box",
    caboose: "box",
    tank: "tank",
    flat: "flat",
    logs: "flat",
    container: "flat",
    hopper: "hopper",
    passenger: "passenger",
    doubledeck: "passenger",
    dining: "passenger",
    tender: "tender",
    crane: "crane",
  };
  return (
    <svg viewBox="0 0 32 26" width="34" height="28" aria-hidden="true">
      <path d={shapes[map[kind]]} fill={color} stroke="rgba(0,0,0,.45)" strokeWidth="1" strokeLinejoin="round" />
      <rect x="4" y="20" width="24" height="2.5" fill="#555" />
      <circle cx="9" cy="23.5" r="2.4" fill="#333" />
      <circle cx="23" cy="23.5" r="2.4" fill="#333" />
      {kind === "cyberbrick" && <path d="M15 9 L12 15 H16 L14 20" fill="none" stroke="#FFD43B" strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  );
}

export type IconName = "new" | "open" | "save" | "undo" | "redo" | "theme" | "fit" | "trash" | "chevron";

export function Icon({ name }: { name: IconName }) {
  const d: Record<IconName, string> = {
    new: "M7 3h7l5 5v13H7z M14 3v5h5",
    open: "M3 7h6l2 2h10v10H3z",
    save: "M5 3h11l3 3v15H5z M8 3v6h8V3 M8 14h8",
    undo: "M9 7L4 12l5 5 M4 12h11a5 5 0 0 1 0 10h-3",
    redo: "M15 7l5 5-5 5 M20 12H9a5 5 0 0 0 0 10h3",
    theme: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z",
    fit: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
    trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
    chevron: "M6 9l6 6 6-6",
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d[name]} />
    </svg>
  );
}
