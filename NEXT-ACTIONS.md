# BANNR — NEXT ACTIONS

Working list. Ordered by what actually matters: **the banners have to be right
first.** Everything below Phase 1 is plumbing for a product nobody wants until
the output is good.

Items have IDs (A1, B3…) so they can be picked off individually. Nothing here is
in progress unless it says so.

---

## PHASE 0 — FIREBASE SETUP (do any time, ~30 min)

Not banner work, but it unblocks three things that are currently
**invisible rather than broken**. The code for all three is written and
correct; it silently no-ops because Firestore isn't configured:

- `/admin7731` — can't even sign in ("Firebase client isn't configured yet")
- The refusal log — records nowhere, so **B4 can't be measured**
- The homepage hero + fresh wall — has been running on the in-memory
  fallback this whole time, not real moderated data

**State of `.env.local` right now:** only `OPENAI_API_KEY` is filled in.
Every other variable is empty. (The Helius and treasury vars are Phase 3
— ignore them for now.)

- **S1** — Create a Firebase project at console.firebase.google.com
- **S2** — Enable **Firestore Database** (production mode is fine)
- **S3** — Add a Web App in project settings, copy its config, and fill the
  five `NEXT_PUBLIC_FIREBASE_*` vars in `.env.local`
- **S4** — Authentication → Sign-in method → enable **Google**
- **S5** — Project settings → Service accounts → Generate new private key.
  Paste the whole JSON **as one line** into `FIREBASE_SERVICE_ACCOUNT_JSON`
- **S6** — Set `ADMIN_EMAIL` in `lib/admin.js` to the Google account you'll
  sign in with. Any other account is rejected client-side *and* by every
  admin API route
- **S7** — Restart `npm run dev` (env changes need a restart), then confirm
  sign-in works at `/admin7731`
- **S8** — First time `/api/spotlight` runs against real data it will log a
  "query requires an index" error with a console link. Click it once to
  create the composite index — permanent after that
- **S9** — Confirm the refusal log works: force a refusal, then check the
  **Refused briefs** tab on `/admin7731`

---

## PHASE 1 — BANNER QUALITY

The product. Nothing else ships until this is settled.

### A. Style tuning

Only **Auto** has been tuned. The other five `mood` strings in
`lib/templates.js` are still the original one-liners and have never been tested
against the current doctrine.

- **A1** — Tune **Neon Degen** (`neon-degen`) mood + test 3–4 real briefs
- **A2** — Tune **Clean Pro** (`clean-pro`) — the "real team" look, hardest to
  keep from going generic corporate
- **A3** — Tune **Retro Pixel** (`retro-pixel`) — pixel art fights the
  doctrine's "cinematic and premium" language; may need a doctrine carve-out
- **A4** — Tune **Cartoon Mascot** (`cartoon-mascot`)
- **A5** — Tune **Dark Minimal** (`dark-minimal`) — "restraint as the statement"
  vs the doctrine's "never boring" is a real tension, needs resolving
- **A6** — Decide whether each style should override parts of the doctrine, or
  only add a mood note on top of it (currently: mood note only)
- **A7** — Build a fixed test set of 5 briefs (meme coin, infra project, animal
  mascot, abstract/no-mascot, long-name project) and run every style against
  the same set so styles are compared, not vibes

### B. Doctrine / prompt work

- **B1** — **Ticker rule is contradicted.** Doctrine says "in most cases display
  only the project's full name and ignore the ticker entirely", but the ticker
  renders nearly every time. Fix by demoting it in the TEXT block, not by
  editing the doctrine again
- **B2** — Tune `VARIANT_SEASONING` (4 entries, first is empty). Decide whether
  the 2–4 options in a run should feel like a **set** or be maximally different
- **B3** — Typography: no font is bundled; the model picks. Decide if that's
  acceptable or if certain styles need named typeface families in the prompt
- **B4** — Test how often crypto briefs trip content policy, and soften the
  brief-handling if refusals are common. Refusals are now logged with the
  exact brief that caused them and surfaced on `/admin7731` → **Refused
  briefs**, including a "what these briefs have in common" word ranking.
  **Requires Phase 0 first** — without Firestore nothing is recorded
- **B5** — Decide `quality: "medium"` vs `"high"` — worth re-testing now that
  per-image cost dropped ~62% moving to gpt-image-2
- **B6** — Decide whether the About should ever be allowed to contribute text
  (currently: never rendered, context only)

### C. Real-world input testing

Every test so far used a flat green circle as the logo. **None of this is
validated against real inputs.**

- **C1** — Test with real project logos: vector marks, detailed mascots,
  photographic logos, text-only logos
