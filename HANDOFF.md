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

**No composite Firestore indexes anywhere.** A `where` on one field plus an
`orderBy` on another throws at runtime, not at build. Over-fetch and filter in
memory. `lib/directory.js` and `lib/stats.js` both do this deliberately.

**`npm run check` runs three real checks and is wired to `prebuild`.**
- `check-tdz` exists because `Lightbox.jsx` once read a `const` above its
  declaration. It built clean and threw on load in production, on the one page
  that renders it. Keep hooks below the state they read.
- `check-css` and `check-nav` guard class-name drift and unreachable tabs.

**`npm test` runs `tests/*.cjs`** — 25 files, ~1500 assertions. Every block is
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

---

## 6. Open, with my recommendation

**Pricing — agreed in principle, not built.** Aminu wants prices raised so
buybacks are funded from the start rather than eating margin, positioning
premium against the $299 DexScreener fee. Proposed and accepted in discussion:

| | Price | Credits | Runs |
|---|---|---|---|
| Starter | $9 | 15 | 5 |
| Launch ★ | $29 | 60 | 20 |
| Studio | $79 | 200 | 66 |

~30% of product revenue to buyback, published on `/token`.

**USD anchoring is a live defect and the first thing to build.**
`lib/packs.js` hard-codes SOL amounts and the Helius webhook credits off SOL
received. SOL fell to ~$72 and the packs are now $3.63 / $8.71 / $25.42 —
roughly half what they were meant to be, with nobody touching a price. Needs
conversion at checkout on USD value with a tolerance band for drift between
quote and confirmation.

**Two risks worth watching if the ladder ships:** it is 2.5–3× the current
per-credit price arriving at the same time as no free trial. The mitigation
already exists — the feed and the performing-tokens list are proof standing in
for a trial — but they have to be loud on the homepage for it to work.

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
