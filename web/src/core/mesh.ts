// Triangle meshes as the engine hands them to the page and the exporters.

export interface MeshData {
  /** x, y, z per vertex */
  positions: Float32Array;
  /** three vertex indices per triangle, counter-clockwise seen from outside */
  indices: Uint32Array;
}

export interface PartMesh {
  mesh: MeshData;
  /** mm3 */
  volume: number;
  /** estimated printed material in mm3 (walls, skins and sparse infill, see core/material) */
  material: number;
  /** min and max corner (mm) */
  min: [number, number, number];
  max: [number, number, number];
  /** manifold status, "NoError" for a clean solid */
  status: string;
}
