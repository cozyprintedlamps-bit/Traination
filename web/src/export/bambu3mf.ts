// Bambu Studio flavoured 3MF project writer (no CAD kernel, no server).
// Taken from TactileManufactory (web/src/export/bambu3mf.ts), where it was checked with Bambu Studio 2.8.2.61.
//
// The structure is copied from project files saved by Bambu Studio (docs/reference/legacy-models.md):
//  * one root object per part, each with a mesh in `3D/Objects/object_N.model`
//  * `Metadata/model_settings.config`: per object the filament slot (`extruder`), per plate the
//    objects on it
//  * `Metadata/project_settings.config`: JSON; the slot colours are `filament_colour`
//  * plate N sits at x = bed_x / 2 + (N - 1) * 1.2 * bed_x on the virtual build plane; plates 3 and 4 form a second row
//
// Bambu Studio rejects a project without `project_settings.config` or with too few keys; exactly
// six keys are required (see `coreSettings`). No full Bambu configuration is shipped on purpose
// (it contains G-code from AGPL-licensed profiles).
//
// The bottom surface (and so the first layer) is printed concentric instead of in lines: it sticks
// better on round and curved outlines. The key is written for the project and for every object;
// the object value stays when the user picks another process preset.
//
// Filament profiles: a part (or volume) may name the Bambu Studio system profile of its filament
// (`filament`). Bambu Studio then selects that profile for the slot; with an empty name it makes a
// profile of its own, named after the file ("1(slider.3mf)"). Without such names the output is the
// same as the Python writer's.
import { zipSync } from "fflate";
import type { MeshData } from "../core/mesh";
import { NAMESPACE_URL, uuid5 } from "./sha1";

export const BAMBU_COMPAT_VERSION = "02.08.02.61"; // format version we imitate
const PLATE_SPACING_FACTOR = 1.2; // observed: plate 2 is shifted by 307.2 = 1.2 * 256 in X
// Bambu Studio puts the plates of a project on a grid (2 side by side, 3 and 4 in two columns). Checked
// with Bambu Studio 2.8.2.61 (tests/bambu_studio_cli.test.ts): up to four plates keep every part on the
// plate it was written for; with five or more it sorts the parts onto plates by their position in
// a grid of its own, so they end up on other plates or on none.
export const MAX_PLATES = 4;
export const BOTTOM_SURFACE_PATTERN = "concentric"; // first layer in rings, sticks better than lines
const COLOR = /^#[0-9A-Fa-f]{6}$/;

/** A Bambu Studio system filament profile, so that the slicer selects it for the slot. */
export interface FilamentPreset {
  /** the profile name, e.g. "Bambu PLA Basic @BBL P1S 0.4 nozzle" */
  settingsId: string;
  /** e.g. "GFA00" (PLA Basic) */
  filamentId: string;
  vendor: string;
  /** e.g. "PLA" */
  type: string;
}

/** A further volume of a part with its own filament (e.g. one colour of a picture). */
export interface PrintVolume {
  name: string;
  mesh: MeshData;
  /** "#RRGGBB" */
  color: string;
  /** the filament profile of its slot; absent: the project's filament name (usually empty) */
  filament?: FilamentPreset;
}

export interface PrintPart {
  name: string;
  mesh: MeshData;
  /** "#RRGGBB", becomes the filament slot colour */
  color: string;
  /** the filament profile of its slot; absent: the project's filament name (usually empty) */
  filament?: FilamentPreset;
  /** 1-based print bed */
  plate?: number;
  /** where the part sits on its bed, from the middle (mm); parts of one bed need different places */
  offset?: [number, number];
  /** more volumes of the same object, each with its own filament (Bambu "parts") */
  volumes?: PrintVolume[];
}

/** Preset names Bambu Studio expects in the project. Empty strings are accepted. */
export interface PresetNames {
  printer: string;
  process: string;
  filament: string;
  nozzleDiameter: string;
  printableHeight: string;
}

