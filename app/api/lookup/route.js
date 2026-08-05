// ============================================================
// GET /api/lookup?ca=<address> — token import for launched coins.
// Detects the chain from the address format, then:
//   Solana → Helius DAS getAsset (on-chain metadata: works even
//            for coins that never touched DexScreener), enriched
//            by DexScreener if fields are missing.
//   EVM    → DexScreener (covers Ethereum, Base, BNB, etc. and
//            tells us which chain the token actually lives on).
// The logo is downloaded server-side and returned as a data URL
// so the client can drop it straight into the logo slot (no CORS).
// ============================================================

import sharp from "sharp";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;

async function fetchWithTimeout(url, opts = {}, ms = 10_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function heliusLookup(mint) {
  const rpc = process.env.HELIUS_RPC_URL;
  if (!rpc) return null;
  try {
    const res = await fetchWithTimeout(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "bannr", method: "getAsset", params: { id: mint } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data?.result;
    if (!a) return null;
    const meta = a.content?.metadata || {};
    const image =
      a.content?.links?.image ||
      a.content?.files?.find((f) => /image/i.test(f.mime || ""))?.uri ||
      null;
    return {
      name: meta.name?.trim() || null,
      symbol: meta.symbol?.trim() || null,
      description: meta.description?.trim() || null,
      imageUrl: image,
      chain: "solana",
      source: "on-chain metadata",
    };
  } catch {
    return null;
  }
}

async function dexscreenerLookup(addr) {
  try {
    const res = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pairs = (data?.pairs || []).filter(
      (p) => p.baseToken?.address?.toLowerCase() === addr.toLowerCase()
    );
    if (!pairs.length) return null;
    // most liquid pair wins when the address exists on several chains
    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const p = pairs[0];
    return {
      name: p.baseToken.name?.trim() || null,
      symbol: p.baseToken.symbol?.trim() || null,
      description: null, // not exposed on this endpoint
      imageUrl: p.info?.imageUrl || null,
      // THE BANNER THEY ALREADY HAVE. DexScreener serves the current
      // header at exactly the size we generate, and we were already
      // calling this endpoint for the name and the logo — it was
      // sitting in the response the whole time.
      //
      // Absent for most tokens, and that absence is information too:
      // a project with no header has nothing to lose by trying one.
      header: p.info?.header || null,
      chain: p.chainId,
      source: "DexScreener",
    };
  } catch {
    return null;
  }
}

// Download the logo and hand it back as a PNG data URL (≤ ~5MB in).
async function fetchLogo(url) {
  if (!url) return null;
  try {
    const res = await fetchWithTimeout(url, {}, 12_000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return null;
    const png = await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req) {
  const ca = (new URL(req.url).searchParams.get("ca") || "").trim();

  let kind = null;
  if (EVM_RE.test(ca)) kind = "evm";
  else if (SOL_RE.test(ca)) kind = "solana";
  if (!kind) {
    return NextResponse.json(
      { ok: false, error: "That doesn't look like a valid contract address (Solana or 0x…)." },
      { status: 400 }
    );
  }

  let result = null;
  if (kind === "solana") {
    // BOTH, in parallel. Helius has the better metadata and no idea
    // what the token page looks like; the existing header only exists
    // on DexScreener. This used to skip DexScreener whenever Helius
    // answered completely, which is exactly when a real project with a
    // real banner would have been skipped.
    const [helius, dex] = await Promise.all([heliusLookup(ca), dexscreenerLookup(ca)]);
    result = helius;
    if (dex) {
      result = {
        ...dex,
        ...Object.fromEntries(Object.entries(helius || {}).filter(([, v]) => v != null)),
        source: helius?.name ? helius.source : dex.source,
        imageUrl: helius?.imageUrl || dex.imageUrl,
        // Only DexScreener knows this one.
        header: dex.header || null,
      };
    }
  } else {
    result = await dexscreenerLookup(ca);
  }

  if (!result || (!result.name && !result.symbol)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          kind === "solana"
            ? "Couldn't find metadata for this token yet. If it just launched, try again in a minute — or fill the fields manually."
            : "Couldn't find this token on any indexed chain yet. If it just launched, try again once it has a liquidity pair — or fill the fields manually.",
      },
      { status: 404 }
    );
  }

  const logo = await fetchLogo(result.imageUrl);

  return NextResponse.json({
    ok: true,
    chain: result.chain,
    source: result.source,
    // What is on their token page right now, if anything.
    header: result.header || null,
    name: result.name,
    symbol: result.symbol,
    description: result.description,
    logo, // data URL or null
  });
}
