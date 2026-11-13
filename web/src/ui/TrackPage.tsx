// Step 1: plan the track. Templates, the palette of pieces, the selected piece and the status.
import { useAppState, useStore } from "../app/context";
import { TEMPLATES } from "../core/project";
import type { TemplateId } from "../core/project";
import { standsOnGround } from "../core/track";
import type { ElementType } from "../core/track";
import { Notice, Section } from "./components";
import { KindIcon } from "./Icon";
import { elementName, tr } from "./i18n";
import type { TextKey } from "./i18n";
import { useAnalysis } from "./useScene";

const handed = (t: ElementType) => t.kind === "curve";

export function TrackPage() {
  const state = useAppState();
  const store = useStore();
  const { project, selection } = state;
  const analysis = useAnalysis(project);
  const target = store.currentTarget();
  const typeOf = new Map(project.elements.map((e) => [e.id, e]));
  const selected = project.layout.pieces.find((p) => p.id === selection.piece);
  const selectedType = selected ? typeOf.get(selected.type) : undefined;
  const targetType = target ? typeOf.get(project.layout.pieces.find((p) => p.id === target.piece)?.type ?? "") : undefined;

  const mismatched = analysis.joints.filter((j) => !j.fits).length;
  const closed = analysis.joints.filter((j) => j.closed).length;
  const problems = mismatched + analysis.overlapping.length + analysis.floating.length;

  return (
    <>
      <Section title={tr("track.templates")}>
        <div className="choices">
          {TEMPLATES.map((id: TemplateId) => (
            <button key={id} type="button" className="chip" onClick={() => store.applyTemplate(id)}>
              {tr(`template.${id}` as TextKey)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={tr("track.add")}>
        <p className="muted small">{target && targetType ? tr("track.target", { name: elementName(targetType) }) : project.layout.pieces.length > 0 ? tr("track.target_none") : tr("track.add_hint")}</p>
        <div className="palette-list">
          {project.elements.map((t) => (
            <div key={t.id} className="palette-item">
              <span className="palette-icon" style={{ color: t.color }}>
                <KindIcon kind={t.kind} />
              </span>
              <span className="palette-name">{elementName(t)}</span>
              {handed(t) ? (
                <span className="palette-actions">
                  <button type="button" className="button small" onClick={() => store.addPiece(t.id, "left")} title={tr("track.left")}>
                    ↶ {tr("track.left")}
                  </button>
                  <button type="button" className="button small" onClick={() => store.addPiece(t.id, "right")} title={tr("track.right")}>
                    {tr("track.right")} ↷
                  </button>
                </span>
              ) : (
                <span className="palette-actions">
                  <button type="button" className="button small" onClick={() => store.addPiece(t.id)} aria-label={`${tr("track.add")}: ${elementName(t)}`}>
                    +
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="muted small">{tr("track.add_hint")}</p>
      </Section>

      <Section title={tr("track.selected")}>
        {selected && selectedType ? (
          <>
            <p className="strong">{elementName(selectedType, selected.variant)}</p>
            <div className="choices">
              {!standsOnGround(selectedType.kind) && (
                <button type="button" className="button" onClick={() => store.mirrorPiece(selected.id)}>
                  {tr("track.mirror")}
                </button>
              )}
              <button type="button" className="button" onClick={() => store.swapPiece(selected.id)}>
                {tr("track.swap")}
              </button>
              <button type="button" className="button" onClick={() => store.turnRoot(store.rootOf(selected.id), 45)}>
                {tr("track.turn")} 45°
              </button>
              <button type="button" className="button danger" onClick={() => store.removePiece(selected.id)}>
                {tr("track.remove")}
              </button>
            </div>
          </>
        ) : (
          <p className="muted small">{tr("track.none_selected")}</p>
        )}
      </Section>

      <Section title={tr("track.status")}>
        <ul className="status-list">
          <li>{tr("status.pieces", { n: project.layout.pieces.length })}</li>
          {closed > 0 && <li className="ok">{closed === 1 ? tr("status.closed") : tr("status.loops", { n: closed })}</li>}
          {analysis.open.length > 0 && <li>{tr("status.open", { n: analysis.open.length })}</li>}
          {mismatched > 0 && <li className="warning">{tr("status.mismatch", { n: mismatched })}</li>}
          {analysis.overlapping.length > 0 && <li className="warning">{tr("status.overlap", { n: analysis.overlapping.length })}</li>}
          {analysis.floating.length > 0 && <li className="warning">{tr("status.floating", { n: analysis.floating.length })}</li>}
        </ul>
        {problems === 0 && project.layout.pieces.length > 0 && <Notice kind="ok">{tr("status.ok")}</Notice>}
      </Section>
    </>
  );
}