- **C2** — Test transparent PNGs (currently flattened onto white before send —
  may be wrong for dark banners)
- **C3** — Test very small logos (old favicons, 128×128) — upscale floor exists
  but output quality is unverified
- **C4** — Test extreme aspect-ratio logos (very wide wordmarks, very tall)
- **C5** — Test long project names, names with emoji, non-Latin names
- **C6** — Test the no-ticker, no-tagline, no-About path (name + logo only)
- **C7** — Verify logo identity actually survives — the doctrine demands
  recognisability; confirm it holds on real marks

### D. Output & format

- **D1** — Check whether DEX Screener overlays UI on top of the banner. If it
  does, that's a hard safe-area constraint the prompt doesn't know about
- **D2** — Verify legibility at the size DEX Screener actually displays banners
  (they render small — text that reads at 1500px may not at display size)
- **D3** — X Community conversion currently **crops** the 3:1 down to 1300×500.
  Consider re-rendering natively instead (1296×496 is divisible by 16)
- **D4** — Decide the full size lineup — is 1500×500 the only deliverable?

### E. Editing quality

- **E1** — Edits re-render from the downscaled 1500×500, then upscale back to
  1536×512. Keeping the native 1536×512 from generation removes the resample
  and stops repeated edits compounding loss (measured: ~12% softer per pass)
- **E2** — Test the hardened edit prompt against harder cases: adding an element
  to a full composition, removing the focal subject, changing a style wholesale
- **E3** — Test reference-image edits — does attached art get re-illustrated in
  the banner's style, or does it still look pasted?
- **E4** — Consider an undo / revert-to-original, since edits currently replace
  the variant in place with no way back

### F. Demo mode decision

- **F1** — Demo mode (`lib/engine/compose.js`, `lib/engine/backgrounds.js`,
  and all `layout`/`text` data in `lib/templates.js`) is a whole second
  rendering path that no longer resembles the real product. **Decide: keep it
  as a zero-config showcase, or delete it.** It is currently dead weight that
  every future change has to stay compatible with

---

## PHASE 2 — SIGN IN / ACCOUNTS

**Wallet sign-in is BUILT and verified end to end** — 18 e2e tests pass
against real Firestore, plus 15 crypto unit tests covering forgery,
replay, tampering and expiry.

**REVISED — accounts are no longer wallets.** The original decision here
was "wallet-only, no email, no multi-wallet". That fused three separate
things together: who you are, how you sign in, and how you pay. It meant
changing wallet lost your credits, and that you had to install an
extension before you could even look at the product — which filters out
most of the marketing and design people who actually buy banners.

Decisions now: an **account** is its own record with an opaque id.
Identities point at it (`identities/{type}:{id}`), and **Google leads**,
because it works in any browser on any phone with no extension. Wallet
sign-in stays as the second option. Free credits are granted **once per
ACCOUNT**, so adding a second sign-in method never re-grants. Sign-in is
still required to generate or edit.

Paying needs **no wallet linking at all**: the transaction carries the
account id as an SPL memo, so any wallet can pay for any account and
nobody else can claim it. See `/api/pay/claim`.

Done: G1 sign-in · G2 identities (replaces "wallet linking") · G3
sessions · G4 credits to Firestore · G6 daily edit allowance to the
account · G7 (guest credits no longer exist) · G11 Google sign-in ·
G12 connect-and-pay.

Remaining:

- **G5** — Migrate history to the account. Still localStorage, and it
  holds full-resolution data URLs — this needs Firebase Storage, not
  Firestore documents. Decide J1 first
- **G8** — Account page: balance, wallet, billing history with Solscan
  links (the data is already in `payments/{signature}`)
- **G9** — Set a Firestore **TTL policy on `nonces.expires`** — one
  setting in the console. Consumed nonces delete themselves, but a user
  who closes the wallet popup leaves one behind forever
- **G10** — Delete `/api/dev/grant` before launch. It is guarded by
  `NODE_ENV`, but the safest guard is the route not existing
- **G14** — Paste `firestore.rules` and `storage.rules` into the Firebase
  console. Both deny all client access, which is correct — no browser code
  touches Firestore or Storage, and the Admin SDK bypasses rules. Until this
  is done, a permissive test-mode rule would let anyone set their own credits

---

## PHASE 3 — PAYMENTS

- ~~**H1** — Server-side debiting~~ — **DONE.** Both routes now charge the
  signed-in account inside a Firestore transaction before any paid API call,
  and refund server-side on failure. The client can no longer decide what it
  can afford. (Original note kept below for context.)
- **H1 (was)** — Generation and edits must debit the account
  server-side. Today the client decides what it can afford — anyone can set
  their own balance from the console
