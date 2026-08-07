# BANNR

**The one place every dev gets professional DEX Screener banners.**

Next.js · OpenAI `gpt-image-2` · Solana wallet auth · Firestore accounts · SOL payments via Helius.

> **Working on this?** Read [HANDOFF.md](HANDOFF.md) first. It carries the
> decisions, the house rules for copy and prompts, and the things that have
> already been tried and failed — none of which the code can tell you.

```
npm run check    # TDZ, CSS, nav and event-handler guards (also runs on prebuild)
npm test         # 27 regression files, ~1730 assertions
npm test pfp     # …filtered by filename
```

---

## What it does

Upload a logo, describe the project, pick one or more styles, and get 2–4
finished banners at exactly **1500×500** — art, typography and logo identity
rendered as a single native AI image. No server-side text compositing.

Then edit any of them in plain language ("remove the moon, make it a warm
sunrise") and the banner is re-solved with that one change applied.

---

## Setup

```bash
npm install
cp .env.example .env.local     # then fill it in — see below
npm run dev
```

### Required

| Variable | What it's for |
|---|---|
| `OPENAI_API_KEY` | Image generation and editing |
| `AUTH_SECRET` | Signs the wallet session cookie |
| `NEXT_PUBLIC_FIREBASE_*` (×5) | Client config, from your Firebase web app |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Admin SDK — accounts, credits, moderation |

Generate `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **Paste the service account JSON as ONE line.** Downloaded, it's
> pretty-printed across ~13 lines, and `.env` only reads the first — which
> silently leaves you with `{` and no working Admin SDK.

### Not required yet

`NEXT_PUBLIC_TREASURY_WALLET`, `HELIUS_WEBHOOK_AUTH` and `HELIUS_RPC_URL` are
for live SOL payments. Without them, `/credits` tops up through a
**development-only** server route instead.

---

## Sign in

Wallet-only, via Phantom or Solflare. There is no email or password.

1. Client requests a single-use nonce
2. The wallet signs a readable message containing it — **not a transaction**,
   no gas, nothing spent
3. Server verifies the Ed25519 signature, burns the nonce, sets an httpOnly
   session cookie
4. First sign-in creates the account. It grants **no** credits — free
   generation is a daily allowance, not a signup gift (see Credits below)

The account lives in Firestore, so credits and history survive a cleared
browser or a new device. The wallet is the key, not the vault.

**Sign-in is required to generate or edit** — credits cost real money, and a
signed-out visitor has no account to charge.

On a phone, a normal browser can't see a wallet app at all. The connect button
becomes **Open in Phantom**, which reopens the site inside the wallet's own
browser, where a provider *is* injected and everything works unchanged.
(Deliberately not Mobile Wallet Adapter — that's Android-only.)

---

## Credits

Enforced **server-side**, inside Firestore transactions. The client cannot
decide what it can afford.

| | Cost |
|---|---|
| One run (2–4 options) | 3 credits |
| One edit | 3 free per day, then 1 credit |

**Packs are priced in USD and paid in SOL** — $9/15 credits, $29/60, $79/200.
`lib/packs.js` holds dollars only and `lib/solPrice.js` converts at the moment
of quoting, because a price written in SOL re-prices itself every day and tells
nobody. There is no fallback rate: an untrustworthy price disables buying
rather than selling a pack for whatever a bad number came to.

**Four standings**, in `lib/tiers.js` and editable at `/admin7731`: everyone
signed in gets one free run a day; three holder tiers add runs, a pack discount
and the parts of the brief the free tier does not carry (the style picker and
the free-text direction). Thresholds are in whole tokens, never dollars — a
dollar threshold shrinks as the price rises, which weakens the mechanism
exactly as it works and lets every holder sell down on a pump for free.

Charged after validation but before any paid API call, and refunded
server-side if the run fails. Partial success still costs a full run — every
variant that ran cost real money whether it came back or not.

Measured API cost: **~$0.024 per image, ~$0.081 per 3-variant run** — three
images plus the art-director text call that steers them.

---

## The styles

Six, in `lib/templates.js`. Pick as many as you like per run; options are
divided evenly with any remainder going to whichever you selected first, so
every chosen style appears at least once.

| Style | |
|---|---|
| **Tech** | Engineered, not sci-fi |
| **Meme** | The joke, told visually |
| **HIM** | Pure presence — carries **no text at all** |
| **Glow** | Light as composition |
| **Anime** | Official key visual, not a filter |
| **Collectibles** | One subject, many variants — **no text at all** |

Plus **Normal**, which adds no style guidance and lets the model invent the
direction from the brief alone.

Drop preview thumbnails in `public/styles/` — see the README there. Missing
files degrade to clean coloured tiles.

### Advanced settings

Every style has an expandable panel: text on/off, ticker override, placement,
treatment, a simplicity→richness scale, subject scale, palette, a free-text
**Avoid** field, plus per-style controls (glow intensity, panel count, anime
era, and so on).

**Every control defaults to Auto, and Auto contributes nothing to the prompt.**
An untouched run produces a byte-identical prompt to one built with no settings
at all. There's a test asserting this — keep it passing, or every generation is
quietly constrained.

---

## The prompt

`lib/templates.js` is the product. The assembled prompt is:

```
DOCTRINE     the creative philosophy — concept before objects, space as a
             material, one focal point, restraint in type
MANDATE      the model is the designer in charge; the client can't art-direct
style mood   the chosen category's full brief
TEXT         the only words allowed on the banner (or none)
BRIEFING     the About — context only, never rendered
seasoning    a per-variant creative lean, so options differ
DIRECTION    advanced settings, only when non-default
FRAMING      the hard technical constraint, last so it lands
```

Two things it deliberately does **not** do:

- **Never sends a ticker that restates the name.** `Moonsoon/$MOONSOON`,
  `Cat Wif Bat/CWB`, `Moonsoon/MSN` are all suppressed in code — the model
  can't letter a string it was never given.
- **Never sends copy to a no-text style.** Asking for text and then forbidding
  it is a contradiction the model resolves unpredictably.

### Content refusals

Refusals retry silently once with a reassurance block before the user sees
anything. If a run still fails, a free moderation call diagnoses whether the
*words* or the *image* tripped it, and the user is offered an escalation —
retry with their image, reimagine it in a new style, or swap it.

Every refusal is logged with the brief that caused it and reviewable at
`/admin7731`, including a "what refused briefs have in common" word ranking.

---

## Project map

```
app/
  page.jsx                      landing
  create/page.jsx               the core loop
  history/page.jsx              past generations (still localStorage)
  credits/page.jsx              packs, wallet, SOL payment
  admin7731/page.jsx            moderation + refusal log (unlinked)
  api/auth/*                    nonce, verify, me, logout
  api/generate/route.js         the pipeline
  api/edit/route.js             plain-language revisions
  api/webhooks/helius/route.js  payment webhook (idempotent)
lib/
  templates.js    ★ styles, doctrine, prompt assembly
  advanced.js     ★ per-style control definitions + prose mapping
  auth.js           nonce, Ed25519 verify, session
  users.js          accounts and credits — the only place credits change
  openai.js         gpt-image-2 (1536×512 native 3:1)
  errors.js         public error copy — never names the AI provider
components/
  ConnectButton, Nav, Lightbox, AdvancedPanel, StageAura, Spotlight
```

---

## Notes

- **Nothing is cropped.** `gpt-image-2` renders 1536×512 — genuinely 3:1 — so
  reaching 1500×500 is a 2.3% downscale.
- Error messages never name the AI provider, and never mention API keys or env
  files. See `lib/errors.js`.
- `/api/dev/grant` exists so local testing can top up credits. It 404s in
  production. **Delete it before launch.**
- Remaining work is tracked in `NEXT-ACTIONS.md`.
