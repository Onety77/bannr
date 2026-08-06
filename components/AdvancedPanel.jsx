// ============================================================
// ADVANCED PANEL — per-style overrides, rendered from the control
// definitions in lib/advanced.js rather than hand-written markup.
// Adding a control there makes it appear here automatically.
//
// Everything starts at "Default", which contributes nothing to the
// prompt (see the note atop lib/advanced.js). The Reset link only
// appears once something has actually been moved, so the panel
// never implies you've changed things you haven't.
// ============================================================
"use client";
import { controlsFor, defaultValue, isDefault, isMulti, picked } from "@/lib/advanced";

export default function AdvancedPanel({ styleId, settings, onChange, onReset, touched, slots = 1, onNeedSlots }) {
  const controls = controlsFor(styleId);

  const set = (key, value) => onChange({ ...settings, [key]: value });

  // ══ TOGGLING ONE VALUE OF A MULTI CONTROL ══
  //
  // The cap is not arbitrary and it is not four: it is how many of this
  // run's options this particular style will actually receive, which
  // depends on how many styles are selected. Two styles across four
  // options is 2 and 2, so POV can carry two shots there and no more.
  //
  // Rather than refuse the fourth click, ask the page for more options
  // first — same reflex as selecting a fifth style, and the reason the
  // count bumps itself instead of erroring. Only when the ceiling
  // genuinely cannot accommodate it does the button go quiet.
  const toggle = (c, v) => {
    const cur = picked(settings[c.key]);
    if (cur.includes(v)) return set(c.key, cur.filter((x) => x !== v));
    const next = [...cur, v];
    if (next.length > slots && !onNeedSlots?.(next.length)) return;
    set(c.key, next);
  };

  return (
    <div className="adv">
      <div className="adv-head">
        <span className="hint">
          Everything here is optional. Anything left on Default is decided for
          you — and most settings take more than one answer, which spreads them
          across your options.
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
              // middle stop would still be an instruction, so Default has
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
                  {v === -1 ? "Default" : c.stops[v].label}
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
            ) : isMulti(c) ? (
              // Several answers, spread one per option. "Default" is
              // the empty selection rather than an option of its own —
              // clicking the last chosen value off returns to it, so
              // there is no state where nothing is selected AND Default
              // is not showing.
              (() => {
                const on = picked(v);
                return (
                  <div className="adv-opts">
                    <button
                      type="button"
                      className={`adv-opt ${on.length === 0 ? "on" : ""}`}
                      onClick={() => set(c.key, [])}
                    >
                      Default
                    </button>
                    {c.options.filter((o) => o.v !== "auto").map((o) => {
                      const sel = on.includes(o.v);
                      return (
                        <button
                          key={o.v}
                          type="button"
                          className={`adv-opt ${sel ? "on" : ""}`}
                          aria-pressed={sel}
                          onClick={() => toggle(c, o.v)}
                        >
                          {sel && <span className="adv-nth">{on.indexOf(o.v) + 1}</span>}
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                );
              })()
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
            {/* What the selection will actually do. Worth saying out
                loud because the count can go stale underneath it: drop
                a style or lower the option count after choosing three
                answers and the third quietly stops being rendered,
                which is exactly the kind of silent loss the plan
                preview exists to prevent. */}
            {isMulti(c) && picked(v).length > 1 && (
              <span className={`adv-spread ${picked(v).length > slots ? "over" : ""}`}>
                {picked(v).length > slots
                  ? `Only the first ${slots} will be used — this style gets ${slots} of the run's ${slots === 1 ? "option" : "options"}.`
                  : `One each, across ${picked(v).length} of this style's ${slots} options.`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
