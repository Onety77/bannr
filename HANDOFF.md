# Handoff

Written for whoever picks this up next, including me after a cleared chat.
Read this before touching anything. It is not a feature list — the code says
what exists. It is the things the code cannot tell you: what was tried and
failed, what Aminu has decided and does not want relitigated, and how to
work here.

---

## 1. Who you are working with, and how

Aminu is the owner. He is not a designer or an engineer by trade, but his
product instincts are good and he is usually right when he pushes back.
Several times the correct move was to do exactly what he said and drop the
thing I was defending.

**His standing rules, in his words. These are not preferences.**

> "if i ask you a question of what should we do, first you gotta tell me
> first, not just start doing it"

Answer questions. Do not start building because a question implied work. He
said this after I shipped a whole feature in reply to "what should we do
about X" and it had to be reverted.

> "please dont mention ai, we gotta package ourselves"

Nothing user-facing says AI, model, prompt, GPT or generated-by. The product
is a design service that happens to be instant.

> "please dont put retry on the 429 errors please, cause sometimes it will
> genuinely be from us, like lack of the tokens or smthn"

No automatic retries on rate limits. A 429 may be our own billing failing and
retrying hides it.

> "i dont understand why you are working like yu are scared, like you are
> scared to touch the old system"

When a change requires reworking something that already exists, rework it.
Do not bolt a flag onto the side to avoid touching it.

> "you are doing it as if these people dont know they will use their wallet
> for payment"

The audience is crypto-native. They know what a wallet is, what a CA is, what
DEX Screener is. Explaining those insults them.

> "if you mention cost nothing, it triggers peoples mind to now start
> thinking of wait is this safe etc."

Never volunteer safety reassurance. Saying "this is safe" plants the doubt.

**And the most recent, which is now the house rule for all copy:**

> "you are kinda explaining too much stuff still... please look through the
> web and remove anything that might make people feel stupid"

Say what the field is, then stop. "Optional" is a whole sentence. Examples go
in the placeholder, two at most, not in a hint above it. A hint that explains
the mechanism, justifies the default, or teaches the concept is written for us,
not for the person filling it in. This got swept once — do not let it grow
back. Error messages are the exception: "you weren't charged" is the one thing
someone genuinely needs told.

**How he gives feedback.** Bluntly, often on his phone, often with a
screenshot. When he says something looks bad, it looks bad — go and find the
structural cause rather than adjusting a value. Twice the real cause was that
a layout did not exist at all (a plain block where a flex row was needed), not
that a number was wrong.

---

## 2. What this is

**bannr** — Next.js 14 app that makes 1500×500 DEX Screener banners. Ahead of
a $BANNR token launch on Solana.

Four surfaces on `/create`, in the order a project needs them:

| Surface | State |
|---|---|
| DEX banners | shipped |
| PFP maker | shipped |
| 𝕏 headers | teaser, `XComingSoon.jsx` |
| Memes | teaser, `MemesComingSoon.jsx` |

Seven banner styles: Tek, Meme, HIM, POV, Glow, Anime, Collectibles, plus
Default (`auto`). Four PFP styles: Default, Glow, Solid colour, Anime.

---

## 3. Architecture rules that cost something to learn

**The server-only split is load-bearing.** `lib/templates.js` and `lib/pfp.js`
carry the prompts and start with `import "server-only"`. `lib/styles.js` and
`lib/pfpStyles.js` carry names, taglines, colours, thumbnails — the parts the
browser is allowed to see. This exists because the prompts were once in the
client bundle and readable in devtools. A private repo would not have helped;
the leak was the bundle. Never import the prompt file from a client component.
There is a dev-time assertion that the two files agree on every style.

**`lib/tiers.js` belongs to neither side, and that is load-bearing.** It has no
imports and is neither `server-only` nor `"use client"`, because the API and
the create page have to reach the same answer about what an account may do. A
locked field that still works, and an unlocked field the server strips, are the
two bugs it exists to make impossible. The server reaches it through
`lib/entitlements.js`, the browser through `lib/useEntitlements.js`, and both
reduce to `entitlementsOf()`.

**Banners are stored, and only the ones somebody kept.** `lib/archive.js`
writes the full 1500×500 PNG to Firebase Storage at the moment of DOWNLOAD —
the same instant history has always been written. Four options render, one gets
kept, three are never uploaded at all. That is a privacy rule before it is a
cost one.

