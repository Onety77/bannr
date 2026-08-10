# Style references

Images that show a style **what good looks like**, attached to the
generation alongside the client's logo.

```
references/
  tech/          <- drop .jpg / .png / .webp in here
```

The folder name must match the style `id` in `lib/templates.js`, and
the style must carry `useReferences: true`. Right now that is `tech`
only.

## Why this exists

Some styles cannot be reached by description. Tech is the clearest
case: every prose rewrite either produced a house layout — logo one
side, name the other — or drifted into generic futurism. "Brand-grade
design work" is a bar you recognise in a second and can barely put
into words, so showing it is the only reliable way to set it.

## THE ONE RULE: NO RECOGNISABLE MARK, EVER

**A reference containing a logo will have that logo drawn into
somebody's banner.** Not "might" — it happened, twice, and the ban
against it was in the prompt both times.

The set opened with `01-google-voxel-pattern.jpg`, which was nothing
but Google's G repeated across the frame, and `04-mark-on-a-horizon.jpg`,
a four-panel mark glowing above a dark plain. Both marks turned up in
finished banners for a client called RHEA. No wording survives an image
whose entire subject is a famous logo, because you are asking a model
to look hard at a picture and then un-see the most salient thing in it.

So the rule is about the FILES, not the prompt: **nothing you put in
here may contain a logo, an icon, an emblem or a monogram.** A wordmark
set as typography is tolerable — type is the lesson in that case, and a
banner sets its own name anyway — but a symbol is not. If you find
yourself writing "it's fine, the prompt says not to copy it", that is
exactly the reasoning that shipped Google's logo to a customer.

## What they are for, and what they are not

They carry **how the thing is designed**: how much of the frame is left
empty, how few colours are used, how quietly the ground sits, how the
type is scaled and trusted.

They are **not content**. Nothing they depict may appear in the output —
not the subject, not the objects or scenes, not any word or logo.

**They must also agree with the brief.** Tek now says *this is design,
not a render* — no built scenes, no dramatic volumetric light. Two
references were dark cinematic renders (a satellite over Earth, a mark
on a night horizon) and were pulling directly against that, so they are
gone too. A reference that contradicts the written brief does not
balance it; it makes the instruction ambiguous, and ambiguity gets
resolved at random.

## Practical notes

- **Not in `public/`.** Anything there is served to anyone who asks.
  These are other people's work kept as a bar to clear, and they are
  part of what makes the output good. Neither belongs on a public URL.
- **Rotation.** Each variant in a run sees a different slice, so four
  options are pulled toward four different examples rather than all
  toward the same one. A set of 8 shown 3 at a time gives plenty of
  distinct combinations.
- **Downscaled to 640px** before sending. A reference is read for
  composition and craft, none of which needs full resolution, and this
  keeps the cost of adding three of them small.
- **Cached per process.** Add files and restart the dev server, or
  call `clearReferenceCache()`.
- **Empty is fine.** No folder, no readable files, anything at all:
  the style generates exactly as it did before. This is an
  enhancement, never a dependency.

## How many

Six to twelve is a good set. Fewer and the rotation repeats; many more
and you are mostly adding files nobody has looked at critically. Every
one should be something you would be pleased to have made — a
reference you are lukewarm about teaches lukewarm.

## The tech set is down to two, and needs rebuilding

`02-corriere-type-as-artwork` and `03-battery-geometry-restraint` are
what survived. Both teach the right thing — type carrying a whole
frame, and flat colour with a geometric system and real emptiness — and
neither hands over a symbol.

Four were removed on 10 Aug 2026: the two that leaked marks
(`01-google-voxel-pattern`, `04-mark-on-a-horizon`) and the two dark
cinematic renders that argued with the brief (`05-cinematic-ground-type-right`,
`06-apple-music-chromatic`, the latter also an Apple mark).

**Two is thin — rotation barely rotates.** Adding four to six more is
worth doing, and the bar is now explicit: brand-grade layout, quiet
ground, real negative space, confident type, and **no symbol anybody
could lift**. Editorial design, packaging systems, transit and wayfinding
graphics and exhibition posters are rich sources that rarely carry a
logo as their subject.

## Two more held back in `_review/`

`_review/` is ignored by the loader (the extension filter skips
directories), so anything in there is parked rather than deleted. Move
a file back up one level to bring it into rotation.

**`apple-tv-poster-grid.jpg`** — not a banner. It is a screenshot of a
streaming app's poster wall: twenty different pieces of artwork in a
grid. As a reference for a single 3:1 banner it teaches the one thing
a banner must never be, which is a grid of thumbnails.

**`dippy-eth-lowpoly.jpg`** — wireframe lettering and low-poly
mountains. Competent, but it is close to the generic futurism the Tech
brief explicitly warns against, and the style is meant to clear a
higher bar than this. A reference you are lukewarm about teaches
lukewarm, and with a set this small each one carries real weight.

Both are judgement calls, not facts. If you disagree, move them back.
