// CREATE — the core loop. Brief on the left, proofs on the right.
"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
// Metadata only. lib/templates.js is server-only — importing it here
// would ship every prompt in the product to the browser.
import { STYLES as TEMPLATES, AUTO_ID, AUTO_NAME, distributeStyles } from "@/lib/styles";
import { loadDraft, saveDraft, setInFlight, getInFlight } from "@/lib/draft";
import { saveToHistory, setUser, getRecentCAs, saveRecentCA, shrink, GENERATION_COST, EDIT_COST, REROLL_COST } from "@/lib/credits";
import { saveImage, bannerFilename } from "@/lib/download";
import { useAuth } from "@/lib/useAuth";
import { useProgress } from "@/lib/useProgress";
import ConnectButton, { ConnectNote, WalletSignIn } from "@/components/ConnectButton";
import Lightbox from "@/components/Lightbox";
import StageAura from "@/components/StageAura";
import PostButton from "@/components/PostButton";
import XComingSoon from "@/components/XComingSoon";
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

// Same shapes the lookup route accepts: base58 Solana mints and 0x…
// EVM addresses. Used only to reject an obvious mistype instantly —
// the server still validates properly.
const LOOKS_LIKE_CA = /^([1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40})$/;

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
    if (from.length) return [...new Set(from)];
    // Declared before `saved` below, so it reads the store itself. A
    // URL param still wins, for the same reason it does there.
    const d = params.toString().length === 0 ? loadDraft() : null;
    return d?.styleIds?.length ? d.styleIds : [AUTO_ID];
  });

  // WHAT WAS ALREADY HERE. Read once, synchronously, before any state
  // initialiser below — so the first render is already the restored
  // page rather than an empty one that fills in a frame later.
  //
  // A URL param beats the draft every time: arriving with ?name= or
  // ?style= means a specific brief was asked for, usually History's
  // "re-run this", and silently overriding that with whatever was last
  // typed would be worse than forgetting.
  // Arriving with ?ca= means the address was pasted somewhere else
  // — the homepage, a shared link — and the expectation is a brief
  // that is already filled in. Imported by the effect below.
  const caParam = (params.get("ca") || "").trim();

  const fromUrl = params.toString().length > 0;
  const saved = fromUrl ? null : loadDraft();

  // Re-running from History restores the whole brief, not just the style.
  // The page promises "re-run any brief with one click" and previously
  // delivered only the style selection, silently dropping the name,
  // ticker, tagline and About the card was displaying.
  const preset = useRef({
    name: (params.get("name") || "").slice(0, 60),
    ticker: (params.get("ticker") || "").slice(0, 16),
    tagline: (params.get("tagline") || "").slice(0, 80),
    vibe: (params.get("vibe") || "").slice(0, 400),
    direction: (params.get("direction") || "").slice(0, 240),
  });
  const [variants, setVariants] = useState(() => saved?.variants ?? 3);
  // Per-style advanced overrides: { [styleId]: { key: value } }.
  // Kept for every style, not just selected ones, so toggling a style
  // off and back on does not silently discard what was configured.
  const [advanced, setAdvanced] = useState(() => saved?.advanced ?? {});
  const [expanded, setExpanded] = useState(() => saved?.expanded ?? null); // one panel open at a time
  const [lightbox, setLightbox] = useState(null);
  // The File itself survives, not a copy of it — which is the whole
  // reason this is a module store and not sessionStorage.
  const [logoFile, setLogoFile] = useState(() => saved?.logoFile ?? null);
  // The PREVIEW is rebuilt rather than restored. Its object URL is
  // revoked when this component unmounts (see below), so the one saved
  // on the way out is already dead by the time we come back — it would
  // restore as a broken image. Making a fresh one from the File that
  // did survive is both correct and cheap.
  const [logoPreview, setLogoPreview] = useState(() =>
    saved?.logoFile ? URL.createObjectURL(saved.logoFile) : null
  );
  const [drag, setDrag] = useState(false);
  // True on arrival if a generation is still running from before —
  // see the re-attach effect below.
  const [busy, setBusy] = useState(() => Boolean(getInFlight()));
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null); // "image_flagged" unlocks the reimagine offer
  // Set when a run came back with fewer options than were asked for.
  // Not an error — the banners that arrived are real and usable —
  // but it has to be SAID. Without it the run just looks like it
  // produced less, with no way to tell a fault from the product.
  const [shortfall, setShortfall] = useState(null);
  // Index of the option currently being rerolled, or null.
  const [rerollBusy, setRerollBusy] = useState(null);
  const [results, setResults] = useState(() => (saved?.results?.variants ? saved.results : null));
  // The brief and styles of the run that PRODUCED those results —
  // captured at generation time, because by the time someone hits
  // Download the form may already describe a different token.
  const [runMeta, setRunMeta] = useState(() => saved?.runMeta ?? null);
  const [demoMode, setDemoMode] = useState(() => saved?.demoMode ?? false);
  const [converted, setConverted] = useState(() => saved?.converted ?? {});   // index -> dataUrl
  const [convBusy, setConvBusy] = useState(null);   // index being converted
  const [ca, setCa] = useState(() => saved?.ca ?? "");
  const [caBusy, setCaBusy] = useState(false);
  const [caMsg, setCaMsg] = useState(null);
  // Recent successful lookups, shown under the field on focus. Read
  // lazily (localStorage has no business running during SSR) and
  // re-read after every successful import so the list is never stale.
  const [caRecent, setCaRecent] = useState([]);
  const [caOpen, setCaOpen] = useState(false);
  // Which surface is being designed for. Kept in the draft with
  // everything else, so switching to X and back does not land you on
  // a different tab than the one you left.
  const [surface, setSurface] = useState(() => saved?.surface ?? "dex");
  // Same again: the files survive, the object URLs are remade.
  const [refImages, setRefImages] = useState(() =>
    (saved?.refImages ?? []).map((r) => ({ file: r.file, url: URL.createObjectURL(r.file) }))
  ); // [{ file, url }]
  const fileRef = useRef(null);
  const refsRef = useRef(null);
  const formRef = useRef(saved?.form ? { ...saved.form } : { ...preset.current });
  const [, force] = useState(0);

  // Mirror everything worth keeping into the store, on every change.
  // Cheap: it is one object assignment, and it means leaving the page
  // at any instant preserves exactly what was on screen.
  useEffect(() => {
    saveDraft({
      form: { ...formRef.current },
      surface,
      runMeta,
      styleIds, variants, advanced, expanded,
      logoFile,
      // Object URLs are deliberately NOT stored — they do not survive
      // the unmount that is about to revoke them. The files do, and the
      // URLs are remade on the way back in.
      refImages: refImages.map((r) => ({ file: r.file })),
      results, converted, demoMode, ca,
    });
  });

  // The paste that happened on another page. importCA is a function
  // declaration and so is hoisted — this runs after mount either
  // way. Once, because caParam does not change without a navigation.
  useEffect(() => {
    if (!caParam) return;
    setCa(caParam);
    importCA(caParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caParam]);

  // RE-ATTACH to a generation that was already running when this page
  // was last left. The request was never cancelled — it is the same
  // promise, still in flight — so this receives the result it always
  // would have, rather than the credits being spent on nothing.
  useEffect(() => {
    const running = getInFlight();
    if (!running) return;
    let live = true;
    setBusy(true);
    const collect = () => {
      if (!live) return;
      // The generation wrote its outcome to the store on the way past.
      const d = loadDraft();
      if (d?.results?.variants) {
        setResults(d.results);
        setDemoMode(Boolean(d.demoMode));
        setConverted({});
      }
      setBusy(false);
      auth.refresh(); // the balance moved while we were away
    };
    running.then(collect, collect);
    return () => { live = false; };
  }, []);

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
    formRef.current = {
      name: "", ticker: "", tagline: "", vibe: "",
      // Deliberately preserved. resetBrief clears what describes the
      // TOKEN before a CA import repopulates it; direction describes
      // the BANNER, and someone who asked for "black and white only"
      // still wants that when they paste a second contract.
      direction: formRef.current.direction || "",
    };
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
  // Accepts the address directly: onPaste knows the pasted text
  // before setCa has flushed, and reading state there would fetch the
  // PREVIOUS value.
  async function importCA(addressArg) {
    const addr = String(addressArg ?? ca).trim();
    if (!addr) return;

    // Shape-check first. The server does this too, but catching it
    // here means an obvious mistype never costs a round trip and the
    // feedback is instant.
    if (!LOOKS_LIKE_CA.test(addr)) {
      setCaMsg("That doesn't look like a contract address. Paste a Solana or 0x… address.");
      return;
    }
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
      saveRecentCA(addr, d.name || d.symbol || addr.slice(0, 8));
      setCaRecent(getRecentCAs());
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
    if (!auth.user) return setError("Sign in to generate banners.");
    // Free holder runs count as affordable. Without this the client
    // would refuse a holder with 0 credits and 20 free runs waiting —
    // the server would have allowed it, and the button would simply
    // never fire. The server is still the authority; this only stops
    // an obviously-doomed request leaving the browser.
    if ((auth.user.holderRunsLeft || 0) <= 0 && auth.user.credits < GENERATION_COST)
      return setError(`Not enough credits (need ${GENERATION_COST}). Top up on the credits page.`);

    setBusy(true);
    setResults(null);
    setConverted({});
    setShortfall(null);
    // Clear the stored result at the same moment. Otherwise leaving the
    // page mid-run and coming back would show the PREVIOUS run beside a
    // spinner for the current one.
    saveDraft({ ...(loadDraft() || {}), results: null, converted: {} });

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
        // A session that expired mid-visit came back as a plain error
        // message next to a button that still looked signed in. Clear
        // the stale client state so the sign-in panel returns and the
        // next click actually leads somewhere.
        if (data.code === "signin_required") {
          await auth.refresh();
          setError("Your session expired. Sign in again — nothing was charged.");
          return;
        }
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

      // Written to the store as well as to state, because state
      // belongs to a component that may have been unmounted while this
      // request was in the air. The page that comes back reads it from
      // here — see the re-attach effect. Without this the credits were
      // spent and the banners simply vanished.
      // The store holds the SAME shape the component keeps in state —
      // the whole response, because the render reads results.variants.
      // An earlier version stored just the variants array here, which
      // meant a restore after a tab switch handed the render a shape
      // it would crash on.
      saveDraft({
        ...(loadDraft() || {}),
        results: data,
        demoMode: data.demoMode,
        converted: {},
        runMeta: {
          brief: data.brief,
          styles: (data.styles || [data.template?.id]).filter(Boolean).join(","),
        },
      });
      setDemoMode(data.demoMode);
      setResults(data);
      setShortfall(data.shortfall || null);
      if (data.user) setUser(data.user);

      // NOT saved to history here. A run used to auto-save one entry
      // thumbed with whichever variant happened to be first — so the
      // saved banner was rarely the one the person actually chose, and
      // options nobody wanted were archived while the downloaded one
      // was represented only by its sibling. Saving now happens in
      // download(): the banner you keep is the banner that is kept.
      setRunMeta({
        brief: data.brief,
        styles: (data.styles || [data.template?.id]).filter(Boolean).join(","),
      });
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

  // How many versions of an edited banner are kept, the original
  // included. Every frame is a full-resolution data URL — a few MB —
  // held per variant, so this is a memory ceiling as much as a product
  // decision. An unbounded stack on a phone is a crashed tab, and a
  // crashed tab loses the original too, which is the exact outcome
  // this whole feature exists to prevent.
  const EDIT_HISTORY = 4;

  // Push the version being replaced onto the stack.
  //
  // When the cap is reached the OLDEST EDIT goes (index 1) and never
  // index 0. Every other frame can be reached again by repeating the
  // instruction that produced it. The original cannot be reached again
  // by any means: generation is not deterministic, so re-running the
  // same brief returns a different banner, not that one. It is the one
  // frame in the stack that is genuinely irreplaceable, so it is the
  // one frame that is never dropped.
  function pushPast(v, frame) {
    const past = [...(v.past || []), frame];
    if (past.length > EDIT_HISTORY) past.splice(1, past.length - EDIT_HISTORY);
    return past;
  }

  // Put a kept version back on screen. Shared by undo and revert
  // because everything except WHICH frame to restore is identical —
  // including dropping the X conversion, which was re-framed from art
  // that is no longer what the user is looking at.
  function restoreFrame(idx, frame, past, edits, future = null) {
    setResults((r) => ({
      ...r,
      variants: r.variants.map((v, i) =>
        i === idx
          ? {
              ...v,
              dataUrl: frame.dataUrl,
              bg: frame.bg,
              ...(future ? { future } : {}),
              // Restored only when the frame carried one, so undoing
              // an EDIT leaves the concept alone while undoing a
              // REROLL brings back the thinking that went with the
              // picture being restored.
              ...(frame.concept !== undefined ? { concept: frame.concept } : {}),
              past,
              edits,
            }
          : v
      ),
    }));
    setConverted((c) => {
      const next = { ...c };
      delete next[idx];
      return next;
    });
    setLightbox((lb) =>
      lb && lb.index === idx
        ? {
            ...lb,
            src: frame.dataUrl,
            edits,
            pastCount: past.length,
            ...(future ? { futureCount: future.length } : {}),
            // The image press-and-hold compares against.
            prevSrc: past.length ? past[past.length - 1].dataUrl : null,
          }
        : lb
    );
  }

  // One step back.
  function undoEdit() {
    const idx = lightbox?.index;
    const v = idx == null ? null : results?.variants?.[idx];
    if (!v?.past?.length) return;
    const past = [...v.past];
    const frame = past.pop();
    // An empty stack means we have arrived at index 0, which is the
    // original by construction — so the count is 0 outright rather
    // than decremented. Those differ once the cap has dropped frames:
    // six edits deep with four frames kept, decrementing would leave
    // the original labelled "edited 2×".
    // A frame records the edit count it was taken at. Without that,
    // undoing past a REROLL would report the restored banner's edit
    // count as the rerolled one's — which is 0, because a reroll is
    // a fresh image. Older frames have no count and fall back to the
    // arithmetic that was correct when edits were the only way here.
    const edits = frame.edits != null
      ? frame.edits
      : past.length ? Math.max(0, (v.edits || 0) - 1) : 0;
    // What we are leaving becomes the thing redo comes back to.
    const future = [{ dataUrl: v.dataUrl, bg: v.bg, concept: v.concept, edits: v.edits || 0 }, ...(v.future || [])];
    restoreFrame(idx, frame, past, edits, future);
  }

  // FORWARD AGAIN.
  //
  // Undo without redo is a trap: you look at the old version, decide
  // you preferred the new one, and it is gone — which is exactly the
  // permanence undo existed to remove, moved one step along.
  //
  // The forward stack is cleared by any NEW edit or reroll. Once you
  // branch, the version you had gone back past is not reachable by
  // going forward any more, and pretending otherwise would restore
  // something that no longer follows from what is on screen.
  function redoEdit() {
    const idx = lightbox?.index;
    const v = idx == null ? null : results?.variants?.[idx];
    if (!v?.future?.length) return;
    const future = [...v.future];
    const frame = future.shift();
    const past = pushPast(v, { dataUrl: v.dataUrl, bg: v.bg, concept: v.concept, edits: v.edits || 0 });
    restoreFrame(idx, frame, past, frame.edits ?? v.edits ?? 0, future);
  }

  // All the way back, however many edits deep.
  function revertToOriginal() {
    const idx = lightbox?.index;
    const v = idx == null ? null : results?.variants?.[idx];
    if (!v?.past?.length) return;
    // Everything between here and the original becomes unreachable,
    // forward included — that is what going all the way back means.
    restoreFrame(idx, v.past[0], [], 0, []);
  }

  // Apply a revision to whichever banner the lightbox is showing. The
  // edited result replaces the variant in place so Download and the X
  // Community conversion both operate on what the user is actually
  // looking at — and so a second edit refines the first rather than
  // silently reverting to the original generation.
  //
  // Replacing in place used to be permanent, which made every edit a
  // one-way door: the banner you liked was gone, and no amount of
  // money brought it back, because re-running the brief produces a
  // DIFFERENT banner rather than that one again. The version being
  // replaced is now kept — see pushPast.
  async function applyEdit(instruction, refFiles = []) {
    const idx = lightbox?.index;
    if (idx == null) return { error: "Nothing to edit." };
    if (!auth.user) return { error: "Sign in to edit banners." };
    if (auth.user.freeEditsLeft <= 0 && auth.user.credits < EDIT_COST)
      return { error: "You're out of free edits and credits — top up on the credits page." };

    try {
      const fd = new FormData();
      fd.set("image", results.variants[idx].dataUrl);
      fd.set("instruction", instruction);
      refFiles.forEach((f) => fd.append("refs", f));

      const res = await fetchWithTimeout("/api/edit", { method: "POST", body: fd }, TIMEOUTS.edit);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.code === "signin_required") {
          await auth.refresh();
          return { error: "Your session expired. Sign in again — nothing was charged." };
        }
        return { error: data.error || "The edit failed — you weren't charged." };
      }

      // The server charged (free allowance first, then credits) and
      // returned the resulting balance.
      if (data.user) setUser(data.user);

      setResults((r) => ({
        ...r,
        variants: r.variants.map((v, i) =>
          i === idx
            ? {
                ...v,
                dataUrl: data.dataUrl,
                bg: data.bg,
                edits: (v.edits || 0) + 1,
                past: pushPast(v, { dataUrl: v.dataUrl, bg: v.bg, edits: v.edits || 0 }),
                // Branching. Anything that was ahead of this point
                // no longer follows from what is on screen.
                future: [],
              }
            : v
        ),
      }));
      // Drop any stale X Community conversion — it was made from the
      // pre-edit art and no longer matches what's on screen.
      setConverted((c) => {
        const next = { ...c };
        delete next[idx];
        return next;
      });
      // pastCount is clamped the same way the stack is, so the Undo
      // button never offers a step that pushPast has already dropped.
      setLightbox((lb) => ({
        ...lb,
        src: data.dataUrl,
        edits: (lb.edits || 0) + 1,
        pastCount: Math.min((lb.pastCount || 0) + 1, EDIT_HISTORY),
        // Branched — there is nothing ahead any more.
        futureCount: 0,
        prevSrc: results?.variants?.[idx]?.dataUrl || null,
      }));
      return { ok: true };
    } catch (e) {
      return {
        error: timedOut(e)
          ? "That edit took too long, so we stopped waiting — you weren't charged. Try again."
          : "Network error — you weren't charged. Try again.",
      };
    }
  }

  // ANOTHER OPTION IN THE SAME DIRECTION.
  //
  // The missing verb. Liking one option and wanting a different take
  // on it used to mean regenerating the whole run for 3 credits AND
  // losing the one you liked, because generation is not
  // deterministic and the old set never comes back.
  //
  // Priced like an edit because that is what it is — a refinement of
  // work already paid for. The replaced option goes onto the same
  // undo stack an edit uses, so a reroll you regret is one click
  // back rather than gone.
  async function reroll(i) {
    const v = results?.variants?.[i];
    if (!v || rerollBusy !== null || busy) return;
    if (!auth.user) return setError("Sign in to generate banners.");
    if (auth.user.credits < REROLL_COST)
      return setError(`Not enough credits (need ${REROLL_COST}). Top up on the credits page.`);
    // The run is held in memory, not the logo file that made it — a
    // restored draft can have the banners without the upload.
    if (!logoFile)
      return setError("The original image is no longer loaded — upload it again to make another option.");

    setRerollBusy(i);
    setError(null);
    try {
      const fd = new FormData();
      Object.entries(formRef.current).forEach(([k, val]) => fd.set(k, val));
      // One style — this option's own — and exactly one image.
      fd.set("styles", v.templateId);
      fd.set("variants", "1");
      fd.set("reroll", "1");
      // What NOT to make. Without this the director writes a polite
      // variation of the concept the user just rejected.
      if (v.concept) fd.set("avoidConcept", v.concept);
      const adv = advanced[v.templateId];
      if (adv && Object.keys(adv).length)
        fd.set("advanced", JSON.stringify({ [v.templateId]: adv }));
      fd.set("logo", logoFile);
      refImages.forEach((r) => fd.append("refs", r.file));

      const res = await fetchWithTimeout("/api/generate", { method: "POST", body: fd }, TIMEOUTS.generate);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.code === "signin_required") {
          await auth.refresh();
          setError("Your session expired. Sign in again — nothing was charged.");
          return;
        }
        if (data.user) setUser(data.user); else auth.refresh();
        setError(data.error || "That didn't work — you weren't charged.");
        return;
      }
      const next = data.variants?.[0];
      if (!next) { setError("Nothing came back — you weren't charged."); return; }
      if (data.user) setUser(data.user);

      setResults((r) => ({
        ...r,
        variants: r.variants.map((old, k) =>
          k === i
            ? {
                ...old,
                dataUrl: next.dataUrl,
                bg: next.bg,
                concept: next.concept || "",
                w: next.w, h: next.h,
                // A fresh image carries none of the old one's edits.
                edits: 0,
                past: pushPast(old, {
                  dataUrl: old.dataUrl, bg: old.bg,
                  concept: old.concept, edits: old.edits || 0,
                }),
                future: [],
              }
            : old
        ),
      }));
      // The X conversion was re-framed from art that no longer exists.
      setConverted((c) => { const n = { ...c }; delete n[i]; return n; });
    } catch (e) {
      setError(
        timedOut(e)
          ? "That took too long, so we stopped waiting — you weren't charged. Try again."
          : "Network error — you weren't charged. Try again."
      );
    } finally {
      setRerollBusy(null);
    }
  }

  // Async now: on a phone this opens the native share sheet rather
  // than relying on the `download` attribute, which in-app browsers
  // ignore. See lib/download.js.
  async function download(dataUrl, i, suffix = "") {
    const label = formRef.current.ticker || formRef.current.name || "banner";
    const res = await saveImage(dataUrl, bannerFilename(label, i, suffix));
    // A silent dead button was the original bug — never repeat it.
    if (res.error) { setError(res.error); return; }

    // THE DOWNLOAD IS THE SAVE. Downloading is the one unambiguous
    // signal that a banner mattered to this person, so this is the
    // moment it enters history — the chosen banner, not whichever
    // variant happened to be first in the run.
    //
    // Always the ORIGINAL 1500×500, even when the file being saved is
    // the X conversion: history thumbs are 3:1 and the re-run link
    // reproduces the run, and both belong to the source banner.
    // Failure is swallowed — localStorage quota must never make a
    // successful download look broken.
    try {
      const v = results?.variants?.[i];
      if (v?.dataUrl) {
        await saveToHistory(
          {
            brief: runMeta?.brief || null,
            templateId: runMeta?.styles || "",
            templateName: v.templateName || "",
            // Travels with the banner so posting from My banners
            // later is identical to posting from here.
            concept: v.concept || "",
            // Image-derived, so re-downloading (or downloading the X
            // version after the PNG) never duplicates the card, while
            // an edit — different bytes — saves as its own.
            sig: `${v.dataUrl.length}.${v.dataUrl.slice(1000, 1040)}`,
          },
          v.dataUrl
        );

        // The same click also nominates this banner for the featuring
        // pool the admin curates from. Fire-and-forget: featuring is
        // our concern, not the downloader's, and a failure here must
        // never surface on their download. 900px wide — enough for the
        // hero highlight, a tenth of the bytes of the original.
        const candidate = await shrink(v.dataUrl, 900, 300);
        if (candidate) {
          fetch("/api/spotlight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              src: candidate,
              ticker: runMeta?.brief?.ticker || runMeta?.brief?.name || "",
              template: v.templateName || "",
              sig: `${v.dataUrl.length}.${v.dataUrl.slice(1000, 1040)}`,
            }),
          }).catch(() => {});
        }
      }
    } catch {}
  }

  // Free runs available right now, from the last balance check the
  // server did. Zero when the gate is off, when nothing is linked, or
  // when today's allowance is spent — every one of which correctly
  // means "this run costs credits".
  const freeRuns = auth.user?.holderRunsLeft || 0;

  // A run is about 45s. The button fills as it goes, which answers
  // the one thing a spinner cannot: how far in am I. It fills the
  // BUTTON rather than the option skeletons on purpose — a run does
  // not always return every option, so a bar per skeleton would
  // sometimes fill for a banner that never arrives.
  const runProgress = useProgress(busy, 45_000);

  const nameFor = (id) =>
    id === AUTO_ID ? AUTO_NAME : TEMPLATES.find((t) => t.id === id)?.name || id;

  // Toggling a style off is blocked when it's the last one — a run
  // with no style has no meaning, and silently falling back to Normal
  // would be a surprising reinterpretation of a deselect.
  // THE STYLE PICKER IS CLOSED BY DEFAULT.
  //
  // Default was built to be the one you can trust blind — it reads
  // the project and chooses the register itself — and a grid of
  // seven cards in front of that is a decision nobody asked to
  // make. Someone who wants control is one line away; someone who
  // wants a banner is not asked to have an opinion first.
  //
  // It opens itself whenever the selection is NOT just Default,
  // which covers arriving from the feed's "make one like this",
  // a history re-run, and saved defaults from settings. A chosen
  // style that is invisible looks like a bug.
  // The creative direction field starts closed too, and for the same
  // reason: it is the most useful thing someone CAN say and the
  // thing almost nobody says. Shown as the question alone, it reads
  // as an invitation; shown as an empty textarea with example chips
  // under it, it reads as another box to fill before you are allowed
  // to continue. Open from the start when something is already in it
  // — a re-run, a restored draft — because hiding filled-in text is
  // how instructions get silently dropped.
  const [wantOpen, setWantOpen] = useState(() => Boolean(formRef.current.direction));

  const isDefaultOnly = styleIds.length === 1 && styleIds[0] === AUTO_ID;
  const [stylesOpen, setStylesOpen] = useState(!isDefaultOnly);
  useEffect(() => {
    // Only ever opens. Deselecting back to Default should not close
    // a panel someone deliberately opened.
    if (!isDefaultOnly) setStylesOpen(true);
  }, [isDefaultOnly]);

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
        {/* The X tab carries its own headline and one line of
            promise, so a second subtitle above it is just noise. The
            h1 stays either way — it names the page. */}
        {surface === "dex" && (
          <p>
            {freeRuns > 0
              ? <><b>{freeRuns} free {freeRuns === 1 ? "run" : "runs"} left today</b> as a holder — each one creates {variants} options.</>
              : <>One run costs {GENERATION_COST} credits and creates {variants} options.</>}
          </p>
        )}
      </div>

      {/* Two surfaces, two different design problems. Named by where
          the artwork LANDS rather than what it depicts — an X header is
          also for a token project, so "token banners vs X headers"
          would have implied the second one is not, which is wrong.
          The tabs exist now rather than at launch so the second is
          discoverable while it is still being built. */}
      <div className="surface-tabs" role="tablist" aria-label="What are you designing?">
        <button
          role="tab"
          aria-selected={surface === "dex"}
          className={surface === "dex" ? "on" : ""}
          onClick={() => setSurface("dex")}
        >
          DEX banners
        </button>
        <button
          role="tab"
          aria-selected={surface === "x"}
          className={surface === "x" ? "on" : ""}
          onClick={() => setSurface("x")}
        >
          <span className="tab-x">𝕏</span> headers
          <span className="tab-soon">Soon</span>
        </button>
      </div>

      {surface === "x" && <XComingSoon />}

      <div className="create-grid" hidden={surface !== "dex"}>
        {/* ------------ LEFT: the brief ------------ */}
        <div>
          <div className="panel">
            <h3>Already launched?</h3>
            <div className="ca-row">
              <div className="ca-field">
                <input
                  placeholder="Paste the contract address — Solana, Ethereum, Base, BNB…"
                  value={ca}
                  onChange={(e) => setCa(e.target.value)}
                  onFocus={() => { setCaRecent(getRecentCAs()); setCaOpen(true); }}
                  // Blur closes it — but blur fires BEFORE a click can
                  // land, so the options below use onPointerDown, which
                  // fires before blur does.
                  onBlur={() => setCaOpen(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") importCA();
                    if (e.key === "Escape") setCaOpen(false);
                  }}
                  // Pasting an address IS the intent — there is no
                  // other reason to put one here — so it fetches
                  // immediately rather than waiting for a second tap.
                  onPaste={(e) => {
                    const text = (e.clipboardData?.getData("text") || "").trim();
                    if (!text) return;
                    e.preventDefault();
                    setCa(text);
                    setCaMsg(null);
                    importCA(text);
                  }}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                {caOpen && !caBusy && caRecent.length > 0 && (
                  <div className="ca-recents" role="listbox" aria-label="Recent tokens">
                    {caRecent.map((r) => (
                      <button
                        type="button"
                        key={r.address}
                        role="option"
                        // pointerdown, not click: it fires before the
                        // input's blur, so the list is still mounted
                        // when the choice lands.
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setCaOpen(false);
                          setCa(r.address);
                          setCaMsg(null);
                          importCA(r.address);
                        }}
                      >
                        <b>{r.label}</b>
                        <span className="mono">{r.address.slice(0, 4)}…{r.address.slice(-4)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {ca && !caBusy && (
                  <button
                    type="button"
                    className="ca-clear"
                    aria-label="Clear the contract address"
                    onClick={() => { setCa(""); setCaMsg(null); }}
                  >
                    ✕
                  </button>
                )}
              </div>
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
              they get worked into the banner.
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
              <div className="hint">This decides the whole treatment — the more real, the less generic.</div>
            </div>

            {/* Creative direction. Sits here, in the main brief, rather
                than inside the advanced panel — most people never open
                that, and this is the single most useful thing they can
                tell us. Styled as a highlighted field so it reads as an
                invitation rather than another optional box.

                Kept clearly separate from About above, because the two
                get confused: About is CONTEXT about the project and is
                never rendered; this is an INSTRUCTION about the banner
                and is obeyed. The labels and hints carry that. */}
            <div className="field field-accent">
              {!wantOpen ? (
                <button className="want-reveal" onClick={() => setWantOpen(true)}>
                  <span>
                    What do you want?
                    <span className="tag-opt">optional, but worth it</span>
                  </span>
                  <span className="want-reveal-cta">Tell us</span>
                </button>
              ) : (
                <>
              {/* The "optional, but worth it" tag lives on the
                  COLLAPSED row only. Open, it is answered: you are
                  looking at the field, so being told it is optional
                  says nothing, and on a narrow screen it wrapped to two
                  lines and shoved Hide out of alignment. */}
              <label>
                What do you want?
                <button className="panel-collapse" onClick={() => setWantOpen(false)}>Hide</button>
              </label>
              <textarea
                placeholder="Say it however you like — “make it feel expensive”, “only black and white”, “put the name really big”, “no cartoon characters”…"
                value={formRef.current.direction}
                onChange={(e) => setField("direction", e.target.value)}
                maxLength={240}
                rows={2}
              />
              <div className="chips">
                {["black and white only","make the name huge","lots of empty space","no characters or mascots","feels like a movie poster"].map((ex) => (
                  <button
                    type="button"
                    key={ex}
                    className="chip"
                    // Appends rather than replaces, so tapping two
                    // builds a sentence instead of losing the first.
                    onClick={() => {
                      const cur = formRef.current.direction.trim();
                      if (cur.toLowerCase().includes(ex.toLowerCase())) return;
                      setField("direction", (cur ? cur.replace(/[,.]$/, "") + ", " + ex : ex).slice(0, 240));
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
              <div className="hint">
                Anything you say here outranks the style you pick. Leave it blank and we&rsquo;ll decide for you.
              </div>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            {!stylesOpen ? (
              <button className="style-reveal" onClick={() => setStylesOpen(true)}>
                <span className="style-reveal-now">
                  <b>{AUTO_NAME}</b> — the direction is chosen for you, from your project.
                </span>
                <span className="style-reveal-cta">Pick a style instead</span>
              </button>
            ) : (
              <>
            <div className="panel-head">
              <h3>Style</h3>
              <span className="hint">Pick as many as you like</span>
              {/* Expanding was one-way. A control that opens and
                  cannot close reads as a mistake. */}
              <button className="panel-collapse" onClick={() => setStylesOpen(false)}>
                Hide
              </button>
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
              </>
            )}
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

            {shortfall && (
              <div className="notice">
                {shortfall.made} of {shortfall.asked} options came back this time.
                {shortfall.refunded > 0
                  ? ` You've been refunded ${shortfall.refunded} credit${shortfall.refunded === 1 ? "" : "s"} for the ${shortfall.asked - shortfall.made === 1 ? "one" : "ones"} that didn't.`
                  : " Usually a busy moment on our side — try again in a minute for the full set."}
              </div>
            )}
            {/* Escalation ladder, one rung per failure. Each stage
                offers only what hasn't been tried, so the user never
                sees a button they've already watched fail. Keeping
                their own image is always the first thing offered. */}
            {!busy && errorCode === "stage_nudge" && (
              <div className="notice-actions">
                <button className="btn small primary" onClick={() => setInFlight(generate("nudge"))}>
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
                <button className="btn small primary" onClick={() => setInFlight(generate("reimagine"))}>
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
                <ConnectButton auth={auth} size="" block label="Sign in to generate" />
                <WalletSignIn auth={auth} />
                <ConnectNote auth={auth} />
              </>
            ) : (
              /* NOT onClick={generate}: that would pass the click event
                 into the assist parameter, and a truthy event would
                 silently restyle every user's logo. */
              <button
                className={`btn primary block gen-btn${busy ? " is-running" : ""}`}
                disabled={busy}
                aria-busy={busy}
                style={{ "--p": runProgress }}
                onClick={() => setInFlight(generate())}
              >
                <span className="gen-fill" aria-hidden="true" />
                <span className="gen-label">
                {busy
                  ? (<><span className="spinner" /> Creating {variants} options…</>)
                  : freeRuns > 0
                    ? (<>Generate — free ({freeRuns} left today)</>)
                    : (<>Generate — {GENERATION_COST} credits</>)}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ------------ RIGHT: proofs ------------ */}
        {/* Sticky, because the brief on the left is several panels tall
            and this column was one short box followed by a void. It now
            follows you down instead of scrolling away. */}
        <div className="proofs">
          {demoMode && results && (
            <div className="notice">
              PREVIEW MODE — sample backgrounds are shown below. Full generation isn't live on this build yet.
            </div>
          )}
          {/* The idle state now shows the SHAPE of the run rather than
              one empty rectangle: one ghost frame per option, labelled
              with the style that option will actually use. Same layout
              the results arrive in, so nothing jumps when they do — and
              it answers "what am I about to get for three credits"
              before the money is spent. */}
          {!results && !busy && (
            <div className="results">
              {plan.slice(0, Math.max(variants, styleIds.length)).map((styleId, i) => {
                const tpl = TEMPLATES.find((t) => t.id === styleId);
                return (
                  <div className="result ghost" key={i}>
                    <div className="ghost-canvas">
                      {tpl?.thumb ? (
                        <img src={`/styles/${tpl.thumb}`} alt="" aria-hidden="true" />
                      ) : null}
                      <span className="ghost-dims">1500 × 500</span>
                    </div>
                    <div className="bar">
                      <span className="mode">
                        OPTION {i + 1} · <b>{nameFor(styleId)}</b>
                      </span>
                      <span className="hint">{i === 0 ? "exact DEX Screener size" : ""}</span>
                    </div>
                  </div>
                );
              })}
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
                          pastCount: (v.past || []).length,
                          futureCount: (v.future || []).length,
                          prevSrc: (v.past || []).length
                            ? v.past[v.past.length - 1].dataUrl
                            : null,
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
                      disabled={rerollBusy !== null || busy}
                      onClick={() => reroll(i)}
                      title="Another take on this one, same style — the director is told not to repeat this concept"
                    >
                      {rerollBusy === i
                        ? <span className="spinner" />
                        : <>Another · {REROLL_COST} credit</>}
                    </button>
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
                    {/* Publishing is its own act, never a side effect
                        of downloading — see components/PostButton. */}
                    <PostButton
                      variant={v}
                      brief={runMeta?.brief}
                      defaultCa={ca}
                      signedIn={Boolean(auth.user)}
                      onSignInNeeded={() => setError("Sign in to post to the feed.")}
                    />
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
      {/* onDownload is resolved from live state for generated banners
          rather than from the closure captured when the viewer opened.
          That closure held the dataUrl as it was AT THE MOMENT OF THE
          CLICK, so downloading from the viewer after an edit handed
          over the pre-edit image — while history, which already read
          from state, saved the edited one. Two different banners from
          one button. An X conversion has no index and keeps its own
          dl, which is correct: it is never edited in place. */}
      <Lightbox
        item={lightbox}
        onClose={() => setLightbox(null)}
        onDownload={
          lightbox?.index != null
            ? () => {
                const cur = results?.variants?.[lightbox.index];
                if (cur) download(cur.dataUrl, lightbox.index);
              }
            : lightbox?.dl
        }
        onEdit={lightbox?.editable ? applyEdit : null}
        onUndo={lightbox?.editable ? undoEdit : null}
        onRedo={lightbox?.editable ? redoEdit : null}
        onRevert={lightbox?.editable ? revertToOriginal : null}
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
