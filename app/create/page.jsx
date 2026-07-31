// CREATE — the core loop. Brief on the left, proofs on the right.
"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TEMPLATES, AUTO_ID, AUTO_NAME, distributeStyles } from "@/lib/templates";
import { saveToHistory, setUser, GENERATION_COST, EDIT_COST } from "@/lib/credits";
import { useAuth } from "@/lib/useAuth";
import ConnectButton, { ConnectNote } from "@/components/ConnectButton";
import Lightbox from "@/components/Lightbox";
import StageAura from "@/components/StageAura";
import AdvancedPanel from "@/components/AdvancedPanel";
import { countTouched } from "@/lib/advanced";

// A generation takes ~45s. Rather than hold a dead spinner for that
// long, narrate what the model is actually doing — reading the brief,
// picking a direction, composing, lighting. Each skeleton card runs
// this list at its own offset so the options feel like they're being
// worked on independently, which they are (they generate in parallel).
const PHASES = [
  "Reading the brief…",
  "Studying your logo…",
  "Finding the story…",
  "Choosing a direction…",
  "Blocking out the composition…",
  "Setting the light…",
  "Painting in detail…",
  "Placing the type…",
  "Final pass…",
];

// Hard ceilings on every request. Without one, a hung connection
// spins the loading animation indefinitely: the server gives up at
// its own maxDuration (120s), but a dropped connection produces no
// event on the client at all, so nothing would ever end the wait.
// Generation/edit sit just above the server's limit so the server's
// own honest "took too long" copy wins whenever it can still reply.
const TIMEOUTS = { generate: 125_000, edit: 125_000, convert: 60_000, lookup: 25_000 };

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// An aborted request and a genuinely broken connection are different
// things and deserve different copy — "we stopped waiting" is honest,
// "network error" would be a guess.
const timedOut = (e) => e?.name === "AbortError";

