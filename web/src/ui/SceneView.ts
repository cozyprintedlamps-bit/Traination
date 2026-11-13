// The 3D view with three.js: shows the parts, orbit/zoom/pan with the mouse. Renders only when
// something changed. Adapted from TactileManufactory (parts can be turned about Z here).
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import type { MeshData } from "../core/mesh";

export interface ScenePart {
  mesh: MeshData;
  color: string;
  /** position (mm) and turn about Z (degrees) */
  x: number;
  y: number;
  z: number;
  rotation: number;
  /** drawn lighter: a highlight */
  highlight?: boolean;
}

const CREASE_ANGLE = (35 * Math.PI) / 180;
const FIELD_OF_VIEW = 35;

export class SceneView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 20000);
  private readonly controls: OrbitControls;
  private readonly meshes: Mesh[] = [];
  private readonly grid: GridHelper;
  private geometries = new Map<MeshData, BufferGeometry>();
  private parts: ScenePart[] = [];
  private width = 1;
  private height = 1;
  private frame = 0;
  private disposed = false;
  private autoFit = false;

  /** Throws if WebGL is not available. */
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.up.set(0, 0, 1);
    this.scene.add(this.camera);
    this.camera.add(new AmbientLight(0xffffff, 0.55));
    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(0.35, 0.55, 0.75);
    this.camera.add(key);
    const fill = new DirectionalLight(0xffffff, 0.7);
    fill.position.set(-0.6, -0.25, 0.45);
    this.camera.add(fill);
    this.scene.add(new HemisphereLight(0xffffff, 0x8890a0, 0.35));
    this.grid = new GridHelper(4000, 80, 0x8899bb, 0x8899bb);
    this.grid.rotation.x = Math.PI / 2;
    const gridMaterial = this.grid.material as LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.18;
    this.scene.add(this.grid);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener("change", () => this.requestRender());
    // once the user turns or zooms, a resize keeps the view; before that it fits again
    this.controls.addEventListener("start", () => {
      this.autoFit = false;
    });
    this.renderer.setClearColor(0x000000, 0);
  }

  resize(width: number, height: number): void {
    this.width = Math.max(width, 1);
    this.height = Math.max(height, 1);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (this.autoFit) this.fit();
    this.requestRender();
  }

  setParts(parts: ScenePart[]): void {
    this.parts = parts;
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.meshes.length = 0;
    const kept = new Set(parts.map((p) => p.mesh));
    for (const [mesh, geometry] of this.geometries) {
      if (!kept.has(mesh)) {
        geometry.dispose();
        this.geometries.delete(mesh);
      }
    }
    for (const part of parts) {
      const color = new Color(part.color);
      if (part.highlight) color.lerp(new Color(0x4f7cff), 0.45);
      const material = new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 });
      const mesh = new Mesh(this.geometryOf(part.mesh), material);
      mesh.position.set(part.x, part.y, part.z);
      mesh.rotation.z = (part.rotation * Math.PI) / 180;
      this.scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.requestRender();
  }

  /** Look at all parts from an angle above. */
  fit(): void {
    if (this.meshes.length === 0) return;
    this.autoFit = true;
    const lo = new Vector3(Infinity, Infinity, Infinity);
    const hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of this.meshes) {
      mesh.updateMatrixWorld();
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
      if (!box) continue;
      lo.min(box.min);
      hi.max(box.max);
    }
    const center = lo.clone().add(hi).multiplyScalar(0.5);
    const radius = Math.max(hi.clone().sub(lo).length() / 2, 20);
    // the sphere around the parts fits the narrower of the two angles of view
    const vertical = (FIELD_OF_VIEW * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 0.92;
    const dir = new Vector3(0.55, -0.85, 0.75).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center.clone().add(dir.multiplyScalar(distance)));
    this.camera.near = Math.max(distance * 0.01, 0.5);
    this.camera.far = distance * 30;
    this.camera.updateProjectionMatrix();
    this.grid.position.set(center.x, center.y, -0.05);
    this.controls.update();
    this.requestRender();
  }

  get partCount(): number {
    return this.parts.length;
  }

  private geometryOf(mesh: MeshData): BufferGeometry {
    const cached = this.geometries.get(mesh);
    if (cached) return cached;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    const creased = toCreasedNormals(geometry, CREASE_ANGLE);
    geometry.dispose();
    this.geometries.set(mesh, creased);
    return creased;
  }

  private requestRender(): void {
    if (this.frame !== 0 || this.disposed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.controls.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const mesh of this.meshes) (mesh.material as MeshStandardMaterial).dispose();
    this.renderer.dispose();
  }
}