export const DEFAULT_PRESETS: PresetNames = {
  printer: "Bambu Lab P1S 0.4 nozzle",
  process: "",
  filament: "",
  nozzleDiameter: "0.4",
  printableHeight: "250",
};

export interface Bambu3mfOptions {
  /** print bed size in mm (x, y); decides where plate 2 sits on the build plane */
  bed?: [number, number];
  presets?: Partial<PresetNames>;
  /** date written to the file, fixed by default so that the output is reproducible */
  created?: string;
}

type Vec3 = [number, number, number];

// ------------------------------------------------------------------------------ small helpers

/** Like Python's format(value, ".8g"): 8 significant digits, no trailing zeros. */
export function formatNumber(value: number): string {
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";
  if (!Number.isFinite(value)) throw new Error(`cannot write ${value} to a 3MF file`);
  const [mantissa, exponentText] = value.toExponential(7).split("e") as [string, string];
  const exponent = parseInt(exponentText, 10);
  const strip = (text: string) => (text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text);
  if (exponent < -4 || exponent >= 8) {
    const sign = exponent < 0 ? "-" : "+";
    return `${strip(mantissa)}e${sign}${String(Math.abs(exponent)).padStart(2, "0")}`;
  }
  return strip(value.toFixed(7 - exponent));
}

/** Like Python's xml.sax.saxutils.quoteattr: the value including its quotes. */
export function quoteAttribute(value: string): string {
  let data = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  data = data.replaceAll("\n", "&#10;").replaceAll("\r", "&#13;").replaceAll("\t", "&#9;");
  if (data.includes('"')) {
    if (data.includes("'")) return `"${data.replaceAll('"', "&quot;")}"`;
    return `'${data}'`;
  }
  return `"${data}"`;
}

function bounds(meshes: MeshData[]): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of meshes) {
    for (let i = 0; i < positions.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const v = positions[i + c] as number;
        if (v < (lo[c] as number)) lo[c] = v;
        if (v > (hi[c] as number)) hi[c] = v;
      }
    }
  }
  return [lo, hi];
}

/** The part itself followed by its further volumes. */
const volumesOf = (part: PrintPart): PrintVolume[] => [
  { name: part.name, mesh: part.mesh, color: part.color, ...(part.filament ? { filament: part.filament } : {}) },
  ...(part.volumes ?? []),
];

interface ObjectIds {
  rootId: number;
  /** one mesh object per volume */
  meshIds: number[];
}

/**
 * Object ids, counted up through the parts: the meshes of a part, then its root object. Parts
 * with one volume get 2i - 1 and 2i, as Bambu Studio numbers them.
 */
function objectIds(parts: PrintPart[]): ObjectIds[] {
  let next = 1;
  return parts.map((part) => {
    const meshIds = volumesOf(part).map(() => next++);
    return { rootId: next++, meshIds };
  });
}

const hex = (value: number, width: number) => value.toString(16).padStart(width, "0");

// ------------------------------------------------------------------------------ the package

/**
 * How many plates Bambu Studio puts in a row: the square root of their number, rounded up (2 plates
 * lie side by side, 3 and 4 in two columns); the next row lies below.
 */
export function plateColumns(count: number): number {
  const root = Math.sqrt(count);
  return Math.round(root) < root ? Math.round(root) + 1 : Math.round(root);
}

/** Where the middle of plate N (1-based) lies on the build plane, from the middle of the first plate (mm). */
export function plateOrigin(plate: number, count: number, bed: [number, number]): [number, number] {
  const columns = plateColumns(count);
  const column = (plate - 1) % columns;
  const row = Math.floor((plate - 1) / columns);
  return [column * PLATE_SPACING_FACTOR * bed[0], 0 - row * PLATE_SPACING_FACTOR * bed[1]]; // 0 - …: no "-0" in the first row
}