Three properties hold it together, and none is optional. The object name is
random *and* every read re-checks ownership — unguessable names leak through
any log that sees one, and an ownership check on a predictable path is one
enumeration away. Reads go through `/api/archive/{id}` on our own origin rather
than a signed URL, because a signed URL is cross-origin and the download
`fetch` — the whole point — is refused by CORS unless the bucket is configured
for it on every environment. And a card that is deleted *or evicted by the 50
cap* takes its file with it, or the bucket fills with objects nothing points at.

**The whole thing degrades to nothing.** No bucket configured, or an upload that
fails, and the product behaves exactly as it did before: the banner lives in the
tab and the card keeps its thumbnail. An archive that could break a download
would be worse than no archive.

**No composite Firestore indexes anywhere.** A `where` on one field plus an
`orderBy` on another throws at runtime, not at build. Over-fetch and filter in
memory. `lib/directory.js` and `lib/stats.js` both do this deliberately.

**`npm run check` runs four real checks and is wired to `prebuild`.**
- `check-tdz` exists because `Lightbox.jsx` once read a `const` above its
  declaration. It built clean and threw on load in production, on the one page
  that renders it. Keep hooks below the state they read.
- `check-css` and `check-nav` guard class-name drift and unreachable tabs.
- `check-handlers` exists because `/create` shipped `onClick={importCA}`. React
  passes the click event as the first argument, `String(event)` is
  `"[object Object]"`, and the Fetch button reported *"that doesn't look like a
  contract address"* for every address ever typed into it. It read as a broken
  address validator and was a broken button — and it survived because the paste
  path called the same function correctly, so the field filled and only the
  button was dead. Write `onClick={() => fn()}`. The check stays quiet by only
  flagging real DOM events whose handler's first parameter is not event-named.

**`npm test` runs `tests/*.cjs`** — 26 files, ~1600 assertions. Every block is
a regression with a comment saying what broke. They read real source and, for
prompts, build the real prompt through the real module. Run `npm test pfp glow`
to filter.

**The recurring bug in the tests is the tests.** Regexes that match my own
explanatory comment instead of the code; slicing a string with indices taken
from a different string; `.repeat(NaN)` from an undefined constant making an
assertion vacuously true. Most files define `bare()` to strip comments before
matching. When an assertion fails, check whether the test is wrong before the
code.

**Write JS with the Write tool, not shell heredocs.** Template literals with
`${}` get eaten by bash escaping. This cost several rounds.

---

## 4. Prompt engineering: what actually works here

These were learned expensively and apply to every style.

**Models weight the end of a prompt.** A ban buried mid-prose loses to
everything after it. Tek's circuit-board ban existed twice and lost anyway,
because of *where* it sat. `forbid` arrays are emitted late in `buildPrompt`,
after the concept and before the client's own words.

**Grammar decides whether a rule holds.** Flat imperatives hold — "No bevel,
no chrome, no extrude". Reasoning that concludes "none of them is necessary"
reads as advice and is ignored.

**Name the failure, not the preference.** "Preserve the subject" is a sentence
every prompt contains and no model weighs. "An avatar that is ALMOST right is
worth nothing to them" does. The safe-looking wrong answer must be named as a
failure or the model will produce it — POV's "reproducing the attached pose
and changing only the background is a FAILED banner" is the clearest case.

**Showing a model an image makes it describe and continue, not reason.** HIM's
first vision attempt turned every concept into an extension of whatever room
the subject was photographed in. Fixed by separating the two jobs explicitly:
the image answers *what this is*, where it goes is still invented, and the
levers are listed one by one.

**Three directors have `vision: true`** — `default`, `him`, `pov` — and there
is a test asserting exactly three. It is opt-in per director so that when it
helps we know which change did it. POV needs it for *topology*: whether a
subject has a back to shoot is unanswerable from a name.

**The art-director pass is where diversity comes from.** An image model
executes; it does not ideate. Concepts are written together in one text call
and required to be compositionally unlike each other. The PFP maker
deliberately has no such pass — there is nothing to ideate.

**Chasing a failure too hard creates its opposite.** Glow was pushed away from
"neon outline" so hard it became a thin crisp rim, which is a sticker. The fix
was to make softness the headline and permit the falloff. The line that carries
it: *thin, crisp and even is a sticker; soft, gathered and uneven is light.*

---

## 5. Decisions that are settled — do not reopen

