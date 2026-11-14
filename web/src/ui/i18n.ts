// UI texts in German and English. No strings in the logic code: everything the user reads goes
// through tr(). The language is kept in the browser (try/catch: storage may be blocked).
import type { Building } from "../core/buildings";
import { hasLever, ledgeSides, takesStuds } from "../core/track";
import type { ElementType, Variant } from "../core/track";
import type { Vehicle } from "../core/vehicle";
import { CROSSING_LENGTH } from "../presets/gauge";
import { DE } from "./texts_de";
import type { TextKey } from "./texts_de";
import { EN } from "./texts_en";

export type Language = "de" | "en";
export const LANGUAGES: readonly Language[] = ["de", "en"];
const KEY = "traination.language";

let current: Language = "de";

export function readLanguage(): Language {
  try {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (fromUrl === "en" || fromUrl === "de") return fromUrl;
    const stored = localStorage.getItem(KEY);
    if (stored === "en" || stored === "de") return stored;
  } catch {
    // no storage: German
  }
  return "de";
}

export function setLanguage(language: Language): void {
  current = language;
  document.documentElement.lang = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    // not remembered
  }
}

export const language = (): Language => current;

export function formatNumber(value: number, digits = 1): string {
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return rounded.toLocaleString(current === "de" ? "de-DE" : "en-US", { maximumFractionDigits: digits });
}

export function tr(key: TextKey, vars: Record<string, string | number> = {}): string {
  const table = current === "en" ? EN : DE;
  const text: string = table[key] ?? DE[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : typeof v === "number" ? formatNumber(v) : v;
  });
}

/** The generated name of an element type (or the user's own). */
export function elementName(type: ElementType, variant?: Variant): string {
  const sides = ledgeSides(type);
  const kinds = new Set([sides.left.kind, sides.right.kind].filter((k) => k !== "none"));
  const studs =
    !takesStuds(type.kind) || kinds.size === 0
      ? ""
      : kinds.size > 1
        ? ` ${tr("name.studs_both")}`
        : ` ${tr("name.studs", { kind: tr(kinds.has("lego") ? "studs.lego" : "studs.duplo") })}`;
  const lever = hasLever(type) ? ` ${tr("name.lever")}` : "";
  const base = type.name.trim() || `${generatedName(type)}${studs}${lever}`;
  if (!variant) return base;
  const extra = [variant.mirror ? tr("variant.mirror") : "", variant.swap ? tr("variant.swap") : ""].filter(Boolean);
  return extra.length > 0 ? `${base} (${extra.join(", ")})` : base;
}

function generatedName(t: ElementType): string {
  switch (t.kind) {
    case "straight":
      return tr("name.straight", { length: t.length });
    case "curve":
      // fitting curves have odd angles: show two decimals so that they can be told apart
      return tr("name.curve", { radius: t.radius, angle: formatNumber(t.angle, 2) });
    case "switch":
      return tr("name.switch", { hand: tr(t.hand === "left" ? "hand.left" : "hand.right"), radius: t.radius });
    case "yswitch":
      return tr("name.yswitch", { radius: t.radius });
    case "crossing":
      return t.length === CROSSING_LENGTH ? tr("name.crossing", { angle: t.crossAngle }) : tr("name.crossing_long", { angle: t.crossAngle, length: t.length });
    case "ramp":
      return tr("name.ramp", { from: t.height, to: t.height + t.rise });
    case "bridge":
      return tr("name.bridge", { height: t.height });
    case "buffer":
      return tr("name.buffer");
    case "adapter":
      return tr(t.adapter === "male" ? "name.adapter.male" : "name.adapter.female");
  }
}

export function vehicleName(v: Vehicle, index?: number): string {
  if (v.name.trim()) return v.name.trim();
  const kind = tr(`vkind.${v.kind}` as TextKey);
  return index === undefined ? kind : `${index + 1}. ${kind}`;
}

export function buildingName(b: Building, index?: number): string {
  const kind = tr(`bkind.${b.kind}` as TextKey);
  const own = b.name.trim();
  if (own) return `${kind} ${own}`;
  return index === undefined ? kind : `${index + 1}. ${kind}`;
}

export type { TextKey };