/** The files of the package as [name, text] in the order they are written. */
export function bambu3mfFiles(parts: PrintPart[], options: Bambu3mfOptions = {}): [string, string][] {
  const bed = options.bed ?? [256, 256];
  const presets: PresetNames = { ...DEFAULT_PRESETS, ...options.presets };
  const created = options.created ?? "2026-01-01";
  check(parts);

  const plateOf = (part: PrintPart) => part.plate ?? 1;
  const plateCount = Math.max(...parts.map(plateOf));
  // slot order = first use
  const colors = [...new Set(parts.flatMap((p) => volumesOf(p).map((v) => v.color.toUpperCase())))];
  const slotOf = new Map(colors.map((c, i) => [c, i + 1]));
  // the filament profile of a slot: the first part or volume of that colour that names one
  const profileOf = new Map<string, FilamentPreset>();
  for (const v of parts.flatMap(volumesOf)) {
    const color = v.color.toUpperCase();
    if (v.filament && !profileOf.has(color)) profileOf.set(color, v.filament);
  }
  const slotProfiles = colors.map((c) => profileOf.get(c));
  const ids = objectIds(parts);

  const files: [string, string][] = [
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["3D/_rels/3dmodel.model.rels", modelRels(parts.length)],
    ["Metadata/slice_info.config", SLICE_INFO],
    ["Metadata/cut_information.xml", cutInformation(parts.length)],
    ["Metadata/filament_sequence.json", filamentSequence(parts)],
  ];
  const items: string[] = [];
  const resources: string[] = [];
  const settingsObjects: string[] = [];
  parts.forEach((part, index) => {
    const i = index + 1;
    const volumes = volumesOf(part);
    const [lo, hi] = bounds(volumes.map((v) => v.mesh));
    const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const height = hi[2] - lo[2];
    const { rootId, meshIds } = ids[index] as ObjectIds;
    files.push([`3D/Objects/object_${i}.model`, meshFile(volumes, center, meshIds, i)]);
    const components = meshIds
      .map(
        (meshId, v) =>
          `    <component p:path="/3D/Objects/object_${i}.model" objectid="${meshId}" ` +
          `p:UUID="${hex(i, 4)}${hex(v, 4)}-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`,
      )
      .join("");
    resources.push(
      `  <object id="${rootId}" p:UUID="${hex(i, 8)}-61cb-4c03-9d28-80fed5dfa1dc" type="model">\n` +
        `   <components>\n` +
        components +
        `   </components>\n` +
        `  </object>`,
    );
    const [dx, dy] = part.offset ?? [0, 0];
    const [ox, oy] = plateOrigin(plateOf(part), plateCount, bed);
    items.push(
      `  <item objectid="${rootId}" p:UUID="${hex(i, 8)}-b1ec-4553-aec9-835e5b724bb4" ` +
        `transform="1 0 0 0 1 0 0 0 1 ${formatNumber(bed[0] / 2 + ox + dx)} ${formatNumber(bed[1] / 2 + oy + dy)} ${formatNumber(height / 2)}" printable="1"/>`,
    );
    settingsObjects.push(
      settingsObject(part, rootId, meshIds, (color) => slotOf.get(color.toUpperCase()) as number, center),
    );
  });
  files.push(["3D/3dmodel.model", rootModel(resources.join("\n"), items.join("\n"), created)]);
  files.push(["Metadata/model_settings.config", modelSettings(settingsObjects, parts, ids)]);
  files.push(["Metadata/project_settings.config", dump(coreSettings(colors, presets, slotProfiles))]);
  return files;
}

/** Writes the 3MF package. Parts with the same colour share a filament slot. */
export function writeBambu3mf(parts: PrintPart[], options: Bambu3mfOptions = {}): Uint8Array {
  const encoder = new TextEncoder();
  const zipDate = new Date(2026, 0, 1, 0, 0, 0); // fixed, so that the output is reproducible
  const entries: Record<string, [Uint8Array, { level: 6; mtime: Date }]> = {};
  for (const [name, text] of bambu3mfFiles(parts, options)) {
    entries[name] = [encoder.encode(text), { level: 6, mtime: zipDate }];
  }
  return zipSync(entries);
}

