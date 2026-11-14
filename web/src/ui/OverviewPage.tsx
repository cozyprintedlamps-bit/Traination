// Step 5: everything together. Numbers about track, train and buildings, the print parts and an
// estimate of the filament per colour. The 3D view shows track, buildings and train.
import { useEffect, useState } from "react";
import { useAppState, useEngine } from "../app/context";
import { bambuColor } from "../core/bambuColors";
import { clearance } from "../core/project";
import type { Project } from "../core/project";
import { supports } from "../core/supports";
import { elementShape, pathLength } from "../core/track";
import { vehicleIssues } from "../core/vehicle";
import { buildingItems, trackItems, vehicleItems } from "../export/printItems";
import type { PrintItem } from "../export/plates";
import { FILAMENT_DENSITY } from "../presets/print";
import { COUPLER_REACH } from "../presets/vehicle";
import { Notice, Section } from "./components";
import { exportNames } from "./ExportPage";
import { formatNumber, language, tr, vehicleName } from "./i18n";
import { useAnalysis } from "./useScene";
import { issueText } from "./VehiclesPage";


interface Usage {
  parts: number;
  grams: Map<string, number>;
}

async function usage(project: Project, engine: ReturnType<typeof useEngine>): Promise<Usage> {
  const names = exportNames();
  const items: PrintItem[] = [...(await trackItems(project, engine, names)), ...(await vehicleItems(project, engine, names)), ...(await buildingItems(project, engine, names))];
  const grams = new Map<string, number>();
  let parts = 0;
  // printed material (walls, skins and sparse infill), see core/material
  const add = (color: string, material: number, count: number) => {
    const key = color.toUpperCase();
    grams.set(key, (grams.get(key) ?? 0) + (material / 1000) * FILAMENT_DENSITY * count);
  };
  for (const item of items) {
    parts += item.count;
    add(item.color, item.part.material, item.count);
    for (const v of item.volumes ?? []) add(v.color, v.part.material, item.count);
  }
  return { parts, grams };
}

export function OverviewPage() {
  const { project } = useAppState();
  const engine = useEngine();
  const analysis = useAnalysis(project);
  const [result, setResult] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    usage(project, engine)
      .then((u) => {
        if (!cancelled) setResult(u);
      })
      .catch(() => {
        if (!cancelled) setResult({ parts: 0, grams: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [project, engine]);

  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const trackLength = project.layout.pieces.reduce((sum, p) => {
    const t = typeOf.get(p.type);
    return t ? sum + (elementShape(t, p.variant).paths[0] ? pathLength(elementShape(t, p.variant).paths[0]!) : 0) : sum;
  }, 0);
  const trainLength = project.vehicles.reduce((n, v) => n + v.length, 0) + Math.max(0, project.vehicles.length - 1) * 2 * COUPLER_REACH;
  const closedLoops = analysis.joints.filter((j) => j.closed).length;
  const pillars = supports(project.layout, project.elements, analysis).length;
  const limit = clearance(project);
  const notes = project.vehicles.flatMap((v, i) => vehicleIssues(v, limit, project.settings.fits).filter((x) => x.code !== "couplers_mixed").map((x) => `${vehicleName(v, i)}: ${issueText(x)}`));
  if (analysis.overlapping.length > 0) notes.push(tr("status.overlap", { n: analysis.overlapping.length }));
  const mismatched = analysis.joints.filter((j) => !j.fits).length;
  if (mismatched > 0) notes.push(tr("status.mismatch", { n: mismatched }));
  const m = (mm: number) => (mm >= 1000 ? `${formatNumber(mm / 1000, 2)} m` : `${formatNumber(mm, 0)} mm`);
  const total = result ? [...result.grams.values()].reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <p className="muted small intro">{tr("overview.hint")}</p>
      <Section title={tr("overview.track")}>
        <dl className="facts">
          <dt>{tr("overview.length")}</dt>
          <dd>{m(trackLength)}</dd>
          <dt>{tr("overview.pieces")}</dt>
          <dd>{project.layout.pieces.length}</dd>
          <dt>{tr("overview.supports")}</dt>
          <dd>{pillars}</dd>
          <dt>{tr("overview.loops")}</dt>
          <dd>{closedLoops}</dd>
          <dt>{tr("overview.open")}</dt>
          <dd>{analysis.open.length}</dd>
          <dt>{tr("overview.buildings")}</dt>
          <dd>{project.buildings.length}</dd>
        </dl>
      </Section>
      <Section title={tr("overview.train")}>
        <dl className="facts">
          <dt>{tr("overview.vehicles")}</dt>
          <dd>{project.vehicles.length}</dd>
          <dt>{tr("overview.train_length")}</dt>
          <dd>{m(trainLength)}</dd>
        </dl>
        <p className="small">{project.vehicles.map((v, i) => vehicleName(v, i)).join(" · ")}</p>
      </Section>
      <Section title={tr("overview.print")}>
        {result ? (
          <>
            <dl className="facts">
              <dt>{tr("overview.parts")}</dt>
              <dd data-testid="overview-parts">{result.parts}</dd>
              <dt title={tr("overview.filament_hint")}>{tr("overview.filament")}</dt>
              <dd>{formatNumber(total, 0)} g</dd>
            </dl>
            <h4 className="subhead">{tr("overview.colors")}</h4>
            <ul className="parts">
              {[...result.grams.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([hex, g]) => {
                  const c = bambuColor(hex);
                  return (
                    <li key={hex}>
                      <span className="swatch small" style={{ background: hex }} />
                      <span>{c ? `${language() === "en" ? c.en : c.de} (${c.type})` : hex}</span>
                      <span className="count">{g < 1 ? "< 1" : formatNumber(g, 0)} g</span>
                    </li>
                  );
                })}
            </ul>
            <p className="muted small">{tr("overview.filament_hint")}</p>
          </>
        ) : (
          <p className="muted small">{tr("overview.computing")}</p>
        )}
      </Section>
      {notes.length > 0 && (
        <Section title={tr("overview.warnings")}>
          {notes.map((n) => (
            <Notice key={n} kind="warning">
              {n}
            </Notice>
          ))}
        </Section>
      )}
    </>
  );
}
