# bannr — what's left

Rewritten from scratch. The previous version planned around five
styles that no longer exist (`neon-degen`, `clean-pro`, `retro-pixel`…),
called `git init` the highest-value item on the list, and listed
decisions we settled weeks ago. Planning from it would have been worse
than planning from nothing.

Ordered by **what hurts most if it goes wrong**, not by what's newest.

---

## 1. Before the token launches

Short list, and only one item has a waiting period.

> **THE FREE TIER IS NOW THE GATE.** Signing up grants nothing —
> `SIGNUP_CREDITS` is 0. Free generations come from holding $BANNR,
> and the gate decides how many. Which means **the order below is not
> optional**: until the gate is on and configured, a new account can
> do *nothing at all* except buy credits. Every "12 free credits"
> promise is gone from the site, and the offer copy reads the live
> config — so if the gate is off, the homepage simply does not
> mention a free tier rather than promising one that isn't there.
>
> Also: **a wallet no longer creates an account.** Google is the only
> door, so credits survive a lost phone. Wallets that already open an
> account still work; new ones are told to sign in with Google first
> and then connect.

- [ ] **Turn the gate on, in this order**, at `/admin7731` → Token:
      set `mint`, `minTokens`, `dailyRuns`, the daily ceiling — *then*
      `enabled`, and `announced` last. Announced is what publishes the
      contract address; enabled is what starts paying out. Enabling
      with `minTokens: 0` grants everyone the daily allowance for
      free, which is the one misconfiguration that costs real money.
- [ ] **Load $250 into OpenAI.** ← *do this first, it has a clock*
      Tier 4 needs $250 paid **and ~14 days since your first payment**.
      That clock probably already ran, but confirm on the limits page.
      It's not really buying a tier: $250 of credits is ~3,400 runs at
      measured cost, i.e. inventory you'd buy anyway.
- [ ] **Set a hard spend cap** in OpenAI billing. Two minutes, and the
      only thing that can't be outrun. At Tier 4 (150 img/min) the
      theoretical ceiling is ~$5,200/day — the rate limit is no longer
      protecting you.
- [ ] **Delete `TEST_CREDIT_EMAILS` and `/api/dev/grant`.** Four
      addresses can currently mint credits from nothing.
- [ ] **Set the daily ceiling** in `/admin7731` → Token *before*
      switching the gate on. `0` means unlimited.
- [ ] **Confirm `HELIUS_RPC_URL` is set in Vercel Production.** If it
      isn't, balance reads fall back to a rate-limited public RPC,
      resolve to "not qualified", and **nobody ever gets a free run —
      with no error anywhere.**
- [ ] **Seed the feed.** An empty feed on launch day says nobody's
      here. Post a handful from My banners.
      Do a few as **before-and-afters** — tick "Show the logo it
      started from". Works from `/create` (uses the logo on the page)
      and from My banners too, as long as you fill in the contract
      address: the logo comes back off the chain.
- [ ] **Check the funnel reads sensibly** at `/admin7731` (the strip
      above the tabs) once real traffic arrives. `landed` and `started`
      come from browsers and can be inflated by anyone; `generated` is
      counted server-side next to the charge and can't be. If the
      first two look absurd relative to the third, that's the reason.
- [ ] **Firestore TTL policy on `nonces.expires`** (console setting).
      A closed wallet popup leaves one behind forever.
- [ ] **Confirm `firestore.rules` and `storage.rules` are deployed.**
      The rule is a wildcard deny, so it already covers every
      collection added since — but it has to actually be live.

---

## 2. Verification debt

Built, committed, **never seen working**. Roughly in risk order.

- [ ] **Token gate rehearsal.** Point it at a token that already
      exists — BONK, USDC, anything in a wallet you hold — set the
      minimum below what you own, and generate. The button should read
      **"Generate — free (N left today)"**. Do this days before your own
      token exists; it validates the whole chain.
