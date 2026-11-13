// Loads the manifold WebAssembly module and keeps track of the objects it creates.
//
// manifold objects live in WebAssembly memory and are NOT garbage collected: every object a call
// returns has to be freed with delete(). Our geometry code chains calls freely, so the methods
// that return new objects are wrapped once; each result goes into an arena that `release()`
// empties after a part is finished.
import Module from "manifold-3d";
import type { ManifoldToplevel } from "manifold-3d";

export interface KernelOptions {
  /** Where to find manifold.wasm (a bundler passes the URL of the copied file). */
  locateFile?: () => string;
}

export interface Kernel {
  wasm: ManifoldToplevel;
  /** False if wrapping failed; geometry still works then, but memory is not freed. */
  tracking: boolean;
  /** Frees every object created since the last release. */
  release(): void;
}

interface Releasable {
  delete(): void;
}

type AnyFunction = (this: unknown, ...args: unknown[]) => unknown;

const TRACKED = {
  Manifold: {
    instance: ["add", "subtract", "intersect", "translate", "rotate", "scale"],
    static: ["hull", "union", "difference", "cylinder", "cube", "extrude", "sphere", "revolve"],
  },
  CrossSection: {
    instance: ["add", "subtract", "intersect", "translate", "rotate", "extrude", "offset", "scale", "revolve"],
    static: ["square", "circle", "ofPolygons", "union", "difference", "hull"],
  },
} as const;

function isReleasable(value: unknown): value is Releasable {
  return typeof value === "object" && value !== null && typeof (value as Releasable).delete === "function";
}

function wrap(target: object, name: string, arena: Releasable[]): boolean {
  const record = target as Record<string, unknown>;
  const original = record[name];
  if (typeof original !== "function") return true; // nothing to wrap in this version
  try {
    record[name] = function (this: unknown, ...args: unknown[]) {
      const result = (original as AnyFunction).apply(this, args);
      if (isReleasable(result)) arena.push(result);
      return result;
    };
    return true;
  } catch {
    return false;
  }
}

function installTracking(wasm: ManifoldToplevel, arena: Releasable[]): boolean {
  let ok = true;
  for (const [className, names] of Object.entries(TRACKED)) {
    const cls = wasm[className as keyof typeof TRACKED] as unknown as { prototype: object };
    for (const name of names.instance) ok = wrap(cls.prototype, name, arena) && ok;
    for (const name of names.static) ok = wrap(cls, name, arena) && ok;
  }
  return ok;
}

export async function createKernel(options: KernelOptions = {}): Promise<Kernel> {
  const wasm = options.locateFile ? await Module({ locateFile: options.locateFile }) : await Module();
  wasm.setup();
  const arena: Releasable[] = [];
  const tracking = installTracking(wasm, arena);

  function release(): void {
    for (const object of arena) {
      try {
        object.delete();
      } catch {
        // already freed
      }
    }
    arena.length = 0;
  }

  return { wasm, tracking, release };
}
