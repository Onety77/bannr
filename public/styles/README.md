# Style preview thumbnails

Drop the seven preview images here, named exactly as below (lowercase, `.jpg`).
They're referenced by the `thumb` field of each style in `lib/templates.js`.

```
tech.jpg
meme.jpg
him.jpg
pov.jpg
glow.jpg
anime.jpg
collectibles.jpg
```

**Aspect ratio: 3:1**, same as the banners themselves — the picker tiles are
3:1, so anything else gets center-cropped to fit.

Suggested size **600×200** (enough for a sharp tile on a retina screen without
bloating the page). Keep each file under ~120KB; seven of these load on every
visit to `/create`.

Missing or misnamed files are safe — the picker falls back to a name-only tile
with the style's accent colour, so nothing breaks while you're still making
them. To add a seventh style later, add the object in `lib/templates.js` with
its own `thumb` filename and drop the image here.