// ------------------------------------------------------------------------------ validation
function check(parts: PrintPart[]): void {
  if (parts.length === 0) throw new Error("no parts to write");
  for (const p of parts) {
    if (!COLOR.test(p.color)) throw new Error(`invalid colour '${p.color}' for part '${p.name}'`);
    const plate = p.plate ?? 1;
    if (!Number.isInteger(plate) || plate < 1 || plate > MAX_PLATES) {
      throw new Error(`plate must be 1..${MAX_PLATES}, got ${plate}`);
    }
    for (const v of volumesOf(p)) {
      if (!COLOR.test(v.color)) throw new Error(`invalid colour '${v.color}' for part '${v.name}'`);
      if (v.mesh.positions.length === 0 || v.mesh.indices.length === 0) {
        throw new Error(`part '${v.name}' has an empty mesh`);
      }
    }
  }
}

// ------------------------------------------------------------------------------ settings
/**
 * The six keys Bambu Studio 2.8 needs (found by bisecting a real project), plus the colours.
 * Required: filament_settings_id, flush_volumes_matrix, nozzle_diameter, print_settings_id,
 * printable_height, printer_settings_id. Without any one of them the file is rejected.
 */
function coreSettings(colors: string[], presets: PresetNames, profiles: (FilamentPreset | undefined)[] = []): Record<string, unknown> {
  const n = colors.length;
  const named = profiles.some(Boolean);
  const each = (pick: (p: FilamentPreset) => string, otherwise: string) => colors.map((_, i) => (profiles[i] ? pick(profiles[i] as FilamentPreset) : otherwise));
  return {
    from: "project",
    name: "project_settings",
    version: BAMBU_COMPAT_VERSION,
    // required by Bambu Studio
    filament_settings_id: each((p) => p.settingsId, presets.filament),
    flush_volumes_matrix: Array<string>(n * n).fill("0"), // parts sit on separate plates: no flushing
    nozzle_diameter: [presets.nozzleDiameter],
    print_settings_id: presets.process,
    printable_height: presets.printableHeight,
    printer_settings_id: presets.printer,
    // what we actually want to carry
    filament_colour: colors,
    filament_multi_colour: colors,
    filament_type: each((p) => p.type, "PLA"),
    // with named profiles: which filament each slot is, so that Bambu Studio keeps it when the printer changes
    ...(named ? { filament_ids: each((p) => p.filamentId, ""), filament_vendor: each((p) => p.vendor, "") } : {}),
    // ... and which system profile each slot is based on: one entry per preset in the order print, filament 1..n,
    // printer. Without it Bambu Studio takes the system profile only for the first slot; every other slot becomes a
    // profile of its own named after the file ("(slider.3mf)"), see docs/decisions/0012 and spikes/bambu_gui_filament_probe.py
    ...(named ? { inherits_group: ["", ...each((p) => p.settingsId, ""), ""] } : {}),
    filament_map: Array<string>(n).fill("1"),
    bottom_surface_pattern: BOTTOM_SURFACE_PATTERN,
  };
}

const dump = (data: Record<string, unknown>) => `${JSON.stringify(data, null, 4)}\n`;

