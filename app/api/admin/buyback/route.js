// POST /api/admin/buyback  — log one, by signature
// DELETE                    — remove one that was logged in error
//
// The amounts are never sent by the caller. A signature goes in, the
// chain is read, and the SOL and token figures come back from the
// transaction itself. Admin-only, but that is not what makes the
// numbers trustworthy — being unable to type them is.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { record, remove, ledger, inspect } from "@/lib/buybacks";
import { getGate } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// With ?sig= this READS a transaction without recording it, so the
// form can show what it understood before anything is committed. The
// admin sees "swap — 6.0 SOL → 1.4M" and knows it was read correctly,
// rather than finding out from the list afterwards.
export async function GET(req) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sig = (url.searchParams.get("sig") || "").trim();
  if (!sig) return NextResponse.json(await ledger(200));

  const gate = await getGate();
  const found = await inspect(sig, { mint: gate.mint, wallet: walletFor(url.searchParams.get("source")) });
  if (!found.ok) return NextResponse.json({ error: found.error }, { status: 400 });

  // Already logged is not an error — it is the answer to "did I do
  // this one already", which is the other thing someone pasting a
  // signature twice wants to know.
  const { entries } = await ledger(200);
  const already = entries.some((e) => e.signature === found.signature);
  return NextResponse.json({ ...found, already });
}

// Product buybacks come from the treasury, fee buybacks from the dev
// wallet. Which one spent the SOL is what separates the two lines, so
// it is decided here rather than by the caller naming an address.
function walletFor(source) {
  return source === "fees"
    ? process.env.DEV_WALLET || process.env.NEXT_PUBLIC_DEV_WALLET || ""
    : process.env.NEXT_PUBLIC_TREASURY_WALLET || "";
}

export async function POST(req) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body = {};
  try { body = await req.json(); } catch {}

  const gate = await getGate();
  const out = await record({
    signature: String(body.signature || ""),
    source: String(body.source || "product"),
    // The mint comes from the gate config, not the request — one place
    // decides which token this project is, and a typo here would file
    // a buyback of something else entirely.
    mint: gate.mint,
    // Which wallet spent the SOL — the same rule the preview used, so
    // what was shown is what gets recorded.
    wallet: walletFor(body.source),
  });

  if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ok: true, entry: out.entry, ...(await ledger(200)) });
}

export async function DELETE(req) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch {}
  await remove(String(body.signature || ""));
  return NextResponse.json({ ok: true, ...(await ledger(200)) });
}
