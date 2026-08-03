# Animated banners — feasibility

What it would actually take to ship a moving banner: ~10s, 3:1, GIF
out. Written before any code, because three of the findings below
could change whether it is worth doing at all.

Everything here is an estimate from what we know today. Model prices
and capabilities move fast — the numbers marked **VERIFY** should be
re-checked against live pricing pages before anyone commits money.

---

## 0. Check this first, before reading the rest

**Does DEX Screener actually accept animated headers, and in what
format and size?**

This is the entire project's load-bearing assumption and it is not
ours to assume. Everything below is wasted if the answer is "static
images only", and the answer materially changes the build if it is
"animated, but WebP only, 5MB max".

How to find out in an hour, not a sprint: take any token you can edit
the profile of, try to upload a small animated GIF and a small
animated WebP, and see what happens. That single test decides the
format, the length and the resolution of everything that follows.

Do not build anything before this is answered.

---

## 1. The format problem — GIF is the wrong container

GIF is a 1987 format: 256 colours per frame, no real interframe
compression, no alpha blending. It is a bad fit for photographic or
illustrated banners, and a terrible one at this size.

Rough sizes for 1500×500:

| Length | FPS | Format | Estimated size |
|---|---|---|---|
| 10s | 24 | GIF | 40–90 MB — unusable |
| 10s | 12 | GIF | 20–45 MB — unusable |
| 5s | 12 | GIF | 10–22 MB — probably too big |
| 3s | 12 | GIF | 6–13 MB — borderline |
| 10s | 24 | **WebP** | 3–8 MB |
| 10s | 24 | **MP4 (h264)** | 1–3 MB |

GIF is 10–20× larger than either modern option for visibly worse
quality — the banding on a gradient sky at 256 colours is severe, and
our styles are full of gradient skies.

**Consequences if GIF is genuinely required:** the product is ~3
seconds, not 10, at 12fps, and styles have to be steered toward flat
colour and limited palettes (which suits Tek and Collectibles and
actively fights Anime and Glow). Worth knowing that before promising
anyone ten seconds.

**If WebP or MP4 is accepted**, most of this problem disappears and
10s is comfortable.

---

## 2. The aspect ratio problem — nothing generates 3:1 natively

This is the one that most directly contradicts an existing product
principle. bannr's whole static pipeline exists because gpt-image-2
renders a true 1536×512 and **nothing is cropped**. No video model
offers 3:1.

What the common ratios cost us:

| Model ratio | Decimal | Height lost cropping to 3:1 |
|---|---|---|
| 16:9 | 1.78 | ~41% |
| 21:9 | 2.33 | ~22% |
| 2.39:1 | 2.39 | ~20% |

Three possible approaches, in order of how much they preserve:

**A. Image-to-video from our own 3:1 still.** Generate the banner
exactly as we do now — native 3:1, art-directed, the part that already
works — then hand that frame to a video model as the first frame and
ask only for motion. Strongest option: the composition is already
correct and already ours, and the video model is doing the easy half
of the job. Whether a given API preserves an unusual input ratio or
forces it to 16:9 is the thing to test.

**B. Generate at 21:9 and crop.** ~22% loss. Survivable if the
concept is composed for a centre band, which the art director could be
told to do. Costs us the "nothing is cropped" claim.

**C. Generate at 16:9 composed for a letterboxed centre strip.** Wasteful
— 41% of the pixels are paid for and thrown away — but every model
supports it.

**Start with A.** If A works, this section stops being a problem.

---

## 3. The architecture change — this cannot run in a request

Video generation takes **60–180 seconds**, sometimes longer under
load. Our image route runs at `maxDuration = 120` and that is already
near the ceiling.

So the synchronous request/response shape the whole app is built on
does not survive. What is needed:

- **A jobs collection.** `jobs/{id}` with status, the brief, the
  result URL. Written when a run starts.
- **Kick off and return immediately.** The route starts the video job
  and responds with a job id — it does not wait.
- **Polling or webhooks.** The client polls `/api/jobs/{id}`, or the
  provider calls us back. Polling is simpler and we already built the
  pattern for payment claims.
- **Resumability.** Closing the tab must not lose a job someone paid
  for. The draft store already survives tab switches; this needs to
  survive a full reload, which the current one deliberately does not.
- **Firebase Storage.** A 10s video cannot be a data URL in a
  Firestore document. This is **G5b**, already on the roadmap for
  full-resolution stills — animated banners make it mandatory rather
  than nice.

