// /token — a server shell around the view, and it exists for one
// reason: THE UNFURL.
//
// This page's job is to be pasted. Into a tweet, into the token's
// socials, into a Telegram group where someone is deciding whether to
// buy. A link that arrives as a bare URL with the generic site card
// has already lost most of what it was for.
//
// So the numbers go in the preview itself. Someone scrolling past
// reads "12 SOL of banner sales bought back and burned" without ever
// opening it — which is the claim, made in the one place it will
// actually be seen.
//
// The view is a client component because it fetches and renders a
// live ledger; metadata can only be exported from a server one, hence
// the split.
import TokenView from "@/components/TokenView";
import { ledger, productRevenue } from "@/lib/buybacks";
import { getGate, publicGate } from "@/lib/tokenGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const big = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0).replace(/\.0$/, "") + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(v % 1_000 ? 1 : 0).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
};
const sol = (n) => Number(n || 0).toFixed(Number(n) >= 10 ? 0 : 2).replace(/\.00$/, "");

export async function generateMetadata() {
  let symbol = "BANNR";
  let description =
    "Banner sales and trading fees buy the token back and burn it. Every transaction on-chain.";

  try {
    const [{ totals, entries }, revenue, gate] = await Promise.all([
      ledger(100),
      productRevenue(),
      getGate(),
    ]);
    symbol = publicGate(gate).symbol || symbol;

    if (entries.length) {
      const burned = (totals.product.burned || 0) + (totals.fees.burned || 0);
      const spent = (totals.product.sol || 0) + (totals.fees.sol || 0);
      // The product line is named separately even here, because it is
      // the whole argument — anyone can buy back with trading fees.
      const fromBanners = totals.product.sol
        ? ` ${sol(totals.product.sol)} SOL of that came from banners people bought.`
        : "";
      description =
        `${big(burned)} $${symbol} burned, ${sol(spent)} SOL spent buying it back.${fromBanners}` +
        (revenue.count ? ` ${revenue.count} banner purchases so far.` : "") +
        " Every transaction on-chain.";
    }
  } catch {
    // The page still renders; it just unfurls with the standing line.
  }

  // Names only what we actually do. "Where the money goes" claimed to
  // account for all of it, and we account for the part we buy back.
  const title = `$${symbol} — buybacks and burns`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function TokenPage() {
  return <TokenView />;
}
