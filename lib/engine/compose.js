// ============================================================
// COMPOSITING ENGINE
// Takes: background (PNG buffer), user logo (buffer, optional),
// brief + template layout → final 1500x500 banner PNG.
// The ticker/name here are ALWAYS pixel-perfect. This is the
// layer that guarantees no paid banner ever ships with a typo'd
// ticker, whatever the AI art layer does.
// ============================================================

import sharp from "sharp";
import { BANNER_W as W, BANNER_H as H } from "@/lib/templates";

const esc = (s = "") =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Build the SVG text/decoration overlay for a template layout.
// The big "ticker" slot is really the hero-text slot: if the brief
// has no ticker, the coin name is promoted into it (and the smaller
// name line is skipped) so a name-only banner still leads strong.
function overlaySVG(template, brief, canvasW = W) {
  const L = template.layout;
  const color = template.text.color;
  const accent = template.accent;
  const rawTicker = (brief.ticker || "").trim();
  const rawName = (brief.name || "").trim();
  const ticker = esc((rawTicker || rawName || "$COIN").toUpperCase());
  const nameText = rawTicker ? rawName : ""; // name already shown as hero when no ticker
  const name = esc(template.layout.name.upper ? nameText.toUpperCase() : nameText);
  const tag = esc(brief.tagline || "");

  const fontStack = `'DejaVu Sans', 'Helvetica Neue', Arial, sans-serif`;

  let defs = `<filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="7" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.45"/>
    </filter>`;

  const tickerFilter = L.ticker.glow ? `filter="url(#softGlow)"` : `filter="url(#drop)"`;
  const tickerStroke = L.ticker.outline
    ? `stroke="#0E1220" stroke-width="8" paint-order="stroke fill"`
    : "";

  let accentDecor = "";
  if (template.text.accentUse === "underline") {
    accentDecor = `<rect x="${L.ticker.x + 4}" y="${L.ticker.y + 18}" width="150" height="6" rx="3" fill="${accent}"/>`;
  } else if (template.text.accentUse === "dot") {
    accentDecor = `<circle cx="${L.ticker.x - 26}" cy="${L.ticker.y - L.ticker.size / 3}" r="7" fill="${accent}"/>`;
  }

  return `<svg width="${canvasW}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}</defs>
  <text x="${L.ticker.x}" y="${L.ticker.y}" font-family="${fontStack}"
    font-size="${L.ticker.size}" font-weight="${L.ticker.weight}"
    letter-spacing="${L.ticker.tracking}" fill="${color}" ${tickerFilter} ${tickerStroke}>${ticker}</text>
  ${accentDecor}
  ${name ? `<text x="${L.name.x}" y="${L.name.y}" font-family="${fontStack}"
    font-size="${L.name.size}" font-weight="${L.name.weight}"
    letter-spacing="${L.name.tracking}" fill="${color}" opacity="0.92" filter="url(#drop)">${name}</text>` : ""}
  ${tag ? `<text x="${L.tag.x}" y="${L.tag.y}" font-family="${fontStack}"
    font-size="${L.tag.size}" font-weight="${L.tag.weight}"
    letter-spacing="${L.tag.tracking}" fill="${color}" opacity="0.7" filter="url(#drop)">${tag}</text>` : ""}
</svg>`;
}

// Circular-mask + optional accent ring treatment for the logo.
async function prepareLogo(logoBuffer, template) {
  const size = template.layout.logo.size;
  const inner = await sharp(logoBuffer)
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();

  const ring = template.layout.logo.ring
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="none" stroke="${template.accent}" stroke-width="6"/>`
    : "";

  const maskSvg = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#fff"/></svg>`
  );
  const ringSvg = Buffer.from(`<svg width="${size}" height="${size}">${ring}</svg>`);

  return sharp(inner)
    .composite([
      { input: maskSvg, blend: "dest-in" },
      { input: ringSvg, blend: "over" },
    ])
    .png()
    .toBuffer();
}

/**
 * Compose one final banner.
 * @param {Buffer} backgroundPng  1500x500-ish PNG (will be cover-fitted)
 * @param {Buffer|null} logoPng   user logo (optional)
 * @param {object} template
 * @param {object} brief          { name, ticker, tagline }
 * @param {boolean} withText      false = "AI text" variant (art only + logo)
 */
export async function composeBanner(backgroundPng, logoPng, template, brief, withText = true, { width = W } = {}) {
  const bg = await sharp(backgroundPng)
    .resize(width, H, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();

  const layers = [];

  if (logoPng) {
    const logo = await prepareLogo(logoPng, template);
    layers.push({ input: logo, left: template.layout.logo.x, top: template.layout.logo.y });
  }

  if (withText) {
    layers.push({ input: Buffer.from(overlaySVG(template, brief, width)), left: 0, top: 0 });
  }

  return sharp(bg).composite(layers).png().toBuffer();
}