function CreateInner() {
  const params = useSearchParams();
  // Multiple styles per run. Order matters: distributeStyles() gives
  // the remainder to the earliest-selected, so the first style picked
  // is the one that doubles up first.
  // ?style= accepts a comma-separated list so History's "re-run" link
  // restores the whole selection, not just the first one.
  const [styleIds, setStyleIds] = useState(() => {
    const from = (params.get("style") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((id) => id === AUTO_ID || TEMPLATES.some((t) => t.id === id));
    return from.length ? [...new Set(from)] : [AUTO_ID];
  });

  // Re-running from History restores the whole brief, not just the style.
  // The page promises "re-run any brief with one click" and previously
  // delivered only the style selection, silently dropping the name,
  // ticker, tagline and About the card was displaying.
  const preset = useRef({
    name: (params.get("name") || "").slice(0, 60),
    ticker: (params.get("ticker") || "").slice(0, 16),
    tagline: (params.get("tagline") || "").slice(0, 80),
    vibe: (params.get("vibe") || "").slice(0, 400),
  });
  const [variants, setVariants] = useState(3);
  // Per-style advanced overrides: { [styleId]: { key: value } }.
  // Kept for every style, not just selected ones, so toggling a style
  // off and back on does not silently discard what was configured.
  const [advanced, setAdvanced] = useState({});
  const [expanded, setExpanded] = useState(null); // one panel open at a time
  const [lightbox, setLightbox] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null); // "image_flagged" unlocks the reimagine offer
  const [results, setResults] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [converted, setConverted] = useState({});   // index -> dataUrl
  const [convBusy, setConvBusy] = useState(null);   // index being converted
  const [ca, setCa] = useState("");
  const [caBusy, setCaBusy] = useState(false);
  const [caMsg, setCaMsg] = useState(null);
  const [refImages, setRefImages] = useState([]); // [{ file, url }]
  const fileRef = useRef(null);
  const refsRef = useRef(null);
  const formRef = useRef({ ...preset.current });
  const [, force] = useState(0);

  // Advances only while a generation is in flight; resets after, so the
  // next run always starts the narration from the top.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!busy) return setPhase(0);
    const t = setInterval(() => setPhase((p) => p + 1), 4200);
    return () => clearInterval(t);
  }, [busy]);

  // Balances come from the session, which the nav also reads — so the
  // credit count here and in the nav are the same number, not two
  // guesses that can drift apart.
  const auth = useAuth();

  // Saved preferences from /settings — style defaults, and which
  // styles/count to start on. Applied ONCE and never over a URL param,
  // since arriving from History's "re-run" means a specific brief was
  // asked for. The brief itself is deliberately NOT saved: people make
  // banners for many projects, so a prefilled name is wrong more often
  // than it's right.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!auth.user || hydrated.current) return;
    hydrated.current = true;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        const d = await res.json();
        if (!d.ok) return;
        const s = d.settings || {};

        if (s.defaults && Object.keys(s.defaults).length) setAdvanced(s.defaults);

        // Only if the visitor didn't arrive with a style in the URL and
        // hasn't touched the picker.
        const urlHadStyle = Boolean(params.get("style"));
        if (!urlHadStyle && s.styles?.length) {
          setStyleIds(s.styles);
          if (s.variants) setVariants(Math.max(s.variants, s.styles.length));
        } else if (!urlHadStyle && s.variants) {
          setVariants(s.variants);
        }
      } catch {}
    })();
  }, [auth.user, params]);

  useEffect(() => () => logoPreview && URL.revokeObjectURL(logoPreview), [logoPreview]);
  useEffect(() => () => refImages.forEach((r) => URL.revokeObjectURL(r.url)), [refImages]);

  function onFile(f) {
    if (!f) return;
    setLogoFile(f);
    setLogoPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return URL.createObjectURL(f);
    });
  }

  function setField(k, v) {
    formRef.current[k] = v;
    force((x) => x + 1);
  }

  function addRefs(files) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setRefImages((prev) =>
      [...prev, ...list.map((f) => ({ file: f, url: URL.createObjectURL(f) }))].slice(0, 3)
    );
  }

  function removeRef(i) {
    setRefImages((prev) => {
      URL.revokeObjectURL(prev[i]?.url);
      return prev.filter((_, k) => k !== i);
    });
  }

  // Clear every field that describes a specific token. Used before a
  // CA import repopulates them — see the note at the call site.
  function resetBrief() {
    formRef.current = { name: "", ticker: "", tagline: "", vibe: "" };
    setLogoFile(null);
    setLogoPreview((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setRefImages((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.url));
      return [];
    });
    force((x) => x + 1);
  }

  // "Already launched" import: paste a CA, we fetch name/ticker/
  // logo/description from on-chain metadata or DexScreener.
  async function importCA() {
    const addr = ca.trim();
    if (!addr) return;
    setCaBusy(true);
    setCaMsg(null);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/lookup?ca=${encodeURIComponent(addr)}`, {}, TIMEOUTS.lookup);
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setCaMsg(d.error || "Lookup failed — try again or fill the fields manually.");
        return;
      }
      // A CA import means "this is a different token now", so every
      // field describing the previous one is wiped first rather than
      // left to linger. Only fields the lookup actually returns get
      // repopulated — anything it can't find is left genuinely empty,
      // because silently inheriting the last token's tagline, About or
      // reference art would quietly poison the next banner's brief.
      resetBrief();
      if (d.name) setField("name", d.name.slice(0, 60));
      if (d.symbol) setField("ticker", (d.symbol.startsWith("$") ? d.symbol : "$" + d.symbol).slice(0, 16));
      if (d.description) setField("vibe", d.description.slice(0, 400));
      // Isolated on purpose: this hits a third-party URL from the
      // token's own metadata — very often a slow or dead IPFS gateway.
      // A hang here would previously stall the whole import, and a
      // failure would report "network error" even though the name,
      // ticker and description had already imported fine.
      let gotLogo = false;
      if (d.logo) {
        try {
          const img = await fetchWithTimeout(d.logo, {}, TIMEOUTS.lookup);
          if (img.ok) {
            onFile(new File([await img.blob()], "logo.png", { type: "image/png" }));
            gotLogo = true;
          }
        } catch {}
      }
      setCaMsg(
        `Imported ${d.name || d.symbol}.` +
          (gotLogo ? "" : " Couldn't fetch a logo — upload one below.") +
          (d.description ? "" : " Add a short About to steer the style.")
      );
    } catch (e) {
      setCaMsg(
        timedOut(e)
          ? "That lookup took too long — try again, or fill the fields in manually."
          : "Network error during lookup — try again."
      );
    } finally {
      setCaBusy(false);
    }
  }

  // `assist` escalates only by explicit user choice, one rung at a
  // time: "" → "nudge" (keep their image, ask for illustration over
  // photo) → "reimagine" (stop preserving the image). It must never
  // be set implicitly — reimagining someone's logo uninvited would be
  // a worse failure than the refusal it's trying to fix.
  async function generate(assist = "") {
    setError(null);
    setErrorCode(null);
    const { name } = formRef.current;
    if (!name.trim()) return setError("Coin name is required — it's the one thing every banner needs.");
    if (!logoFile) return setError("A logo or pfp is required — the banner is built around it.");
    if (!auth.user) return setError("Connect your wallet to generate banners.");
    if (auth.user.credits < GENERATION_COST)
      return setError(`Not enough credits (need ${GENERATION_COST}). Top up on the credits page.`);

    setBusy(true);
    setResults(null);
    setConverted({});

    try {
      const fd = new FormData();
      Object.entries(formRef.current).forEach(([k, v]) => fd.set(k, v));
      fd.set("styles", styleIds.join(","));
      // Only the selected styles ride along — settings left over from a
      // style that is no longer picked would be dead weight in the
      // payload and confusing in the server log.
      const advForRun = Object.fromEntries(
        styleIds.map((id) => [id, advanced[id]]).filter(([, v]) => v && Object.keys(v).length)
      );
      if (Object.keys(advForRun).length) fd.set("advanced", JSON.stringify(advForRun));
      fd.set("variants", String(variants));
      fd.set("logo", logoFile); // always present — checked above
      if (assist) fd.set("assist", assist);
      refImages.forEach((r) => fd.append("refs", r.file));

      const res = await fetchWithTimeout("/api/generate", { method: "POST", body: fd }, TIMEOUTS.generate);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        // The server refunds; we only re-read the balance so the UI
        // reflects what actually happened rather than assuming.
        if (data.user) setUser(data.user); else auth.refresh();
        setError(data.error || "Generation failed — credits refunded.");
        // Advance the offer one rung past whatever just failed, so we
        // never re-offer an option the user has already watched fail.
        const code = data.code || null;
        const contentIssue = code === "policy_options" || code === "image_flagged";
        setErrorCode(
          contentIssue && assist === "reimagine" ? "stage_exhausted"
          : contentIssue && assist === "nudge" ? "stage_reimagine"
          : contentIssue ? "stage_nudge"
          : code
        );
        return;
      }

      setDemoMode(data.demoMode);
      setResults(data);
      if (data.user) setUser(data.user);

      // Deliberately outside the network try/catch below. History is a
      // convenience, and localStorage can legitimately fail (quota) —
      // letting that surface as "Network error, credits refunded"
      // would be a lie about a run that actually succeeded, and would
      // hand back credits that were properly spent.
      try {
        // Summarised from the variants actually returned rather than
        // from what was requested — if a style's option failed, history
        // should reflect what exists, not what was asked for.
        const produced = [...new Set(data.variants.map((v) => v.templateName))];
        await saveToHistory(
          {
            brief: data.brief,
            // Comma-separated so the re-run link restores every style.
            templateId: (data.styles || [data.template?.id]).filter(Boolean).join(","),
            templateName: produced
              .map((n) => {
                const c = data.variants.filter((v) => v.templateName === n).length;
                return c > 1 ? `${n} ×${c}` : n;
              })
              .join(" · "),
            variantCount: data.variants.length,
          },
          data.variants[0].dataUrl
        );
      } catch {}
    } catch (e) {
      // A dropped connection can't tell us whether the server charged
      // or refunded, so ask rather than guess.
      auth.refresh();
      setError(
        timedOut(e)
          ? "That took too long, so we stopped waiting — credits refunded. Please try again."
          : "Network error — credits refunded. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  // X Community conversions are free and unlimited — no credits,
  // no daily cap. Anyone generating a banner gets this for nothing.
  async function convertX(v, i) {
    setError(null);
    setConvBusy(i);
    try {
      const fd = new FormData();
      fd.set("bg", v.bg);
      fd.set("templateId", v.templateId);
      fd.set("textMode", v.textMode);
      fd.set("name", formRef.current.name);
      fd.set("ticker", formRef.current.ticker);
      fd.set("tagline", formRef.current.tagline);
      if (logoFile) fd.set("logo", logoFile);
      const res = await fetchWithTimeout("/api/convert", { method: "POST", body: fd }, TIMEOUTS.convert);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Conversion failed — try again.");
        return;
      }
      setConverted((c) => ({ ...c, [i]: data.dataUrl }));
    } catch (e) {
      setError(timedOut(e) ? "That took too long, so we stopped waiting — try again." : "Network error — try again.");
    } finally {
      setConvBusy(null);
    }
  }

  // Apply a revision to whichever banner the lightbox is showing. The
  // edited result replaces the variant in place so Download and the X
  // Community conversion both operate on what the user is actually
  // looking at — and so a second edit refines the first rather than
  // silently reverting to the original generation.
  async function applyEdit(instruction, refFiles = []) {
    const idx = lightbox?.index;
    if (idx == null) return { error: "Nothing to edit." };
    if (!auth.user) return { error: "Connect your wallet to edit banners." };
    if (auth.user.freeEditsLeft <= 0 && auth.user.credits < EDIT_COST)
      return { error: "You're out of free edits and credits — top up on the credits page." };

    try {
      const fd = new FormData();
      fd.set("image", results.variants[idx].dataUrl);
      fd.set("instruction", instruction);
      refFiles.forEach((f) => fd.append("refs", f));

      const res = await fetchWithTimeout("/api/edit", { method: "POST", body: fd }, TIMEOUTS.edit);
      const data = await res.json();
      if (!res.ok || !data.ok) return { error: data.error || "The edit failed — you weren't charged." };

      // The server charged (free allowance first, then credits) and
      // returned the resulting balance.
      if (data.user) setUser(data.user);

      setResults((r) => ({
        ...r,
        variants: r.variants.map((v, i) =>
          i === idx ? { ...v, dataUrl: data.dataUrl, bg: data.bg, edits: (v.edits || 0) + 1 } : v
        ),
      }));
      // Drop any stale X Community conversion — it was made from the
      // pre-edit art and no longer matches what's on screen.
      setConverted((c) => {
        const next = { ...c };
        delete next[idx];
        return next;
      });
      setLightbox((lb) => ({ ...lb, src: data.dataUrl, edits: (lb.edits || 0) + 1 }));
      return { ok: true };
    } catch (e) {
      return {
        error: timedOut(e)
          ? "That edit took too long, so we stopped waiting — you weren't charged. Try again."
          : "Network error — you weren't charged. Try again.",
      };
    }
  }

  function download(dataUrl, i, suffix = "") {
    const a = document.createElement("a");
    a.href = dataUrl;
    const t = (formRef.current.ticker || formRef.current.name || "banner").replace(/[^a-z0-9$ ]/gi, "").replace(/ /g, "-");
    a.download = `bannr-${t}-v${i + 1}${suffix}.png`;
    a.click();
  }

  const nameFor = (id) =>
    id === AUTO_ID ? AUTO_NAME : TEMPLATES.find((t) => t.id === id)?.name || id;

  // Toggling a style off is blocked when it's the last one — a run
  // with no style has no meaning, and silently falling back to Normal
  // would be a surprising reinterpretation of a deselect.
  function toggleStyle(id) {
    setStyleIds((prev) => {
      if (!prev.includes(id)) return [...prev, id];
      return prev.length === 1 ? prev : prev.filter((s) => s !== id);
    });
  }

  // The options floor: every selected style must appear at least once.
  // Bumping the count up automatically is friendlier than refusing to
  // generate, and matches the server's own clamp.
  useEffect(() => {
    if (variants < styleIds.length) setVariants(Math.min(styleIds.length, 4));
  }, [styleIds, variants]);

  // Exactly what the run will produce — same helper the server uses,
  // so this preview can't drift from reality.
  const plan = distributeStyles(styleIds, Math.max(variants, styleIds.length));
  const planSummary = [...new Set(plan)]
    .map((id) => {
      const n = plan.filter((s) => s === id).length;
      return n > 1 ? `${nameFor(id)} ×${n}` : nameFor(id);
    })
    .join(" · ");

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>Create</h1>
        <p>One run costs {GENERATION_COST} credits and creates {variants} options.</p>
      </div>

      <div className="create-grid">
        {/* ------------ LEFT: the brief ------------ */}
        <div>
          <div className="panel">
            <h3>Already launched?</h3>
            <div className="ca-row">
              <input
                placeholder="Paste the contract address — Solana, Ethereum, Base, BNB…"
                value={ca}
                onChange={(e) => setCa(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && importCA()}
                spellCheck={false}
              />
              <button className="btn small primary" disabled={caBusy || !ca.trim()} onClick={importCA}>
                {caBusy ? <span className="spinner" /> : "Fetch"}
              </button>
            </div>
            <div className="hint">
              Name, ticker, logo and description fill themselves. Everything stays editable.
            </div>
            {caMsg && <div className="hint ca-msg">{caMsg}</div>}
          </div>

          <div className="panel">
            <h3>Assets *</h3>
            <div
              className={`dropzone ${drag ? "drag" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="Your logo" />
                  <div>{logoFile.name} — click to replace</div>
                </>
              ) : (
                <div>
                  Drop your logo or mascot here
                  <div className="hint">PNG, JPG or WEBP · required — the banner is built around it</div>
                </div>
              )}
              <input
                ref={fileRef} type="file" hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>

            <span className="refs-label">
              Supporting images <span>· optional, up to 3</span>
            </span>
            <div className="hint">
              More art of your character, background shots, mood references —
              the AI works them into the banner.
            </div>
            <div className="refs-grid">
              {refImages.map((r, i) => (
                <div className="ref-thumb" key={r.url}>
                  <img src={r.url} alt={`Reference ${i + 1}`} />
                  <button onClick={() => removeRef(i)} aria-label={`Remove reference ${i + 1}`}>✕</button>
                </div>
              ))}
              {refImages.length < 3 && (
                <button className="ref-add" onClick={() => refsRef.current?.click()} aria-label="Add supporting image">
                  +
                </button>
              )}
              <input
                ref={refsRef} type="file" hidden multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => { addRefs(e.target.files); e.target.value = ""; }}
              />
            </div>
          </div>

          <div className="panel">
            <h3>Coin info</h3>
            <div className="field">
              <label>Coin name *</label>
              <input
                placeholder="Moonsoon"
                value={formRef.current.name}
                onChange={(e) => setField("name", e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="field">
              <label>Ticker</label>
              <input
                placeholder="$MOONSOON"
                value={formRef.current.ticker}
                onChange={(e) => setField("ticker", e.target.value)}
                maxLength={16}
              />
            </div>
            <div className="field">
              <label>Tagline</label>
              <input
                placeholder="the storm before the pump"
                value={formRef.current.tagline}
                onChange={(e) => setField("tagline", e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="field">
              <label>About</label>
              <textarea
                placeholder="What is this project? e.g. a cat astronaut meme coin, a serious L2 infra project, a community token for night owls…"
                value={formRef.current.vibe}
                onChange={(e) => setField("vibe", e.target.value)}
                maxLength={400}
              />
              <div className="hint">This is what the AI reads to decide the whole treatment — the more real, the less generic.</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Style</h3>
              <span className="hint">Pick as many as you like</span>
            </div>
            <div className="style-grid">
              <div className={`style-slot ${expanded === AUTO_ID ? "open" : ""}`}>
                <button
                  className={`style-card ${styleIds.includes(AUTO_ID) ? "selected" : ""}`}
                  onClick={() => toggleStyle(AUTO_ID)}
                  aria-pressed={styleIds.includes(AUTO_ID)}
                >
                  <div
                    className="style-thumb"
                    style={{ background: "linear-gradient(120deg, #7C5CFF, #2FD98B, #FFB020)" }}
                  />
                  <div className="meta">
                    <b>{AUTO_NAME}</b>
                    <span>full creative freedom, no fixed category</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="adv-toggle"
                  aria-expanded={expanded === AUTO_ID}
                  onClick={() => setExpanded((e) => (e === AUTO_ID ? null : AUTO_ID))}
                >
                  Advanced
                  {countTouched(AUTO_ID, advanced[AUTO_ID]) > 0 && (
                    <span className="adv-count">{countTouched(AUTO_ID, advanced[AUTO_ID])}</span>
                  )}
                  <span className="adv-caret" aria-hidden="true">›</span>
                </button>
                {expanded === AUTO_ID && (
                  <AdvancedPanel
                    styleId={AUTO_ID}
                    settings={advanced[AUTO_ID] || {}}
                    touched={countTouched(AUTO_ID, advanced[AUTO_ID])}
                    onChange={(next) => setAdvanced((a) => ({ ...a, [AUTO_ID]: next }))}
                    onReset={() =>
                      setAdvanced((a) => {
                        const next = { ...a };
                        delete next[AUTO_ID];
                        return next;
                      })
                    }
                  />
                )}
              </div>
              {TEMPLATES.map((t) => {
                const on = styleIds.includes(t.id);
                const touched = countTouched(t.id, advanced[t.id]);
                return (
                  <div className={`style-slot ${expanded === t.id ? "open" : ""}`} key={t.id}>
                    <button
                      className={`style-card ${on ? "selected" : ""}`}
                      onClick={() => toggleStyle(t.id)}
                      aria-pressed={on}
                    >
                      {/* The thumbnail sits UNDER a same-accent gradient,
                          so a style whose preview image isn't in
                          public/styles/ yet still renders as a clean
                          coloured tile instead of a broken-image icon. */}
                      <div
                        className="style-thumb"
                        style={{ background: `linear-gradient(120deg, ${t.accent}, #0a0b0c 90%)` }}
                      >
                        {t.thumb && (
                          <img
                            src={`/styles/${t.thumb}`}
                            alt=""
                            loading="lazy"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        )}
                      </div>
                      <div className="meta"><b>{t.name}</b><span>{t.tagline}</span></div>
                    </button>

                    {/* Sibling, not a child — the card itself is a
                        <button> and buttons can't nest. */}
                    <button
                      type="button"
                      className="adv-toggle"
                      aria-expanded={expanded === t.id}
                      onClick={() => setExpanded((e) => (e === t.id ? null : t.id))}
                    >
                      Advanced
                      {touched > 0 && <span className="adv-count">{touched}</span>}
                      <span className="adv-caret" aria-hidden="true">›</span>
                    </button>

                    {expanded === t.id && (
                      <AdvancedPanel
                        styleId={t.id}
                        settings={advanced[t.id] || {}}
                        touched={touched}
                        onChange={(next) => setAdvanced((a) => ({ ...a, [t.id]: next }))}
                        onReset={() =>
                          setAdvanced((a) => {
                            const next = { ...a };
                            delete next[t.id];
                            return next;
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Options per run</h3>
              <span className="hint">{planSummary}</span>
            </div>
            <div className="variant-picker">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={variants === n ? "on" : ""}
                  // Can't ask for fewer options than styles chosen —
                  // one of them would never get generated.
                  disabled={n < styleIds.length}
                  title={n < styleIds.length ? `You've picked ${styleIds.length} styles` : undefined}
                  onClick={() => setVariants(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            {styleIds.length > 1 && (
              <p className="hint variant-note">
                {styleIds.length} styles selected, so at least {styleIds.length} options.
                Extras go to whichever you picked first.
              </p>
            )}
          </div>

          <div className="run-bar">
            {error && <div className="notice error">{error}</div>}
            {/* Escalation ladder, one rung per failure. Each stage
                offers only what hasn't been tried, so the user never
                sees a button they've already watched fail. Keeping
                their own image is always the first thing offered. */}
            {!busy && errorCode === "stage_nudge" && (
              <div className="notice-actions">
                <button className="btn small primary" onClick={() => generate("nudge")}>
                  Try again with my image — {GENERATION_COST} credits
                </button>
                <button className="btn small" onClick={() => fileRef.current?.click()}>
                  Use a different image
                </button>
                <span className="notice-hint">
                  We&apos;ll re-run it with extra guidance that keeps your image but asks for
                  an illustrated take rather than a photo-real one.
                </span>
              </div>
            )}
            {!busy && errorCode === "stage_reimagine" && (
              <div className="notice-actions">
                <button className="btn small primary" onClick={() => generate("reimagine")}>
                  Reimagine my image — {GENERATION_COST} credits
                </button>
                <button className="btn small" onClick={() => fileRef.current?.click()}>
                  Use a different image
                </button>
                <span className="notice-hint">
                  Redraws your subject from scratch in a fresh art style — still recognisably
                  yours, but an original illustration rather than a copy.
                </span>
              </div>
            )}
            {!busy && errorCode === "stage_exhausted" && (
              <div className="notice-actions">
                <button className="btn small primary" onClick={() => fileRef.current?.click()}>
                  Use a different image
                </button>
              </div>
            )}
            {/* Signed out: sign in IS the call to action. The brief
                above stays filled in, so nothing is lost by connecting
                at this point rather than before starting. */}
            {!auth.loading && !auth.user ? (
              <>
                <ConnectButton auth={auth} size="" block label="Connect wallet to generate" />
                <ConnectNote auth={auth} />
              </>
            ) : (
              /* NOT onClick={generate}: that would pass the click event
                 into the assist parameter, and a truthy event would
                 silently restyle every user's logo. */
              <button className="btn primary block" disabled={busy} onClick={() => generate()}>
                {busy
                  ? (<><span className="spinner" /> Creating {variants} options…</>)
                  : (<>Generate — {GENERATION_COST} credits</>)}
              </button>
            )}
          </div>
        </div>

        {/* ------------ RIGHT: proofs ------------ */}
        <div>
          {demoMode && results && (
            <div className="notice">
              PREVIEW MODE — sample backgrounds are shown below. Full generation isn't live on this build yet.
            </div>
          )}
          {!results && !busy && (
            <div className="empty-canvas">
              <div>
                <div className="dims">1500 × 500</div>
                <div className="sub">
                  Your {Math.max(variants, styleIds.length)} options land here — exact DEX Screener
                  dimensions, ready to upload.
                </div>
              </div>
            </div>
          )}
          {busy && (
            <div className="results">
              {Array.from({ length: variants }, (_, i) => (
                <div className="result skel" key={i}>
                  <div className="skel-canvas">
                    <StageAura />
                  </div>
                  <div className="bar">
                    <span className="mode">
                      OPTION {i + 1} · <b>{nameFor(plan[i]) || "…"}</b>
                    </span>
                    <span className="skel-phase">
                      <span className="spinner" />
                      {PHASES[(phase + i) % PHASES.length]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {results && (
            <div className="results">
              {results.variants.map((v, i) => (
                <div className="result" key={i}>
                  {/* The finished art develops beneath the same aura the
                      skeleton was running, which then dissolves — so the
                      wait and the arrival are one continuous surface. */}
                  <div className="result-shot">
                    <img
                      className="zoomable"
                      src={v.dataUrl}
                      alt={`Banner option ${i + 1}`}
                      title="Click to view full size"
                      onClick={() =>
                        setLightbox({
                          key: `v${i}`,
                          index: i,
                          editable: true,
                          src: v.dataUrl,
                          alt: `Banner option ${i + 1}`,
                          w: v.w,
                          h: v.h,
                          edits: v.edits || 0,
                          label: `Option ${i + 1} · ${v.templateName}`,
                          dl: () => download(v.dataUrl, i),
                        })
                      }
                    />
                    <StageAura done />
                  </div>
                  <div className="bar">
                    <span className="mode">
                      OPTION {i + 1} · <b>{v.templateName}</b>
                    </span>
                    <button
                      className="btn small"
                      disabled={convBusy === i}
                      onClick={() => convertX(v, i)}
                      title="Re-frame this banner for X Communities (1300×500) — free, no limit"
                    >
                      {convBusy === i ? <span className="spinner" /> : "X Community 1300×500"}
                    </button>
                    <button className="btn small primary" onClick={() => download(v.dataUrl, i)}>
                      Download PNG
                    </button>
                  </div>
                  {converted[i] && (
                    <div className="xconv">
                      <img
                        className="zoomable"
                        src={converted[i]}
                        alt={`X Community banner option ${i + 1}`}
                        title="Click to view full size"
                        onClick={() =>
                          setLightbox({
                            key: `x${i}`,
                            src: converted[i],
                            alt: `X Community banner option ${i + 1}`,
                            ticker: formRef.current.ticker || formRef.current.name,
                            w: 1300,
                            h: 500,
                            label: `Option ${i + 1} · X Community`,
                            dl: () => download(converted[i], i, "-xcom-1300x500"),
                          })
                        }
                      />
                      <div className="bar">
                        <span className="mode">X COMMUNITY · <b>1300 × 500</b> · re-framed, not cropped</span>
                        <button className="btn small primary" onClick={() => download(converted[i], i, "-xcom-1300x500")}>
                          Download PNG
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* onEdit is passed only for generated banners — an X Community
          conversion is derived art, so editing it would be overwritten
          the moment it's re-converted from its source. */}
      <Lightbox
        item={lightbox}
        onClose={() => setLightbox(null)}
        onDownload={lightbox?.dl}
        onEdit={lightbox?.editable ? applyEdit : null}
        editInfo={{
          free: auth.user?.freeEditsLeft ?? 0,
          cost: EDIT_COST,
          can: Boolean(auth.user) && (auth.user.freeEditsLeft > 0 || auth.user.credits >= EDIT_COST),
        }}
      />
    </main>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateInner />
    </Suspense>
  );
}
