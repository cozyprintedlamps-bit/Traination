// Small building blocks of the pages: number fields, choices, switches, colour swatches.
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { BAMBU_COLORS, bambuColor } from "../core/bambuColors";
import { formatNumber, language, tr } from "./i18n";

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, error }: { label: string; hint?: string; children: ReactNode; error?: string }) {
  return (
    <label className="field-row">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      {error ? <span className="field-hint error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

const parse = (text: string): number => Number(text.trim().replace(",", "."));

/** A number in mm (or degrees): accepts comma and dot, commits on blur or Enter, with a slider. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "mm",
  hint,
  slider = true,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  slider?: boolean;
}) {
  const [text, setText] = useState(formatNumber(value, 2));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatNumber(value, 2));
  }, [value, focused]);
  const parsed = parse(text);
  const invalid = !Number.isFinite(parsed) || parsed < min || parsed > max;
  const commit = () => {
    if (!invalid && parsed !== value) onChange(parsed);
  };
  return (
    <Field label={label} hint={hint} error={invalid ? tr("el.invalid", { min, max }) : undefined}>
      {slider && (
        <input
          type="range"
          className="slider"
          min={min}
          max={max}
          step={step}
          value={Math.min(Math.max(value, min), max)}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={label}
        />
      )}
      <span className="number">
        <input
          className={`input${invalid ? " invalid" : ""}`}
          inputMode="decimal"
          value={text}
          lang={language()}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </Field>
  );
}

export function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={`chip${o.value === value ? " selected" : ""}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="toggle-row">
      <input id={id} type="checkbox" className="toggle" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </label>
    </div>
  );
}

/** The Bambu Lab filament colours to choose from; `value` is marked. */
export function ColorPalette({ value, onPick, children }: { value: string; onPick: (hex: string) => void; children?: ReactNode }) {
  const current = bambuColor(value);
  return (
    <div className="palette">
      {(["PLA Basic", "PLA Matte"] as const).map((type) => (
        <div key={type}>
          <div className="palette-title">{tr(type === "PLA Basic" ? "color.basic" : "color.matte")}</div>
          <div className="palette-grid">
            {BAMBU_COLORS.filter((c) => c.type === type).map((c) => (
              <button
                key={c.code}
                type="button"
                className={`swatch pick${c.hex.toUpperCase() === value.toUpperCase() && current?.type === type ? " selected" : ""}`}
                style={{ background: c.hex }}
                title={language() === "en" ? c.en : c.de}
                aria-label={language() === "en" ? c.en : c.de}
                onClick={() => onPick(c.hex)}
              />
            ))}
          </div>
        </div>
      ))}
      {children}
    </div>
  );
}

/** A colour from the Bambu Lab filaments; the swatch opens the palette. */
export function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = bambuColor(value);
  const name = current ? (language() === "en" ? current.en : current.de) : value;
  return (
    <div className="color-row">
      <button type="button" className="color-button" onClick={() => setOpen(!open)} aria-expanded={open} title={tr("color.pick")}>
        <span className="swatch" style={{ background: value }} />
        <span className="color-label">
          <span>{label}</span>
          <span className="muted">{name}</span>
        </span>
      </button>
      {open && (
        <ColorPalette
          value={value}
          onPick={(hex) => {
            onChange(hex);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "warning" | "error" | "ok"; children: ReactNode }) {
  return <p className={`notice ${kind}`}>{children}</p>;
}
