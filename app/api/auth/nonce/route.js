// POST /api/auth/nonce — step 1 of wallet sign-in.
// Issues a single-use, 5-minute nonce and returns the exact message
// the wallet must sign. The client never composes that message
// itself: if it did, the two sides could drift and every signature
// would fail verification for reasons nobody could see.
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { issueNonce, buildSignInMessage } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { wallet } = await req.json();
    // Reject anything that isn't a real address before it reaches
    // storage — otherwise this endpoint is a free write primitive.
    try {
      new PublicKey(String(wallet));
    } catch {
      return NextResponse.json({ error: "That isn't a valid Solana address." }, { status: 400 });
    }

    const nonce = await issueNonce(wallet);
    return NextResponse.json({ ok: true, nonce, message: buildSignInMessage(wallet, nonce) });
  } catch (err) {
    console.error("[auth/nonce]", err);
    return NextResponse.json({ error: "Could not start sign-in. Try again." }, { status: 500 });
  }
}
