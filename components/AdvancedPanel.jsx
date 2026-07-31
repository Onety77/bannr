// ============================================================
// ADVANCED PANEL — per-style overrides, rendered from the control
// definitions in lib/advanced.js rather than hand-written markup.
// Adding a control there makes it appear here automatically.
//
// Everything starts at "Auto", and Auto contributes nothing to the
// prompt (see the note atop lib/advanced.js). The Reset link only
// appears once something has actually been moved, so the panel
// never implies you've changed things you haven't.
// ============================================================
"use client";
import { controlsFor, defaultValue, isDefault } from "@/lib/advanced";

export default function AdvancedPanel({ styleId, settings, onChange, onReset, touched }) {
  const controls = controlsFor(styleId);

  const set = (key, value) => onChange({ ...settings, [key]: value });

  return (
    <div className="adv">
      <div className="adv-head">
        <span className="hint">
          Everything here is optional — anything left on Auto is decided for you.
        </span>
        {touched > 0 && (
          <button type="button" className="adv-reset" onClick={onReset}>
            Reset {touched}
          </button>
        )}
      </div>

      {controls.map((c) => {
        const v = settings[c.key] ?? defaultValue(c);
        const changed = !isDefault(c, v);

        return (
          <div className={`adv-row ${changed ? "changed" : ""}`} key={c.key}>
            <label className="adv-label">
              {c.label}
              {c.help && <span className="adv-help">{c.help}</span>}
            </label>

            {c.type === "scale" ? (
              // -1 is the "no opinion" position. A slider parked at a
              // middle stop would still be an instruction, so Auto has
              // to be its own place on the track rather than the centre.
              <div className="adv-scale">
                <input
                  type="range"
                  min={-1}
                  max={c.stops.length - 1}
                  step={1}
                  value={v}
                  onChange={(e) => set(c.key, Number(e.target.value))}
                  aria-label={c.label}
                />
                <span className="adv-scale-value">
                  {v === -1 ? "Auto" : c.stops[v].label}
                </span>
              </div>
            ) : c.type === "text" ? (
              <input
                type="text"
                className="adv-text"
                maxLength={300}
                placeholder={c.placeholder}
                value={v}
                onChange={(e) => set(c.key, e.target.value)}
              />
            ) : (
              <div className="adv-opts">
                {c.options.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={`adv-opt ${v === o.v ? "on" : ""}`}
                    onClick={() => set(c.key, o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
