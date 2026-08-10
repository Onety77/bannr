# bannr

1500×500 DEX Screener banners, plus a PFP maker, ahead of a $BANNR launch.
Next.js 14 · gpt-image-2 · Solana wallet auth · Firestore · SOL payments.

**Read [HANDOFF.md](HANDOFF.md) before doing anything substantial.** It carries
the decisions, what has already been tried and failed, and how the prompts are
built. This file is only the part that must never be got wrong.

```
npm run check    # TDZ, CSS, nav and event-handler guards — also runs on prebuild
npm test         # 27 regression files, ~1800 assertions
npm test pfp     # filtered by filename
```

## Rules

**Answer questions before building.** If Aminu asks what we should do, tell
him and stop. He said this after a whole feature shipped in reply to a
question and had to be reverted.

**Never say AI.** Nothing user-facing mentions AI, models, prompts or
generation. It is a design service that happens to be instant.

**Say what the field is, then stop.** "Optional" is a whole sentence. Examples
go in the placeholder, two at most, never in a hint above it. A hint that
explains the mechanism, justifies the default or teaches the concept is
written for us. The audience is crypto-native — explaining wallets, CAs or
DEX Screener insults them. Error messages are the exception: "you weren't
charged" is the one thing someone needs told.

**Never volunteer safety reassurance.** Saying it is safe plants the doubt.

**No auto-retry on 429.** It may be our own billing failing, and retrying
hides it.

**Do not work scared.** If a change needs the existing thing reworked, rework
it rather than bolting a flag onto the side.

## Structure

- Prompts live in `lib/templates.js` and `lib/pfp.js`, both `server-only`.
  Client-visible metadata is in `lib/styles.js` and `lib/pfpStyles.js`.
  Never import a prompt file from a client component — the prompts were once
  readable in the browser bundle.
- No composite Firestore indexes anywhere. Over-fetch and filter in memory.
- Hooks go below the state they read. `check-tdz` exists because one did not.
- Write JS with the Write tool, not shell heredocs — `${}` gets eaten.

## Voice

Direct, lead with the answer, say when something is wrong including my own
work. No hedging, no wall of caveats. When there is a real risk in what was
asked for, name it in a sentence and build it anyway — it is his call.