- **No free credits on signup.** `SIGNUP_CREDITS = 0`. The free tier is
  holding $BANNR, and a signup grant would compete with the one thing the
  token does. Nora (a friend's AI) suggested restoring 3 — Aminu said no.
- **Credits, not "generations".** There are now four differently-priced
  actions (banner run 3, PFP 1, reroll 1, edit 1), so a credit is a
  meaningful unit.
- **The subject is never redrawn** — except in Anime (banner and PFP) and POV,
  which say so explicitly and carry their own identity discipline. This is the
  core promise of the product.
- **Google sign-in and wallet sign-in are both offered**, from one "Sign in"
  button that opens a modal, reachable from every tab.
- **/token opens on Buybacks & burns**, with Performing tokens as a second tab.
- **One free run a day for everyone signed in**, and it does NOT live behind
  `gate.enabled` — it is the trial, it has to work before the token exists, and
  `entitlementsOf()` returns it with a null tier for that reason. It is also
  the floor: a tier can never grant fewer runs than free does.
- **What the free tier does not get is the style picker and the "What do you
  want?" note.** Not About, not the tagline, not reference images — those are
  how you describe your project, and charging for them would make the free tier
  a demo of a worse product rather than a smaller amount of the real one.
- **Early access and a bespoke style are tier-3 perks, honoured by hand.**
  Neither is a switch: one is a decision about when a surface ships, the other
  is somebody sitting down and writing a director. They are stored and
  displayed, never enforced in the pipeline. A bespoke style is kept if the
  holder later sells down — a perk you can repossess is a hostage situation.
- **Featured-feed placement is NOT for sale at any tier.** The feed and the
  performing-tokens list are the proof that stands in for a trial; the moment
  placement is purchasable they stop being evidence and become advertising. A
  badge on the card is fine, a tiebreak is fine, changing what is shown is not.
- **No "priority generation" perk.** There is no queue — a generation is a
  direct call. Building one so holders could skip it would mean manufacturing a
  delay in order to sell the removal of it.

---

## 6. Pricing and the ladder — built 7 Aug 2026

**Packs are priced in USD and paid in SOL.** $9/15 credits, $29/60 (featured),
$79/200. `lib/packs.js` carries dollars only; `lib/solPrice.js` converts.

The defect this fixed: packs were hard-coded SOL amounts set when SOL was
~$150 and never touched. SOL fell to ~$72 and they had quietly become
$3.63 / $8.71 / $25.42 — half what was intended, with nobody having edited a
price. A product priced in a volatile asset re-prices itself daily and tells
nobody.

**Four standings, one table** (`lib/tiers.js`, imported by both sides):

| | Holding | Runs/day | Discount | Styles | Direction |
|---|---|---|---|---|---|
| Free | — | 1 | — | no | no |
| t1 Holder | set in admin | 1 | 10% | yes | yes |
| t2 Insider | set in admin | 2 | 25% | yes | yes |
| t3 Founder | set in admin | 3 | 40% | yes | yes |

Every number is admin-editable at `/admin7731`. The defaults above are the
shape, not a decision — thresholds are 0 until someone sets them, and the gate
refuses to arm until they are.

**Free compute climbs slowly, the discount climbs fast**, and that asymmetry is
the whole design. A free run costs real money whether or not it leads anywhere
and is a run somebody did not buy; a discount costs nothing until a purchase
happens and is worth nothing unless one does. Big allowances at the top
recreate the problem the ladder exists to escape — the best holders stop being
customers, and the people most invested in the token generate the least revenue
to buy it back.

**Thresholds are in tokens and must stay that way.** A dollar threshold means
the tokens required shrink as the price rises, which weakens buy pressure
exactly as it starts working, and hands every holder a free sell into every
pump — they become over-qualified and can trim the excess with nothing lost.
Tokens ratchet: the position that qualified you still qualifies you. Set them
FROM a dollar figure with the calculator in the admin panel, at admin time,
where a dead price feed is a blank field rather than an outage.

**The buyback commitment is built as ACCOUNTING, not as a bot.** `buybackPct`
in the gate config (0 = publish nothing, which is the honest default until you
intend to honour a number). `commitment()` in `lib/buybacks.js` computes what
revenue obliges, what has been spent, and the gap; `/token` publishes all three
including when it is behind, and the admin Buybacks panel leads with what is
still to buy.

**No hot wallet, and this was Aminu's call after being shown the options.**
Auto-swapping needs signing keys on a server for a wallet holding real money,
and there is currently **no private key anywhere in this codebase** — every
wallet action is a user approving in their own wallet. Do not add one without
treating it as its own security project, and if you do, use a dedicated
buyback wallet topped up by hand rather than the treasury, so the blast radius
is bounded to what has been funded.

Worth knowing before anyone reopens it: **automation solves the discipline
problem, not the trader's trust problem.** Nobody can verify a cron job; they
verify transactions. A visible regular on-chain cadence is what makes the pitch
land, and a human doing it every time the nudge fires delivers that identically.
"Unstoppable" would need an on-chain program nobody can switch off, which is a
different project — a cron job you control is not that, and claiming otherwise
is checkable.

**The trigger is revenue, not a calendar.** `buybackEverySol` (default 1) means
"flag it once 1 SOL has been earned", and at 30% that is 0.3 SOL owed. A weekly
reminder fires on a quiet week with nothing to buy and stays silent through a
busy Tuesday. It is never published — the size and moment of the next market
order is front-runnable, so `/api/buybacks` passes 0 and leaves `due` false.

**THE COMMITMENT HOLDS NO MARKER, AND MUST NOT GROW ONE.** The tempting
implementation tracks "revenue since the last buyback" and takes a cut of that.
It needs a marker moved on every buyback, and anything that puts the marker
wrong — one logged late, two out of order, one deleted and re-added — silently
re-taxes or skips a stretch of revenue with nothing on the page looking wrong.
Both sides are recomputed from the totals instead (`owed = pct × all revenue`,
`spent = all product buybacks`, `outstanding = owed − spent`), so each SOL is
counted exactly once, order never matters, and overshooting banks a surplus
that carries forward. There are tests running the real function against a fake
Firestore for every one of those cases.

Two rules that came out of building it: **fees never discharge a product
promise** — fee buybacks are circular and traders discount them correctly, so
letting a busy trading week pay off a commitment made about customer revenue is
a real dishonesty. And **the gap is published even when negative** — a promise
measured only by its running total rots quietly upward and nobody can tell it
is behind.

Note what the numbers actually say: 30% of 100 buyers a month is ~$660 of
buying, a visible bid at a small market cap and noise at a large one. Publish
the weekly dollar figure, not the percentage — a percentage with no denominator
invites people to imagine a big number and then feel lied to. `lastSevenDays()`
is that figure.

**Two risks worth watching:** the new prices are 2.5–3× the old per-credit
rate. The mitigation is the free run plus the feed and the performing-tokens
list as proof, and they have to be loud on the homepage for it to work.

**Known unfixed:** X Communities conversion is a centre crop (1500→1300 removes
100px a side, more than the 80px text margin). Flagged, needs its own decision.

**`NEXT-ACTIONS.md`** holds Aminu's own launch checklist — OpenAI funding and
spend cap, gate config order, `DEV_WALLET` in Vercel, first buyback before
announcing `/token`, Firestore TTL on `nonces.expires`, seeding the feed.

---

## 7. Things that bit, so you do not repeat them

- **iOS universal links need a user-initiated navigation.** Any `await` before
  `location.href` spends the gesture and Safari loads the web page instead of
  opening the wallet. All the deeplink callbacks are synchronous and the
  modules are preloaded in an effect. Do not add an await.
- **iOS opens the wallet redirect in a NEW TAB**, so `sessionStorage` cannot
  carry flow state. `localStorage` plus a `storage` event is the only signal.
- **Two `useAuth()` instances raced for the same redirect** and the loser
  reported "could not decrypt". `lib/walletResume.js` is a module-level single
  owner because of it.
- **Phantom has no SIWS.** Six deeplink methods only, and `signMessage` needs
  a `session` from `connect`, so connect-first is mandatory.
- **CSS specificity:** `.fcard-shot img` beats `.fcard-pfp-img`. A stale
  type+class rule silently won and would have stretched a logo full-width.
- **A block-level flex box ignores `text-align`.** The token bar pinned itself
  left inside a centred hero. `inline-flex` makes it follow its container,
  which is why `.tbar-row` is inline.
- **`sol` vs `amountSol`** — two names for one figure written by two paths.
  Billing history was blank for the main one. Both are written now.
- **A threshold that hides a whole section is worse than a sparse section.**
  `/token`'s list was gated at four rows and vanished entirely — tab included —
  when an unrelated token fell under the floor, with a $28M token sitting
  invisible. It shows from one now.
- **OpenAI output moderation refuses ominous framing.** "A creature in deep
  shadow, barely readable" was refused; the same lighting described as studio
  product photography passed.

- **THE PLATFORM REFUSES A REQUEST BODY OVER ~4.5MB BEFORE THE FUNCTION RUNS.**
  A 413, no server log, no charge, and a bare "Something went wrong" on screen —
  which is indistinguishable from the product being broken. The PFP maker was
  uploading up to five untouched phone photos. Banners survived on luck: a logo
  is usually small, and the same failure was one big upload away.
  `lib/downscale.js` shrinks in the browser on every upload path now. Two
  things in it are load-bearing: the canvas is **painted white first**, because
  a transparent PNG encoded to JPEG goes black and on a knocked-out logo that
  is the whole logo; and it **fails open**, returning the original when a
  browser cannot decode the file, because a helper that made an upload
  impossible would be worse than the size it was written to fix.
- **A size limit the host will not honour is a lie, not a limit.** Both routes
  advertised 8MB per file and could never receive it. They say 4MB now.
- **`res.json()` on a dead function throws, and takes the status with it.**
  That is how the above surfaced as five words. Read the body as text, parse if
  it parses, and report the status — and do not say "you weren't charged" in
  that branch, because the route's refund lives in a `catch` that never ran.

### From the tier rework, all found by reasoning rather than by shipping

- **A discount silently underpays unless the matcher knows about it.** The page
  quotes the discounted price and the payer sends exactly it; graded at list
  price that amount falls outside its own pack's tolerance band, drops to the
  "best pack it clears" rule and is credited at the tier below. A holder would
  get fewer credits per dollar than a stranger, with no error anywhere. Both
  `/api/pricing` and `/api/pay/claim` go through `resolveEntitlements` for this
  one reason.
- **The tolerance band had to widen from 2% to 8%.** 2% was right when the
  price was a fixed SOL amount and the only drift was fee dust. The drift now
  is SOL moving between the quote and the confirmation, which is real market
  movement. The two failure directions are not symmetric: too tight grades a
  correct payment into the tier below, too loose costs a few percent of credits.
- **`publicGate` publishes `minTokens` and `dailyRuns` as flat numbers and they
  are DIFFERENT RUNGS** — the entry bar and the top tier's grant. Pairing them
  advertises the cheapest price for the best benefit. `offerLine` reads the
  array; `TokenBar` used to build the sentence itself and was wrong.
- **`offerLine` must describe what a tier ADDS, not what it has.** With one
  free run a day for everyone and one on the first rung, listing the tier's
  benefits advertises something the reader already has.
- **The free tier nearly broke the balance recheck.** `gateStateOf` used to
  treat "has an allowance" as "gate satisfied". Every signed-in account has one
  now, so a non-holder's free run would have read as satisfied and their
  balance would never be re-read — someone buying at noon would not get their
  tier until the next day. It tests the stored tier id instead.
- **A brand-new account has no gate record, so `holderRunsLeft` is 0** — which
  alongside 0 credits showed the top-up dialog to exactly the person the free
  run exists for, on the visit that decides whether they come back. The create
  page tells "never checked" apart from "checked, and you have none".
- **The Helius webhook grades at list price and that is correct.** It is the
  backstop, with no session and therefore no tier; guessing one from the
  sending wallet would mean a balance read inside a Firestore transaction and a
  weaker trust model than the signature-verified link the ladder rests on. The
  error is bounded and in the right direction — a holder credited as a
  non-holder is refundable, a stranger credited at a founder's discount is not.
- **There is no safe default SOL price.** `lib/solPrice.js` returns null rather
  than falling back, because a wrong rate does not break anything visible — it
  sells $79 of credits for whatever the bad number came to, and the first
  symptom is the treasury. It also refuses reads outside $1–$10,000 as a broken
  feed rather than a moved market. A brief outage reuses the last good price
  for ten minutes; past that, buying is disabled and payments are held at 202.
- **Three tests in a row matched my own comment instead of the code** while
  writing this. `bare()` before every negative assertion.

---

## 8. Voice

Write like the codebase already reads. The comments here are unusually long
and that is deliberate — they explain *why*, especially why something is not
the obvious thing. If you change a decision, change the comment explaining the
old one; a stale rationale is worse than none.

In chat: be direct, lead with the answer, say when something is wrong
including when it is my own work. Aminu does not want hedging and does not
want a wall of caveats. When there is a real risk in what he asked for, name
it in a sentence or two and then build the thing anyway — it is his call, and
he has been right more often than not.
