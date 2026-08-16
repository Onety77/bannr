// ============================================================
// GET /api/admin/launch — is this thing ready, and what is missing.
//
// A launch checklist lived in NEXT-ACTIONS.md, and a checklist in a
// markdown file has one failure mode: it goes stale and nobody
// notices, because nothing connects it to the running system. Half of
// that file described a gate shape that no longer exists by the time
// anyone read it.
//
// This reads the real config and the real environment instead, so it
// cannot describe a system other than the one deployed.
//
// ══ IT REPORTS PRESENCE, NEVER VALUES ══
//
// Every environment check is `Boolean(process.env.X)` and what crosses
// the wire is `true`. No key, no secret, no wallet address, not even a
// masked prefix — an admin session is a Google account, and a page
// that renders secrets is one screenshot away from leaking them. The
// question here is only ever "is it set".
//
// Admin-verified on every call, like every other /api/admin route.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { COST_PER_RUN } from "@/app/api/admin/token/route";
import { getAdminDb, getAdminBucket } from "@/lib/firebaseAdmin";
import { getGate, entryBar } from "@/lib/tokenGate";
import { commitment } from "@/lib/buybacks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// blocker      costs money or breaks silently if wrong. Fix first.
// launch       must be true before the token is announced.
// later        worth doing, nothing breaks today.
const BLOCKER = "blocker";
const LAUNCH = "launch";
const LATER = "later";

