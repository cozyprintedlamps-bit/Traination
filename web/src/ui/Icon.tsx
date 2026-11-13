// Small line icons for the kinds of pieces and the toolbar (inline SVG, currentColor).
import type { ElementKind } from "../core/track";

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

export type IconName = "new" | "open" | "save" | "undo" | "redo" | "theme" | "fit";

export function Icon({ name }: { name: IconName }) {
  const d: Record<IconName, string> = {
    new: "M7 3h7l5 5v13H7z M14 3v5h5",
    open: "M3 7h6l2 2h10v10H3z",
    save: "M5 3h11l3 3v15H5z M8 3v6h8V3 M8 14h8",
    undo: "M9 7L4 12l5 5 M4 12h11a5 5 0 0 1 0 10h-3",
    redo: "M15 7l5 5-5 5 M20 12H9a5 5 0 0 0 0 10h3",
    theme: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z",
    fit: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
  };
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d[name]} />
    </svg>
  );
}
