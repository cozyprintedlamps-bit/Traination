// Bambu Lab filament colours (PLA Basic, PLA Matte; single-colour spools). Hex codes and names as
// Bambu Studio lists them (resources/profiles/BBL/filament/filaments_color_codes.json, Bambu Studio
// 2.x), so the slicer matches the filament slots to the AMS spools. Generated once, edit by hand.

export interface BambuColor {
  /** Bambu colour code, unique */
  code: string;
  type: "PLA Basic" | "PLA Matte";
  /** "#RRGGBB" */
  hex: string;
  de: string;
  en: string;
}

export const BAMBU_COLORS: readonly BambuColor[] = [
  { code: "10300", type: "PLA Basic", hex: "#FF6A13", de: "Orange", en: "Orange" },
  { code: "10301", type: "PLA Basic", hex: "#FF9016", de: "Kürbis-Orange", en: "Pumpkin Orange" },
  { code: "10602", type: "PLA Basic", hex: "#5B6579", de: "Blau-Grau", en: "Blue Gray" },
  { code: "10604", type: "PLA Basic", hex: "#0056B8", de: "Kobaltblau", en: "Cobalt Blue" },
  { code: "10605", type: "PLA Basic", hex: "#00B1B7", de: "Türkis", en: "Turquoise" },
  { code: "10603", type: "PLA Basic", hex: "#0086D6", de: "Cyan", en: "Cyan" },
  { code: "10601", type: "PLA Basic", hex: "#0A2989", de: "Blau", en: "Blue" },
  { code: "10103", type: "PLA Basic", hex: "#8E9089", de: "Grau", en: "Gray" },
  { code: "10102", type: "PLA Basic", hex: "#A6A9AA", de: "Silber", en: "Silver" },
  { code: "10104", type: "PLA Basic", hex: "#D1D3D5", de: "Hellgrau", en: "Light Gray" },
  { code: "10105", type: "PLA Basic", hex: "#545454", de: "Dunkelgrau", en: "Dark Gray" },
  { code: "10502", type: "PLA Basic", hex: "#3F8E43", de: "Mistelzweig-Grün", en: "Mistletoe Green" },
  { code: "10503", type: "PLA Basic", hex: "#BECF00", de: "Hellgrün", en: "Bright Green" },
  { code: "10501", type: "PLA Basic", hex: "#00AE42", de: "Bambusgrün", en: "Bambu Green" },
  { code: "10101", type: "PLA Basic", hex: "#000000", de: "Schwarz", en: "Black" },
  { code: "10800", type: "PLA Basic", hex: "#9D432C", de: "Braun", en: "Brown" },
  { code: "10802", type: "PLA Basic", hex: "#6F5034", de: "Kakaobraun", en: "Cocoa Brown" },
  { code: "10201", type: "PLA Basic", hex: "#F7E6DE", de: "Beige", en: "Beige" },
  { code: "10203", type: "PLA Basic", hex: "#F55A74", de: "Pink", en: "Pink" },
  { code: "10701", type: "PLA Basic", hex: "#482960", de: "Indigo-Violett", en: "Indigo Purple" },
  { code: "10700", type: "PLA Basic", hex: "#5E43B7", de: "Lila", en: "Purple" },
  { code: "10202", type: "PLA Basic", hex: "#EC008C", de: "Magenta", en: "Magenta" },
  { code: "10200", type: "PLA Basic", hex: "#C12E1F", de: "Rot", en: "Red" },
  { code: "10205", type: "PLA Basic", hex: "#9D2235", de: "Kastanienrot", en: "Maroon Red" },
  { code: "10204", type: "PLA Basic", hex: "#F5547C", de: "Heißes Pink", en: "Hot Pink" },
  { code: "10100", type: "PLA Basic", hex: "#FFFFFF", de: "Jade-Weiß", en: "Jade White" },
  { code: "10400", type: "PLA Basic", hex: "#F4EE2A", de: "Gelb", en: "Yellow" },
  { code: "10402", type: "PLA Basic", hex: "#FEC600", de: "Sonnenblumen-Gelb", en: "Sunflower Yellow" },
  { code: "10801", type: "PLA Basic", hex: "#847D48", de: "Bronze", en: "Bronze" },
  { code: "10401", type: "PLA Basic", hex: "#E4BD68", de: "Gold", en: "Gold" },
  { code: "11300", type: "PLA Matte", hex: "#F99963", de: "Mandarine-Orange", en: "Mandarin Orange" },
  { code: "11603", type: "PLA Matte", hex: "#56B7E6", de: "Himmelblau", en: "Sky Blue" },
  { code: "11600", type: "PLA Matte", hex: "#0078BF", de: "Marineblau", en: "Marine Blue" },
  { code: "11601", type: "PLA Matte", hex: "#A3D8E1", de: "Eisblau", en: "Ice Blue" },
  { code: "11602", type: "PLA Matte", hex: "#042F56", de: "Dunkelblau", en: "Dark Blue" },
  { code: "11104", type: "PLA Matte", hex: "#757575", de: "Nardo-Grau", en: "Nardo Gray" },
  { code: "11102", type: "PLA Matte", hex: "#9B9EA0", de: "Aschgrau", en: "Ash Gray" },
  { code: "11502", type: "PLA Matte", hex: "#C2E189", de: "Apfelgrün", en: "Apple Green" },
  { code: "11500", type: "PLA Matte", hex: "#61C680", de: "Grasgrün", en: "Grass Green" },
  { code: "11501", type: "PLA Matte", hex: "#68724D", de: "Dunkelgrün", en: "Dark Green" },
  { code: "11101", type: "PLA Matte", hex: "#000000", de: "Kohlschwarz", en: "Charcoal" },
  { code: "11802", type: "PLA Matte", hex: "#4D3324", de: "Dunkel-Schokoladenbraun", en: "Dark Chocolate" },
  { code: "11800", type: "PLA Matte", hex: "#D3B7A7", de: "Milchkaffee-Braun", en: "Latte Brown" },
  { code: "11801", type: "PLA Matte", hex: "#7D6556", de: "Dunkelbraun", en: "Dark Brown" },
  { code: "11803", type: "PLA Matte", hex: "#AE835B", de: "Karamell", en: "Caramel" },
  { code: "11201", type: "PLA Matte", hex: "#E8AFCF", de: "Sakura-Pink", en: "Sakura Pink" },
  { code: "11700", type: "PLA Matte", hex: "#AE96D4", de: "Flieder-Violett", en: "Lilac Purple" },
  { code: "11200", type: "PLA Matte", hex: "#DE4343", de: "Scharlachrot", en: "Scarlet Red" },
  { code: "11203", type: "PLA Matte", hex: "#B15533", de: "Terrakotta", en: "Terracotta" },
  { code: "11204", type: "PLA Matte", hex: "#950051", de: "Pflaume", en: "Plum" },
  { code: "11202", type: "PLA Matte", hex: "#BB3D43", de: "Dunkelrot", en: "Dark Red" },
  { code: "11100", type: "PLA Matte", hex: "#FFFFFF", de: "Elfenbeinweiß", en: "Ivory White" },
  { code: "11103", type: "PLA Matte", hex: "#CBC6B8", de: "Knochenweiß", en: "Bone White" },
  { code: "11400", type: "PLA Matte", hex: "#F7D959", de: "Zitronengelb", en: "Lemon Yellow" },
  { code: "11401", type: "PLA Matte", hex: "#E8DBB7", de: "Wüstenbraun", en: "Desert Tan" },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The palette without duplicate hex codes (PLA Matte repeats black and white), Basic first. */
export const BAMBU_UNIQUE: readonly BambuColor[] = BAMBU_COLORS.filter(
  (c, i) => BAMBU_COLORS.findIndex((o) => o.hex === c.hex) === i,
);

export function bambuColor(hex: string): BambuColor | undefined {
  const key = hex.toUpperCase();
  return BAMBU_COLORS.find((c) => c.hex === key);
}

export const isBambuColor = (hex: string): boolean => bambuColor(hex) !== undefined;

// ------------------------------------------------------------------ colour distance (CIE Lab)
export type Lab = [number, number, number];

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB (0..255) to CIE L*a*b* (D65). */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = linear(r);
  const G = linear(g);
  const B = linear(b);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const y = f(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const z = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function hexToRgb(hex: string): [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`not a colour: ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const hexToLab = (hex: string): Lab => rgbToLab(...hexToRgb(hex));

const RAD = Math.PI / 180;

/**
 * Squared colour difference CIEDE2000. Plain Lab distance matches pure red with orange and strong
 * blue with purple; CIEDE2000 corrects chroma, hue and the blue region.
 */
export function labDistance2(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (x: number, y: number) => (x === 0 && y === 0 ? 0 : (Math.atan2(y, x) / RAD + 360) % 360);
  const h1p = hue(a1p, b1);
  const h2p = hue(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else hpm = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * RAD) +
    0.24 * Math.cos(2 * hpm * RAD) +
    0.32 * Math.cos((3 * hpm + 6) * RAD) -
    0.2 * Math.cos((4 * hpm - 63) * RAD);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm;
  const Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * RAD) * Rc;
  const l = dLp / Sl;
  const c = dCp / Sc;
  const h = dHp / Sh;
  return l * l + c * c + h * h + Rt * c * h;
}

const UNIQUE_LAB = BAMBU_UNIQUE.map((c) => hexToLab(c.hex));

/** The Bambu colour closest to a Lab value, optionally leaving some hex codes out. */
export function nearestBambuLab(lab: Lab, exclude: ReadonlySet<string> = new Set()): BambuColor {
  let best = -1;
  let bestDistance = Infinity;
  BAMBU_UNIQUE.forEach((c, i) => {
    if (exclude.has(c.hex)) return;
    const d = labDistance2(lab, UNIQUE_LAB[i] as Lab);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return BAMBU_UNIQUE[best < 0 ? 0 : best] as BambuColor;
}

/** The Bambu colour closest to any "#RRGGBB" (itself if it is one). */
export function nearestBambu(hex: string): BambuColor {
  return bambuColor(hex) ?? nearestBambuLab(hexToLab(hex));
}
