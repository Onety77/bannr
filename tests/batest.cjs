// RUNS squareLogo for real against a recording canvas, and checks the
// card overlay that replaced the composite.
const fs = require("fs");
const R = require("path").join(__dirname, "..") + "/";
const read = (f) => fs.readFileSync(R + f, "utf8").replace(/\r\n/g, "\n");
let bad = 0;
const ok = (c, m) => { console.log((c ? "  PASS  " : "  FAIL  ") + m); if (!c) bad++; };

const src = read("lib/postLogo.js")
  .replace(/^"use client";$/m, "")
  .replace(/^export /gm, "");

let draws = [];
let canvasSize = null;
let quality = null;
let dataLen = 4;

global.document = {
  createElement() {
    const c = { width: 0, height: 0 };
    c.getContext = () => ({
      drawImage(img, x, y, w, h) { draws.push({ x, y, w, h }); },
    });
    c.toDataURL = (type, q) => {
      canvasSize = { w: c.width, h: c.height };
      quality = q;
      return `data:${type};base64,` + "A".repeat(dataLen);
    };
    return c;
  },
};

let nextImage = null;
global.Image = class {
  constructor() {
    setTimeout(() => {
      const spec = nextImage;
      if (!spec || spec.fail) { this.onerror?.(); return; }
      this.width = spec.w; this.height = spec.h;
      this.onload?.();
    }, 0);
  }
  set src(v) { this._src = v; }
  get src() { return this._src; }
};

const mod = new Function(src + "\nreturn { squareLogo, MAX_LOGO };")();
const run = async (spec, len = 4) => {
  nextImage = spec; draws = []; dataLen = len;
  return mod.squareLogo("blob:x");
};