export async function GET(req) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gate = await getGate({ fresh: true });
  const db = getAdminDb();
  const bar = entryBar(gate);

  // Has a product buyback ever been recorded? The checklist item is
  // "do one BEFORE announcing /token" — a counter reading zero
  // advertises that the flywheel exists and is not turning.
  let buybacks = 0;
  try {
    const snap = await db?.collection("buybacks").limit(5).get();
    buybacks = snap?.size || 0;
  } catch {}

  const promise = gate.buybackPct > 0 ? await commitment(gate.buybackPct, gate.buybackEverySol) : null;

  const items = [
    // ---- the money taps, first ----
    {
      id: "ceiling",
      severity: BLOCKER,
      label: "Daily ceiling on free runs",
      ok: gate.dailyGlobalRuns > 0,
      detail:
        gate.dailyGlobalRuns > 0
          // COST_PER_RUN, imported rather than repeated — this line
          // carried its own copy of 0.081 and would have gone on
          // quoting it after the real figure was corrected.
          ? `${gate.dailyGlobalRuns.toLocaleString("en-US")} runs a day, about $${(gate.dailyGlobalRuns * COST_PER_RUN).toFixed(0)}`
          : "Unlimited. Every signed-in account gets a free run a day and nothing caps the total.",
      fix: "Token tab → Limits → Daily ceiling across everyone",
    },
    {
      id: "openai",
      severity: BLOCKER,
      label: "Image provider key",
      ok: Boolean(process.env.OPENAI_API_KEY),
      detail: process.env.OPENAI_API_KEY
        ? "Set. The hard spend cap is set in their billing console and cannot be read from here — check it yourself."
        : "Missing. Every generation falls back to demo backgrounds.",
      fix: "Vercel → Environment Variables → OPENAI_API_KEY",
    },
    {
      id: "rpc",
      severity: BLOCKER,
      label: "Helius RPC",
      ok: Boolean(process.env.HELIUS_RPC_URL),
      // The specific failure this catches is nasty: balance reads fall
      // back to a rate-limited public endpoint, resolve to "not
      // qualified", and nobody ever gets a tier — with no error
      // anywhere on the site.
      detail: process.env.HELIUS_RPC_URL
        ? "Set."
        : "Missing. Balance reads fall back to a public endpoint, everyone resolves to no tier, and nothing errors.",
      fix: "Vercel → Environment Variables → HELIUS_RPC_URL",
    },

    // ---- payments ----
    {
      id: "treasury",
      severity: BLOCKER,
      label: "Treasury wallet",
      ok: Boolean(process.env.NEXT_PUBLIC_TREASURY_WALLET),
      detail: process.env.NEXT_PUBLIC_TREASURY_WALLET ? "Set." : "Missing. Nobody can buy credits.",
      fix: "Vercel → Environment Variables → NEXT_PUBLIC_TREASURY_WALLET",
    },
    {
      id: "webhook",
      severity: LAUNCH,
      label: "Payment webhook",
      ok: Boolean(process.env.HELIUS_WEBHOOK_AUTH),
      detail: process.env.HELIUS_WEBHOOK_AUTH
        ? "Set. Point it at /api/webhooks/helius on the live domain."
        : "Missing. The backstop for a closed tab or a hand-sent transfer is off.",
      fix: "Vercel → HELIUS_WEBHOOK_AUTH, then the URL in the Helius dashboard",
    },
    {
      id: "firestore",
      severity: BLOCKER,
      label: "Firestore admin",
      ok: Boolean(db),
      detail: db ? "Connected." : "Not configured. Accounts, credits and history are all in memory.",
      fix: "Vercel → FIREBASE_SERVICE_ACCOUNT_JSON, pasted as one line",
    },
    {
      id: "storage",
      severity: LAUNCH,
      label: "Banner archive",
      ok: Boolean(getAdminBucket()),
      // Off, downloads still work perfectly — the banner just stops
      // being re-downloadable later, and nothing anywhere says so.
      // Exactly the kind of silent absence this panel exists for.
      detail: getAdminBucket()
        ? "On. Downloaded banners are kept and can be re-downloaded from My banners."
        : "Off. Downloads work, but a banner stops existing once the tab closes — and nothing errors.",
      fix: "Firebase → Storage → Get started, then Vercel → NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    },
    {
      id: "site",
      severity: LAUNCH,
      label: "Site URL",
      ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
      detail: process.env.NEXT_PUBLIC_SITE_URL
        ? "Set. Shared links resolve against it."
        : "Unset. Open Graph images resolve against whatever host the platform reports, which may not be the real one.",
      fix: "Vercel → NEXT_PUBLIC_SITE_URL, then redeploy",
    },

    // ---- the ladder ----
    {
      id: "mint",
      severity: LAUNCH,
      label: "Contract address",
      ok: Boolean(gate.mint),
      detail: gate.mint ? "Set." : "Not set. The tiers cannot be armed without it.",
      fix: "Token tab → The token → Contract address",
    },
    {
      id: "thresholds",
      severity: LAUNCH,
      label: "Tier thresholds",
      ok: bar > 0,
      detail:
        bar > 0
          ? `${gate.tiers.map((t) => t.minTokens.toLocaleString("en-US")).join(" · ")}`
          : "All zero. A threshold of 0 is unset, and the tiers will not arm.",
      fix: "Token tab → the three rungs → set each from a dollar value",
    },
    {
      id: "tiers",
      severity: LAUNCH,
      label: "Holder tiers live",
      ok: gate.enabled,
      detail: gate.enabled ? "On." : "Off. Everyone is on the free tier and nobody gets a discount.",
      fix: "Token tab → The holder tiers are live",
    },
    {
      id: "rehearsal",
      severity: BLOCKER,
      label: "Gate rehearsed against a real balance",
      // Nothing can prove this from here — it is the one item that is
      // a judgement rather than a reading, and it is left visibly
      // unanswerable rather than guessed at.
      ok: null,
      detail:
        "Point the gate at a token you already hold, set a threshold below your balance, and generate. None of the tier code has ever run against a real wallet.",
      fix: "Token tab → paste any mint you hold → arm → /create",
    },

    // ---- the promise ----
    {
      id: "buybackPct",
      severity: LAUNCH,
      label: "Buyback commitment",
      ok: gate.buybackPct > 0,
      detail:
        gate.buybackPct > 0
          ? `${gate.buybackPct}% of banner revenue, flagged every ${gate.buybackEverySol} SOL earned.`
          : "Not published. /token says nothing about buybacks.",
      fix: "Token tab → % of banner revenue to buybacks",
    },
    {
      id: "firstBuyback",
      severity: LAUNCH,
      label: "First buyback done before announcing",
      ok: buybacks > 0,
      detail:
        buybacks > 0
          ? `${buybacks} logged.`
          : "None logged. A counter reading zero advertises that the flywheel exists and is not turning.",
      fix: "Money tab → paste the swap and the burn",
    },
    {
      id: "announced",
      severity: LAUNCH,
      label: "Contract address published",
      ok: gate.announced,
      // Last on purpose, and the copy says why: this is the switch
      // that makes everything above visible to strangers.
      detail: gate.announced
        ? "Public."
        : "Withheld. Turn this on LAST — it is what publishes the address.",
      fix: "Token tab → Show the contract address publicly",
    },

    // ---- housekeeping ----
    {
      id: "maturity",
      severity: LATER,
      label: "Hold-for hours",
      ok: gate.maturityHours > 0,
      detail:
        gate.maturityHours > 0
          ? `${gate.maturityHours}h.`
          : "Off. One bag can be walked between fresh wallets to farm a tier per account; the ceiling is then the only protection.",
      fix: "Token tab → Limits → Hold-for hours",
    },
  ];

  const blockers = items.filter((i) => i.severity === BLOCKER && i.ok === false).length;
  const unknown = items.filter((i) => i.ok === null).length;
  const remaining = items.filter((i) => i.ok === false).length;

  return NextResponse.json({
    items,
    counts: { blockers, unknown, remaining, total: items.length },
    promise,
  });
}