- **H2** — Close the webhook loop end to end: pay → Helius → credited → visible
- **H3** — Claim flow for `status: "unclaimed"` payments. Far rarer now that
  `/api/pay/claim` attributes payments directly, but still the recovery path
  for SOL sent by hand to the treasury address. The 3 such records today are
  all seeded test data
- **H4** — Test the idempotency path — replay the same signature, confirm no
  double-credit
- **H5** — Validate pack pricing against measured cost (~$0.073/run at 3
  variants; margin currently ~95%)
- **H6** — Decide how to handle SOL price swings — packs are priced in SOL,
  costs are in USD. A 50% SOL drop halves the margin
- **H7** — Decide refund policy for failed generations (credits are refunded
  client-side today; needs to be server-side)
- **H8** — Set `FREE_EDITS_PER_DAY` — currently 10 (~$0.25/day/user at cost,
  unenforceable). Recommended: 3

---

## PHASE 4 — INFRASTRUCTURE / SAFETY

- **I1** — **`git init` + first commit.** No version control exists. Highest
  value-per-minute item on this entire list
- **I2** — Rate limiting is an in-memory `Map`. On Vercel each invocation can be
  a fresh instance, so **it effectively won't exist in production.** Move to
  Upstash or Firestore
- **I3** — Daily spend ceiling + alerting on the OpenAI account
- **I4** — Internal cost dashboard — cost per run, per day, per user
- **I5** — Error reporting (Sentry or equivalent) — currently `console.error`
- **I6** — Staging environment, so testing stops running against production keys
- **I7** — Rotate the OpenAI key before launch — it has been used in local shell
  commands during development
- **I8** — Confirm `.env.local` is gitignored before the first commit (it is
  listed, but verify after `git init`)
- **I9** — Abuse guards: the edit endpoint accepts any image, so it can be used
  as a general image editor at your expense. Consider verifying the submitted
  banner originated from bannr

---

## PHASE 5 — UX POLISH

- **J1** — **History criteria — OPEN DECISION.** Currently auto-saves every
  successful run and always stores `variants[0]`. So bad runs are saved, the
  wrong option is shown, and edits don't update it. Options: save on Download,
  save the specific variant, or add explicit save
- **J2** — Sync edits into history (blocked on J1)
- **J3** — Mobile pass on the create page, lightbox and editor
- **J4** — Empty, error and failure states review
- **J5** — First-run onboarding — the create page is dense for a first-time user
- **J6** — SEO: meta tags, OG image, favicon
- **J7** — Accessibility pass — focus traps in the lightbox, keyboard nav,
  contrast, alt text
- **J8** — Loading copy: the phase list is currently generic, could name the
  actual style being generated

---

## PHASE 6 — POST-LAUNCH

Not before launch. Listed so they stop taking up head space.

- **K1** — Public gallery
- **K2** — Referrals
- **K3** — Multi-size bundles
- **K4** — $BANNR holder gating
- **K5** — Capacitor native wrap
- **K6** — Team/multi-user accounts

---

## OPEN DECISIONS (waiting on you)

1. **J1** — What should history actually save?
2. **F1** — Keep or delete demo mode?
3. **B5** — `medium` or `high` quality?
4. **B1** — How rare should the ticker be?
5. **H8** — Free edits per day — 10, or 3?
6. **B2** — Should variants in one run feel like a set, or be maximally varied?

---

## ALREADY DONE

For context, so it isn't re-litigated:

- gpt-image-2 at native 1536×512 (true 3:1) — **no cropping anywhere**
- Gemini removed entirely; single engine
- Doctrine fixed: removed the false "aspect ratio is 3:1" claim, the phantom
  "empty banner" canvas, and a dangling `3. Name is:` placeholder
- `MANDATE` block added — model acts as the creative director in charge
- About/tagline separated from renderable text — About is context only, never
  lettered onto the banner
- Full-size lightbox viewer with fit / actual-size modes
- Edit feature: plain-language revisions, reference-image attachments, stacking
  edits, hardened re-composition prompt, anti-enhancement clause
- Per-option loading skeletons with rotating phase narration
- Banner reveal animation (the old one was a no-op)
- CA import now clears the previous token's fields
- Cost measured: ~$0.024/image, ~$0.073 per 3-variant run
- Error copy sanitised — the AI provider is never named to users, and no
  message ever mentions API keys or env files (`lib/errors.js`)
- Refusal logging + admin review tab built (dormant until Phase 0)
- Refusal retry ladder: silent reassurance retry on content refusals
  (generate + edit), free text-vs-image diagnosis on total failure, and a
  user-consented "reimagine my image in a new style" path when the image
  is the problem. Refusal log now records which input was blamed
