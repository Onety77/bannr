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

## What they are for, and what they are not

They carry **the standard**: how much care went in, how much emptiness
was tolerated, how confidently the type was set.

They are **not content**. The prompt states at length that nothing in
them may appear in the output — not the layout, the subject, the
palette, the typeface, or any word or logo in them — and that a banner
resembling one has failed. Without that, references replace a house
layout with a borrowed one, which is the same failure wearing better
clothes.

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