- [ ] **Tek flat type.** Re-run something like HODL. The gold bevelled
      3D lettering should be gone.
- [ ] **Glow.** Light on the subject's *edge*, not haze in the air.
- [ ] **Name-as-object.** Try a name with an obvious hook — `Loooong`,
      or a repeated syllable — and see whether Default takes it.
- [ ] **Download after an edit.** Edit in the viewer, then Download
      from the viewer. Must be the *edited* file. This was a real bug.
- [ ] **Undo / redo / hold-to-compare** in the lightbox.
- [ ] **Share unfurl.** Paste a `/feed/<id>` link into Telegram and
      check the banner appears. Three things have to be right together
      and I can't test any of them.
- [ ] **Google avatar.** Only captured on your *next* sign-in.
- [ ] **Make one like this.** Should arrive with a strip naming the
      source and its banner already attached as a reference.
- [ ] **Partial refund.** Forceable at Tier 1: two 4-option runs in two
      tabs at once. Expect *"2 of 4 options came back… refunded 2
      credits"* and a matching balance.

---

## 3. Known gaps

Real, not urgent.

- **Edits soften ~12% per pass.** They re-render from the downscaled
  1500×500 and upscale back. Invisible, and a craft bug in a product
  selling craft.
- **No full-resolution archive.** A banner exists at full quality only
  as long as that browser tab. Download on a phone, want it on desktop
  later — gone, and re-running gives a *different* banner. Needs
  Firebase Storage; also unblocks feed-at-scale and animated banners.
- **Rate limiting is an in-memory `Map`.** Each Vercel invocation can
  be a fresh instance, so it barely exists in production. Server-side
  credit debiting covers most of the money risk.
- **EVM chain inference is a guess.** Feed CA links infer `ethereum`
  for any `0x` address; Base and BNB will point at the wrong chain.
  Solana is exact.
- **No analytics.** Three counters — landed → started a brief →
  generated — would turn every future funnel argument from opinion
  into arithmetic. Launch week is the one dataset you can't collect
  twice, so this is worth doing *before* the traffic.
- **No ESLint.** `npm run check` (TDZ + CSS clash) is a stopgap
  covering the two classes of bug that actually took production down.
  `no-use-before-define` does the first properly.

---

## 4. Next features

Roughly in the order I'd build them.

- **Daily most-liked coin.** The reason Share exists. Needs a
  once-a-day ranking and somewhere to show it — a board, and probably
  a badge on the winning post.
- **Profile pages (`/u/handle`).** The feed shipped with handles that
  point nowhere. It's the share surface — people post *their* link,
  not yours — and it's where "best of the week" eventually lives.
- **Full-resolution archive.** See above. Infrastructure that pays for
  itself four times.
- **X headers, properly.** Already promised in the UI. A genuinely
  different design problem: X crops headers differently on mobile and
  the avatar punches a hole in the bottom-left.
- **Animated banners.** `GIF-BANNERS.md` — but note §0 is now
  **answered**: DEX Screener accepts GIF *and* WebP. WebP removes the
  size problem entirely, and Sora 2 is already on your OpenAI account.
  What's left: does it preserve 3:1, and the async-job infrastructure.
- **Comments.** Deliberately deferred. Likes carry ranking, best-of-day
  and events with none of the permanent moderation cost, and on a
  crypto feed the comment box is where contract addresses go.

---

## Settled — don't re-litigate

- One engine: gpt-image-2, native 1536×512, **nothing cropped**
- Art-director pass for Tek, Meme, HIM, Anime, Collectibles, Default;
  Glow deliberately has none
- Accounts are not wallets. Google leads, wallet is one identity among
  several, paying needs no linking at all
- History saves on **download**, not on generate
- Publishing to the feed is always an explicit act
- No composite Firestore indexes anywhere
- Four mobile tabs, not scrollable; Feed replaced Home; the wordmark
  goes home