// ------------------------------------------------------------------------------ XML pieces
function rootModel(resources: string, items: string, created: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `${MODEL_OPEN}\n` +
    ` <metadata name="Application">BambuStudio-${BAMBU_COMPAT_VERSION}</metadata>\n` +
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n' +
    ' <metadata name="Copyright"></metadata>\n' +
    ` <metadata name="CreationDate">${created}</metadata>\n` +
    ' <metadata name="Description"></metadata>\n' +
    ' <metadata name="Designer"></metadata>\n' +
    ' <metadata name="DesignerCover"></metadata>\n' +
    ' <metadata name="DesignerUserId"></metadata>\n' +
    ' <metadata name="License"></metadata>\n' +
    ` <metadata name="ModificationDate">${created}</metadata>\n` +
    ' <metadata name="Origin"></metadata>\n' +
    ' <metadata name="Title"></metadata>\n' +
    ' <metadata name="X-Traination">generated</metadata>\n' +
    ` <resources>\n${resources}\n </resources>\n` +
    ' <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n' +
    `${items}\n` +
    " </build>\n" +
    "</model>\n"
  );
}

function meshFile(volumes: PrintVolume[], center: Vec3, meshIds: number[], index: number): string {
  const [cx, cy, cz] = center;
  const objects = volumes.map(({ mesh }, v) => {
    const { positions, indices } = mesh;
    const vertices: string[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      vertices.push(
        `     <vertex x="${formatNumber((positions[i] as number) - cx)}" ` +
          `y="${formatNumber((positions[i + 1] as number) - cy)}" ` +
          `z="${formatNumber((positions[i + 2] as number) - cz)}"/>`,
      );
    }
    const triangles: string[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      triangles.push(`     <triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`);
    }
    return (
      `  <object id="${meshIds[v]}" p:UUID="${hex(index, 4)}${hex(v, 4)}-81cb-4c03-9d28-80fed5dfa1dc" type="model">\n` +
      "   <mesh>\n" +
      `    <vertices>\n${vertices.join("\n")}\n    </vertices>\n` +
      `    <triangles>\n${triangles.join("\n")}\n    </triangles>\n` +
      "   </mesh>\n" +
      "  </object>\n"
    );
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `${MODEL_OPEN}\n` +
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n' +
    " <resources>\n" +
    objects.join("") +
    " </resources>\n" +
    " <build/>\n" +
    "</model>\n"
  );
}

function settingsObject(
  part: PrintPart,
  rootId: number,
  meshIds: number[],
  slotOf: (color: string) => number,
  center: Vec3,
): string {
  const volumes = volumesOf(part);
  const single = volumes.length === 1;
  const name = quoteAttribute(part.name);
  const faces = volumes.reduce((sum, v) => sum + v.mesh.indices.length / 3, 0);
  const partXml = volumes
    .map((volume, v) => {
      const volumeName = quoteAttribute(volume.name);
      const key = single ? `traination/${part.name}/${rootId}` : `traination/${part.name}/${rootId}/${v}`;
      const partFaces = volume.mesh.indices.length / 3;
      // one volume keeps id 1 (as checked with Bambu Studio); several volumes are matched to their
      // mesh objects by id and carry their own filament
      const id = single ? 1 : meshIds[v];
      const extruder = single ? "" : `      <metadata key="extruder" value="${slotOf(volume.color)}"/>\n`;
      return (
        `    <part id="${id}" subtype="normal_part" uuid="${uuid5(NAMESPACE_URL, key)}">\n` +
        `      <metadata key="name" value=${volumeName}/>\n` +
        '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n' +
        extruder +
        `      <metadata key="source_file" value=${name}/>\n` +
        '      <metadata key="source_object_id" value="0"/>\n' +
        `      <metadata key="source_volume_id" value="${v}"/>\n` +
        `      <metadata key="source_offset_x" value="${formatNumber(center[0])}"/>\n` +
        `      <metadata key="source_offset_y" value="${formatNumber(center[1])}"/>\n` +
        `      <metadata key="source_offset_z" value="${formatNumber(center[2])}"/>\n` +
        `      <mesh_stat face_count="${partFaces}" edges_fixed="0" degenerate_facets="0" ` +
        'facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n' +
        "    </part>\n"
      );
    })
    .join("");
  return (
    `  <object id="${rootId}">\n` +
    `    <metadata key="name" value=${name}/>\n` +
    `    <metadata key="extruder" value="${slotOf(part.color)}"/>\n` +
    `    <metadata key="bottom_surface_pattern" value="${BOTTOM_SURFACE_PATTERN}"/>\n` +
    `    <metadata face_count="${faces}"/>\n` +
    partXml +
    "  </object>"
  );
}

function modelSettings(objects: string[], parts: PrintPart[], ids: ObjectIds[]): string {
  const plateNumbers = [...new Set(parts.map((p) => p.plate ?? 1))].sort((a, b) => a - b);
  const plates = plateNumbers.map((plate) => {
    const instances = parts
      .map((p, index) => ({ p, i: index + 1 }))
      .filter(({ p }) => (p.plate ?? 1) === plate)
      .map(
        ({ i }) =>
          "    <model_instance>\n" +
          `      <metadata key="object_id" value="${(ids[i - 1] as ObjectIds).rootId}"/>\n` +
          '      <metadata key="instance_id" value="0"/>\n' +
          `      <metadata key="identify_id" value="${100 + i}"/>\n` +
          "    </model_instance>\n",
      )
      .join("");
    return (
      "  <plate>\n" +
      `    <metadata key="plater_id" value="${plate}"/>\n` +
      '    <metadata key="plater_name" value=""/>\n' +
      '    <metadata key="locked" value="false"/>\n' +
      '    <metadata key="filament_map_mode" value="Auto For Flush"/>\n' +
      `${instances}` +
      "  </plate>"
    );
  });
  const assemble = parts
    .map((_, index) => {
      const i = index + 1;
      const { rootId, meshIds } = ids[index] as ObjectIds;
      return (
        `   <assemble_item object_id="${rootId}" instance_id="0" ` +
        `transform="1 0 0 0 1 0 0 0 1 ${formatNumber(i * 40.5 - 40.5)} 0 0" offset="0 0 0" />\n` +
        meshIds
          .map((_, v) => `   <assemble_item object_id="${rootId}" volume_id="${v}" transform="1 0 0 0 1 0 0 0 1 0 0 0" />`)
          .join("\n")
      );
    })
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' +
    objects.join("\n") +
    "\n" +
    plates.join("\n") +
    `\n  <assemble>\n${assemble}\n  </assemble>\n</config>\n`
  );
}

