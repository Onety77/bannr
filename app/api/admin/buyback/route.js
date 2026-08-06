// POST /api/admin/buyback  — log one, by signature
// DELETE                    — remove one that was logged in error
//
// The amounts are never sent by the caller. A signature goes in, the
// chain is read, and the SOL and token figures come back from the
// transaction itself. Admin-only, but that is not what makes the
// numbers trustworthy — being unable to type them is.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { record, remove, ledger } from "@/lib/buybacks";
import { getGate } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await ledger(200));
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
    // Which wallet spent the SOL. Product buybacks come from the
    // treasury, fee buybacks from the dev wallet — they are different
    // addresses, which is what lets the two lines be counted apart
    // without anyone having to remember which was which.
    wallet:
      body.source === "fees"
        ? process.env.DEV_WALLET || process.env.NEXT_PUBLIC_DEV_WALLET || ""
        : process.env.NEXT_PUBLIC_TREASURY_WALLET || "",
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