(async () => {
  console.log("\n1. SQUARE, AT 256");
  {
    const out = await run({ w: 512, h: 512 });
    ok(typeof out === "string" && out.startsWith("data:image/jpeg"), "returns a JPEG data URL");
    ok(canvasSize.w === 256 && canvasSize.h === 256, "on a 256x256 canvas");
    ok(quality === 0.82, "at quality 0.82");
    const d = draws[0];
    ok(d.w === 256 && d.h === 256, "a square logo fills it exactly");
    ok(d.x === 0 && d.y === 0, "with no offset");
  }

  console.log("\n2. A TALL LOGO IS CROPPED, NOT SQUASHED");
  {
    await run({ w: 400, h: 1200 });
    const d = draws[0];
    ok(Math.abs(d.w / d.h - 400 / 1200) < 1e-9, "its own aspect ratio is preserved");
    ok(d.w >= 256 - 1e-9 && d.h >= 256 - 1e-9, "while still covering the square");
    ok(Math.abs((d.x + d.w / 2) - 128) < 1e-9, "centred horizontally");
    ok(Math.abs((d.y + d.h / 2) - 128) < 1e-9, "and vertically, so the crop takes the middle");
    ok(d.y < 0, "overflowing top and bottom, to be clipped by the canvas");
  }

  console.log("\n3. A WIDE LOGO");
  {
    await run({ w: 1200, h: 300 });
    const d = draws[0];
    ok(Math.abs(d.w / d.h - 4) < 1e-9, "4:1 stays 4:1");
    ok(d.x < 0 && Math.abs((d.x + d.w / 2) - 128) < 1e-9, "cropped from the centre, not the left");
  }

  console.log("\n4. IT NEVER BREAKS A POST");
  ok((await run({ fail: true })) === null, "an image that will not load returns null");
  ok((await mod.squareLogo("")) === null, "no source, no logo");
  ok((await mod.squareLogo(null)) === null, "and nothing at all is handled");
  {
    // A logo big enough to threaten the document is dropped rather
    // than posted — the banner is what someone came to publish.
    const out = await run({ w: 512, h: 512 }, mod.MAX_LOGO + 1);
    ok(out === null, "one over the size cap is dropped, not posted");
    const fine = await run({ w: 512, h: 512 }, 100);
    ok(typeof fine === "string", "a normal one is kept");
  }

  console.log("\n5. NOTHING IS BAKED INTO THE IMAGE");
  {
    const PB = read("components/PostButton.jsx");
    const P = read("lib/postLogo.js");
    ok(!fs.existsSync(R + "lib/beforeAfter.js"), "the compositing module is GONE, not just unused");
    ok(!/composeBeforeAfter|BA_RATIO/.test(PB), "and nothing still calls it");
    ok(!/drawImage\(banner|BANNER_H|BAND/.test(P), "the logo module never touches the banner");
    ok(PB.includes("const src = prepared ? variant.dataUrl : await shrink(variant.dataUrl, 900, 300);"),
       "the posted image is the banner at 3:1, exactly as it was made");
    ok(!/ratio,/.test(PB), "and no ratio is sent, because every new post is 3:1");
    ok(PB.includes("logo: postLogo,"), "the logo travels as its own field");
    ok(PB.includes("const postLogo = found ? await squareLogo(found) : null;"), "squared first");
  }

  console.log("\n6. THE CARD PUTS IT HALF OVER THE EDGE");
  {
    const CSS = read("app/globals.css");
    const CARD = read("components/FeedCard.jsx");
    const SEL = ".fcard-shot .fcard-pfp-img {";
    const rule = CSS.slice(CSS.indexOf(SEL), CSS.indexOf("}", CSS.indexOf(SEL)));
    // Specificity, which is what this bug was: a class plus a type
    // selector (0,1,1) beats a lone class (0,1,0), so the logo rule
    // has to carry a second class of its own.
    ok(CSS.includes(SEL), "the logo rule is scoped inside .fcard-shot, so it outranks any `.fcard-shot img`");
    ok(/position: absolute;/.test(rule), "absolutely positioned");
    ok(/top: 0;/.test(rule), "anchored to the TOP of the artwork");
    ok(/transform: translateY\(-50%\);/.test(rule), "and pulled up by exactly half — half on the banner, half on the card");
    ok(/border-radius: 50%;/.test(rule), "a circle, like a profile picture");
    ok(/border: 4px solid var\(--card\);/.test(rule), "ringed in the CARD's colour, so it reads as punched through rather than printed on");
    ok(/box-shadow:/.test(rule), "with a shadow lifting it off the artwork");
    ok(/z-index: 2;/.test(rule), "above the banner it overlaps");
    ok(/right: 14px;/.test(rule), "pinned to the RIGHT, the end of the coin row that holds nothing");
    // \b so it cannot match `padding-left` etc, and no ^ anchor — the
    // declaration is indented, which an anchored version would miss
    // and then pass for the wrong reason.
    ok(!/\bleft:/.test(rule), "and not the left, where it had to shove the ticker aside");
    ok(!/padding-left: calc\(14px \+ var\(--pfp\)/.test(CSS), "the old left indent on the row is gone too");
    ok(/object-fit: cover;/.test(rule), "and never squashed, even if the stored logo somehow is not square");

    // The trap: the generic .fcard-shot img rule would make it fill
    // the box at opacity 0 and it would simply never appear.
    ok(CSS.includes(".fcard-shot img:not(.fcard-pfp-img) {"), "the fill-the-box rule EXCLUDES it, or it would be invisible");
    ok(!/^\.fcard-shot img \{/m.test(CSS), "and no unscoped version of that rule is left");

    // Clearance: the coin row must reserve the overhanging half, or
    // the logo climbs into the handle row above it.
    ok(CSS.includes("min-height: calc(var(--pfp) / 2);"), "the row above reserves exactly the half that overhangs");
    ok(CSS.includes("padding-right: calc(14px + var(--pfp) + 12px);"), "and keeps that end clear, so a wrapping ticker cannot grow under it");
    ok(/\.fcard-pfp \{ --pfp: \d+px; \}/.test(CSS), "sized in px");
    ok(!/--pfp: [\d.]+%/.test(CSS), "NEVER a percentage — a % in min-height resolves against height and would compute to nothing");
    {
      // Bigger than the old baked-in logo, which is what was asked.
      const sizes = [...CSS.matchAll(/--pfp: (\d+)px/g)].map((m) => Number(m[1]));
      ok(sizes.length === 3, "three sizes, one per breakpoint");
      ok(sizes.every((s, i) => i === 0 || s > sizes[i - 1]), "growing with the screen");
      ok(sizes[0] >= 80, "and starting at " + sizes[0] + "px on a phone");
    }

    ok(CARD.includes('className={`fcard${post.logo ? " fcard-pfp" : ""}`}'), "the card flags itself only when there is a logo");
    ok(CARD.includes('{post.logo && ('), "and only renders one when there is");
    ok(CARD.includes("{(label || post.ca || post.logo) && ("), "the strip above is rendered even with no ticker, so the logo always has somewhere to rise into");
    {
      const pfpAt = CARD.indexOf('className="fcard-pfp-img"');
      const shotAt = CARD.indexOf('className="fcard-shot"');
      const actAt = CARD.indexOf('className="fcard-actions"');
      ok(pfpAt > shotAt && (actAt < 0 || pfpAt < actAt), "and it lives INSIDE the artwork box, which is what it is positioned against");
    }
  }

  console.log("\n7. THE FEED IS SUSPICIOUS OF IT");
  {
    const FEED = read("lib/feed.js");
    const logoOf = new Function(
      "const MAX_LOGO = 60000;\n" + FEED.slice(FEED.indexOf("function logoOf"), FEED.indexOf("}", FEED.indexOf("if (!s.startsWith")) + 1) + "\nreturn logoOf;"
    )();
    ok(logoOf("data:image/jpeg;base64,AAA") === "data:image/jpeg;base64,AAA", "an inline image is kept");
    ok(logoOf("https://evil.example/track.gif") === null, "A URL IS REFUSED — it would turn every reader into a request to someone else's host");
    ok(logoOf("data:image/png;base64," + "A".repeat(60_001)) === null, "and one over the cap, which could take the document past Firestore's limit");
    ok(logoOf(null) === null, "nothing is nothing");
    ok(logoOf(undefined) === null, "so is undefined");
    ok(logoOf({}) === null, "and an object cannot smuggle anything through");
    ok(FEED.includes("logo: logoOf(body.logo),"), "publish stores it through that check");
    ok((FEED.match(/logo: p\.logo \|\| null,/g) || []).length === 4, "and all 4 read paths return it");
  }

  console.log(bad ? "\n" + bad + " FAILED\n" : "\nall green\n");
  process.exit(bad ? 1 : 0);
})();
