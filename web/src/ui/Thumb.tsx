// A preview picture in a tile. It is drawn when the tile appears (see thumbnails.ts); until it is
// there, or when it cannot be drawn, the fallback shows.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ScenePart, ViewDirection } from "./SceneView";
import { cachedThumbnail, thumbnail } from "./thumbnails";

interface Props {
  /** what the picture shows: the same key, the same picture */
  id: string;
  build(): Promise<ScenePart[]>;
  direction?: ViewDirection;
  fallback?: ReactNode;
}

export function Thumb({ id, build, direction, fallback }: Props) {
  const [url, setUrl] = useState<string | undefined>(() => cachedThumbnail(id));
  useEffect(() => {
    const known = cachedThumbnail(id);
    setUrl(known);
    if (known) return;
    let cancelled = false;
    thumbnail(id, build, direction).then(
      (made) => {
        if (!cancelled) setUrl(made);
      },
      () => {
        // the picture stays the fallback
      },
    );
    return () => {
      cancelled = true;
    };
    // `build` and `direction` follow from `id`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <span className="thumb" data-state={url ? "ready" : "waiting"}>
      {url ? <img src={url} alt="" draggable={false} /> : fallback}
    </span>
  );
}
