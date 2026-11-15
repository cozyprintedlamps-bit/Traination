// Preview pictures of templates, track pieces and buildings: the parts are drawn once by a small
// three.js view that is not on the page, and the picture is kept by a key (what it shows). Nothing
// is built before a tile asks for it, and a picture is never drawn twice.
import { SceneView } from "./SceneView";
import type { ScenePart, ViewDirection } from "./SceneView";

/** Size of a picture in CSS pixels; it is drawn at twice that. */
export const THUMB_SIZE = [170, 100] as const;
/** Steeper than the normal view: a whole layout is easier to read from above. */
export const FROM_ABOVE: ViewDirection = [0.2, -0.5, 1.2];

const CACHE_LIMIT = 300;
const cache = new Map<string, string>();
/** undefined: not made yet; null: this browser has no WebGL */
let view: SceneView | null | undefined;

function scene(): SceneView | null {
  if (view === undefined) {
    try {
      view = new SceneView(document.createElement("canvas"), { pixelRatio: 2 });
      view.setGridVisible(false);
      view.resize(THUMB_SIZE[0], THUMB_SIZE[1]);
    } catch {
      view = null;
    }
  }
  return view;
}

/** A short key from a long text (FNV-1a): the same parameters give the same key. */
export function hashKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const cachedThumbnail = (key: string): string | undefined => cache.get(key);

/**
 * The picture (PNG data URL) of the parts that `build` makes, or undefined if there is nothing to
 * draw or no WebGL. Drawing itself is one synchronous step, so pictures never mix.
 */
export async function thumbnail(key: string, build: () => Promise<ScenePart[]>, direction?: ViewDirection): Promise<string | undefined> {
  const known = cache.get(key);
  if (known) return known;
  const parts = await build();
  const again = cache.get(key);
  if (again) return again;
  const target = scene();
  if (!target || parts.length === 0) return undefined;
  target.setParts(parts);
  target.fit(direction);
  const url = target.snapshot();
  cache.set(key, url);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return url;
}
