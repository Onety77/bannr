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
import { fetchPublic } from "@/lib/safeFetch";

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
      chain: p.chainId,
      source: "DexScreener",
    };
  } catch {
    return null;
  }
}

// Download the logo and hand it back as a PNG data URL.
//
// ══ THIS URL WAS CHOSEN BY WHOEVER MINTED THE TOKEN ══
//
// Which is anybody. A logo URL comes out of on-chain metadata, so
// "fetch this address" is an instruction from a stranger, and a server
// that follows it can be aimed at localhost, at a private address on
// the same network, or at a cloud metadata endpoint. See lib/safeFetch.
//
// The old size check ran AFTER the whole body was in memory, so a
// reply that lied about its length could be any size at all. fetchPublic
// counts while it reads.
//
// limitInputPixels is the other half: five megabytes of PNG can decode
// to gigabytes of bitmap, and sharp will try. The cap is generous for a
// logo and nowhere near enough to hurt.
async function fetchLogo(url) {
  if (!url) return null;
  try {
    const buf = await fetchPublic(url, { maxBytes: 5 * 1024 * 1024, timeoutMs: 12_000 });
    if (!buf) return null;
    const png = await sharp(buf, { limitInputPixels: 40_000_000 })
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
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
    result = await heliusLookup(ca);
    // fill any gaps (or the whole thing, if no Helius key) from DexScreener
    if (!result || !result.imageUrl || !result.name) {
      const dex = await dexscreenerLookup(ca);
      if (dex) {
        result = {
          ...dex,
          ...Object.fromEntries(Object.entries(result || {}).filter(([, v]) => v != null)),
          source: result?.name ? result.source : dex.source,
          imageUrl: result?.imageUrl || dex.imageUrl,
        };
      }
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
    name: result.name,
    symbol: result.symbol,
    description: result.description,
    logo, // data URL or null
  });
}
