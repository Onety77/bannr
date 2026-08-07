# bannr — what's left

Rewritten 8 Aug 2026. The previous version described a gate that no
longer exists — it said free generations came only from holding
$BANNR, and planned around flat `minTokens` / `dailyRuns` fields that
became a three-rung ladder. Planning from it would have been worse
than planning from nothing, which is exactly what happened to the
version before it.

> **THE CONFIGURATION HALF OF THIS FILE IS GONE, AND ON PURPOSE.**
> Every "is X set" item now lives at **`/admin7731` → Launch**, which
> reads the deployed config instead of describing it. A checklist in a
> markdown file goes stale silently; a panel that reads the running
> system cannot. Anything you can check by looking at a setting is
> there, not here.
>
> What stays here is what no code can read: things to *do*, things to
> *verify by eye*, and decisions already made.

---

## 1. Do these in order

**Everything below is sequenced.** Each one makes the next safe.

- [ ] **Clear the blockers on the Launch tab.** Whatever it says, in
      the order it says it. They cost money or fail silently.
- [ ] **Load OpenAI credit and set a hard spend cap.** The cap is the
      only thing that can't be outrun — at Tier 4 the theoretical
      ceiling is ~$5,200/day and the rate limit stops protecting you.
      Launch can't read it; only you can.
- [ ] **Rehearse the ladder against a token you already hold.** ← *the
      one that matters most.* Point the gate at BONK, USDC, anything
      with a balance in your wallet, set tier 1 below what you hold and
      tier 2 above it, arm it, and generate.
      **None of the tier code has ever run against a real wallet.**
      One pass exercises the balance read, tier resolution, the style
      picker unlocking, the discounted price on `/credits`, the
      "X BANNR from Insider" line, and the button reading
      *"free (N left today)"*. If `HELIUS_RPC_URL` is missing, this is
      also where you find out — balance reads fall back to a public
      endpoint, everyone resolves to no tier, and nothing errors.
- [ ] **Seed the feed.** An empty feed on launch day says nobody's
      here. Post a handful from My banners, a few as before-and-afters
      — tick "Show the logo it started from".
- [ ] **Firestore TTL on `nonces.expires`** (console setting). A closed
      wallet popup leaves one behind forever.
- [ ] **Confirm `firestore.rules` and `storage.rules` are deployed.**
      The rule is a wildcard deny, so it covers every collection added
      since — but it has to actually be live. **Storage matters now**:
      banners are stored under `banners/{accountId}/`, every read goes
      through the Admin SDK via `/api/archive/{id}`, and a deny-all
      rule is exactly right. No client ever touches the bucket.
- [ ] **Check `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is set in
      production.** Without it the archive is simply off — downloads
      still work, banners just stop being re-downloadable later, with
      no error anywhere.
- [ ] **Do the first buyback before announcing `/token`.**
- [ ] **Announce the contract address last.** It is the switch that
      makes everything above visible to strangers.

---

## 2. Verify by eye

Built, committed, **never seen working**. Nothing automated can judge
these — they are all "does it look right".

- [ ] **Tek flat type.** Re-run something like HODL. The gold bevelled
      3D lettering should be gone.
- [ ] **Glow.** Light on the subject's *edge*, not haze in the air.
- [ ] **Name-as-object.** Try a name with an obvious hook — `Loooong`,
      or a repeated syllable — and see whether Default takes it.
- [ ] **Download after an edit.** Edit in the viewer, then Download
      from the viewer. Must be the *edited* file. This was a real bug.
- [ ] **Undo / redo / hold-to-compare** in the lightbox.
- [ ] **Share unfurl.** Paste a `/feed/<id>` link into Telegram and
      check the banner appears. Three things have to be right together.
- [ ] **Make one like this.** Should arrive with a strip naming the
      source and its banner already attached as a reference.
- [ ] **Partial refund.** Two 4-option runs in two tabs at once.
      Expect *"2 of 4 options came back… refunded 2 credits"* and a
      matching balance.
- [ ] **A locked field on a fresh account.** Sign in with an account
      holding nothing: the style picker and "What do you want?" should
      both show the locked row, and one run should still be free.
- [ ] **Google avatar.** Only captured on your *next* sign-in.

---

## 3. Known gaps

Real, not urgent.

- **Edits still soften per pass.** They upscale the 1500×500 back to
  1536×512, JPEG-encode it, and the model re-renders — so some loss is
  resampling and most of it is the re-render itself, which no amount of
  source fidelity removes. The archive stores the delivered 1500×500,
  so this is improved but not cured. Storing the 1536×512 pre-downscale
  original would remove the upscale; it would also mean uploading every
  option rather than only the kept one, which breaks the rule that
  nothing you rejected is ever stored. Not obviously worth it.

- **Rate limiting is an in-memory `Map`.** Each invocation can be a
  fresh instance, so it barely exists in production. Server-side credit
  debiting covers most of the money risk.
- **EVM chain inference is a guess.** Feed CA links infer `ethereum`
  for any `0x` address; Base and BNB point at the wrong chain. Solana
  is exact.
- **`productRevenue()` reads at most 1000 payments** with no
  pagination. A long way off, and the cap is deliberate — an unbounded
  read on a public page is how a launch takes the database down. When
  it binds, it needs a running total written at payment time, not a
  bigger limit.
- **No ESLint.** `npm run check` covers the four classes of bug that
  actually took production down: TDZ, CSS clashes, unreachable tabs,
  and an argument-taking function wired straight to an event.

---

## 4. Next features

Roughly in the order I'd build them.

- **Daily most-liked coin.** The reason Share exists. Needs a
  once-a-day ranking and somewhere to show it.
- **X headers, properly.** Already promised in the UI, and it would
  make tier 3's "early access" perk concrete. A genuinely different
  design problem: X crops headers differently on mobile and the avatar
  punches a hole in the bottom-left.
- **Animated banners.** `GIF-BANNERS.md` — §0 is now **answered**: DEX
  Screener accepts GIF *and* WebP, which removes the size problem. What
  is left is whether it preserves 3:1, and the async-job infrastructure.
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
- Packs are priced in **USD**, paid in SOL, converted at quote time
- Tier thresholds are in **tokens**, never dollars
- One free run a day for everyone signed in, independent of the token
- The buyback commitment is **accounting, not a bot** — no signing key
  on the server, and there is currently none anywhere in the codebase
- History saves on **download**, not on generate
- Publishing to the feed is always an explicit act
- No composite Firestore indexes anywhere
- Four mobile tabs, not scrollable; Feed replaced Home; the wordmark
  goes home