This is the largest single piece of work here, and none of it is about
video specifically. It is the async-job infrastructure the app has so
far avoided needing.

---

## 4. The pipeline, end to end

```
brief + logo
   ↓
art director (text)          — a MOTION director: what moves, and why
   ↓
gpt-image-2                  — the 3:1 still, exactly as today
   ↓
[user approves the still?]   — decision point, see §6
   ↓
video model (image-to-video) — motion only, still as first frame
   ↓
crop/pad to exactly 1500×500
   ↓
encode: GIF (palette-optimised) or WebP or MP4
   ↓
Firebase Storage → signed URL → history
```

The still stage is unchanged, which is the good news: everything
already built — the directors, the references, the framing rules —
carries over untouched. Only two stages are new.

**The motion director** is a real design problem in its own right. A
banner that moves badly is worse than one that does not: drifting
zooms and wobbling logos read as cheap. The brief for it would be
restraint — one thing moves, slowly, and loops seamlessly. Loop
seamlessness in particular is a hard constraint most video models do
not offer natively and may need a ping-pong or crossfade at encode
time.

---

## 5. What it costs

**VERIFY every figure here against live pricing before committing.**

Per-second pricing for image-to-video, as of this writing, spans
roughly $0.05–$0.50/s depending on provider and quality tier. For a
single 10s clip:

| | Low end | High end |
|---|---|---|
| Video generation, 10s | $0.50 | $5.00 |
| The still (unchanged) | $0.024 | $0.024 |
| Motion director (text) | $0.008 | $0.008 |
| Encoding + storage | ~$0.001 | ~$0.005 |
| **Per animated banner** | **~$0.53** | **~$5.03** |

Against today: a full 3-option static run costs about **$0.073**.

**So one animated banner costs 7× to 70× a whole static run.**

At 3 seconds instead of 10, divide the video line by ~3: roughly
$0.16–$1.50 per banner. That alone may decide the length.

### What that means for credits

Current: 3 credits = one run of 3 static options ≈ $0.073, and the
`degen` pack sells 160 credits for 0.35 SOL.

If an animated banner costs ~$1.00 to make, it needs to be priced like
40 static runs. At current pack rates that is roughly **120 credits**,
i.e. most of a `degen` pack for one moving banner.

Three honest implications:

1. **One option per run, not three.** Three animated options is
   $1.50–$15 of cost per click. Generate one, let them edit or
   re-roll deliberately.
2. **The still should be approved first.** Paying for video on a
   composition the user then rejects is the single worst outcome
   available. Generate the still, show it, charge the video credits
   only when they say "animate this one".
3. **Pricing has to be checked against SOL, not USD.** Costs are in
   dollars and packs are in SOL — already flagged as H6 — and a 70×
   cost item makes that exposure much sharper.

---

## 6. Phases

**Phase 0 — answer §0.** An hour. Everything depends on it.

**Phase 1 — prove the still animates well.** No product, no UI. Take
three existing banners, run them through two or three image-to-video
APIs by hand, and answer: does it preserve 3:1, does the motion look
deliberate or cheap, does it loop, what does it actually cost. This is
the cheapest possible way to learn whether the product is good, and it
should be done before a single line of app code.

**Phase 2 — async job infrastructure.** Jobs collection, polling,
Storage, resumable across reloads. Useful regardless of video: it also
fixes the "close the tab mid-generation" gap for stills.

**Phase 3 — the motion director + encoding.** The prompt layer, the
crop, palette optimisation, loop handling.

**Phase 4 — product.** Pricing, the approve-the-still-first flow, the
UI, history for animated entries.

Realistically Phase 1 is days, Phases 2–4 are weeks — and Phase 2 is
most of it.

---

## 7. Recommendation

**Do Phase 0 and Phase 1. Decide after.**

The reason to be enthusiastic: a moving banner on a page of static
ones is an enormous attention advantage, it is exactly the kind of
thing a project will pay a premium for, and — critically — our
existing pipeline does the hard half. The still is already
art-directed and already 3:1. Everything up to that point is done.

The reason to be careful: 7–70× the cost per unit, a format that
fights us, an aspect ratio nothing supports natively, and a
substantial infrastructure change — for a feature that is worthless if
the answer to §0 is "static only".

Phase 1 costs a few dollars and a day, and answers the only question
that matters: does it look good enough that someone would pay 40×
for it.
