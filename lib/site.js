// ============================================================
// SITE CONFIG — edit these once, they update everywhere.
// Icons are matched by `id` in components/Socials.jsx.
// ============================================================

// The token's contract address.
//
// It also lives in the gate config, which is where the app READS it —
// balances, tiers and the public CA display all come from Firestore,
// not from here. This copy exists for one job: building the chart
// link below without making the footer read the database on every
// page render.
//
// If the two ever disagree, the gate is right and this is stale.
export const MINT = "4PQZkUhQrCrB3fNpxj5kv4u6y4kh3zyv7jZ5FziLpump";

// ══ A PLACEHOLDER IS NOT A LINK ══
//
// Anything whose URL still contains "your-" is a slot nobody has
// filled in, and Socials refuses to render it. Two of these shipped
// as `your-community-id` and `your-token-address` and would have been
// live, clickable 404s on launch day — the kind of thing everyone
// sees and nobody reports.
//
// So an unfinished entry costs an icon rather than credibility. Fill
// it in and it appears; there is nothing else to switch on.
export const SOCIALS = [
  { id: "x",         label: "X",           url: "https://x.com/get_bannr" },
  { id: "telegram",  label: "Telegram",    url: "https://t.me/bannrdotfun" },
  { id: "community", label: "X Community", url: "https://x.com/i/communities/your-community-id" },
  { id: "chart",     label: "Chart",       url: `https://dexscreener.com/solana/${MINT}` },
];

/** The ones actually worth showing — see the note above. */
export function liveSocials() {
  return SOCIALS.filter((s) => s.url && !s.url.includes("your-"));
}