function modelRels(count: number): string {
  const rels = Array.from(
    { length: count },
    (_, k) =>
      ` <Relationship Target="/3D/Objects/object_${k + 1}.model" Id="rel-${k + 1}" ` +
      'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
  ).join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    `${rels}\n</Relationships>\n`
  );
}

function cutInformation(count: number): string {
  const objects = Array.from(
    { length: count },
    (_, k) => ` <object id="${k + 1}">\n  <cut_id id="0" check_sum="1" connectors_cnt="0"/>\n </object>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<objects>\n${objects}\n</objects>\n`;
}

function filamentSequence(parts: PrintPart[]): string {
  const plates = [...new Set(parts.map((p) => p.plate ?? 1))].sort((a, b) => a - b);
  const data: Record<string, unknown> = {};
  for (const n of plates) {
    data[`plate_${n}`] = { nozzle_sequence: [], optimal_assignment: [], sequence: [] };
  }
  return JSON.stringify(data);
}

const MODEL_OPEN =
  '<model unit="millimeter" xml:lang="en-US" ' +
  'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ' +
  'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" ' +
  'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" ' +
  'requiredextensions="p">';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
  ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
  ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
  ' <Default Extension="png" ContentType="image/png"/>\n' +
  ' <Default Extension="gcode" ContentType="text/x.gcode"/>\n' +
  "</Types>\n";

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
  ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" ' +
  'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
  "</Relationships>\n";

const SLICE_INFO =
  '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n' +
  '    <header_item key="X-BBL-Client-Type" value="slicer"/>\n' +
  `    <header_item key="X-BBL-Client-Version" value="${BAMBU_COMPAT_VERSION}"/>\n` +
  "  </header>\n</config>\n";
