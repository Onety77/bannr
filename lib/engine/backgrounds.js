// ============================================================
// DEMO BACKGROUNDS — procedural SVG art per template style.
// Used when OPENAI_API_KEY is not set, so Bannr generates real
// composited banners the moment you run `npm run dev`.
// Each returns an SVG string at 1500x500. A seed varies output
// per variant so the 2–4 results aren't identical.
// ============================================================

import { BANNER_W as W, BANNER_H as H } from "@/lib/templates";

// deterministic pseudo-random from a seed
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function neon(seed, accent) {
  const r = rng(seed);
  let trails = "";
  for (let i = 0; i < 7; i++) {
    const y = 80 + r() * 380;
    const x1 = 500 + r() * 400;
    const len = 300 + r() * 600;
    const col = i % 2 ? accent : "#FF3D8A";
    trails += `<line x1="${x1}" y1="${y}" x2="${x1 + len}" y2="${y - 30 - r() * 60}"
      stroke="${col}" stroke-width="${2 + r() * 4}" stroke-linecap="round" opacity="${0.35 + r() * 0.5}" filter="url(#blur)"/>`;
  }
  let grid = "";
  for (let i = 0; i < 14; i++) {
    const x = 400 + i * 85;
    grid += `<line x1="${x}" y1="500" x2="${750 + (x - 750) * 0.3}" y2="300" stroke="${accent}" stroke-width="1" opacity="0.18"/>`;
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="70%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#1B1533"/><stop offset="100%" stop-color="#07060D"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${grid}${trails}
  <circle cx="${1150 + r() * 150}" cy="${120 + r() * 120}" r="${60 + r() * 50}" fill="${accent}" opacity="0.25" filter="url(#blur)"/>
</svg>`;
}

function clean(seed, accent) {
  const r = rng(seed);
  let blobs = "";
  for (let i = 0; i < 4; i++) {
    const cx = 850 + r() * 550;
    const cy = 80 + r() * 340;
    const rad = 90 + r() * 160;
    blobs += `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${i % 2 ? accent : "#B9C6FF"}" opacity="${0.14 + r() * 0.18}"/>`;
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#FAFAF7"/><stop offset="100%" stop-color="#EDF0FA"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${blobs}
  <path d="M 900 ${380 + r() * 60} Q 1150 ${180 + r() * 80} 1500 ${300 + r() * 100}"
    stroke="${accent}" stroke-width="3" fill="none" opacity="0.5"/>
</svg>`;
}

function pixel(seed, accent) {
  const r = rng(seed);
  const P = 25; // pixel size
  let px = "";
  // sky gradient bands
  const bands = ["#141034", "#1D1745", "#2A1E5C", "#41286E", "#5B2F72"];
  bands.forEach((c, i) => {
    px += `<rect x="0" y="${i * 70}" width="${W}" height="70" fill="${c}"/>`;
  });
  px += `<rect x="0" y="350" width="${W}" height="150" fill="#0D0A22"/>`;
  // stars
  for (let i = 0; i < 40; i++) {
    px += `<rect x="${Math.floor(r() * 60) * P}" y="${Math.floor(r() * 12) * P}" width="${P / 3}" height="${P / 3}" fill="#F8F4E3" opacity="${0.4 + r() * 0.6}"/>`;
  }
  // skyline
  for (let i = 0; i < 20; i++) {
    const bw = P * (1 + Math.floor(r() * 3));
    const bh = P * (2 + Math.floor(r() * 7));
    px += `<rect x="${700 + i * P * 2}" y="${350 - bh}" width="${bw}" height="${bh}" fill="${r() > 0.5 ? "#1A1440" : "#241B52"}"/>`;
    if (r() > 0.6) px += `<rect x="${705 + i * P * 2}" y="${360 - bh}" width="${P / 2.5}" height="${P / 2.5}" fill="${accent}"/>`;
  }
  // pixel sun
  px += `<rect x="1240" y="90" width="${P * 4}" height="${P * 4}" fill="#FFB020"/><rect x="1215" y="115" width="${P * 6}" height="${P * 2}" fill="#FF7A48"/>`;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${px}</svg>`;
}

function cartoon(seed, accent) {
  const r = rng(seed);
  let rays = "";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x2 = 1250 + Math.cos(a) * 900;
    const y2 = 250 + Math.sin(a) * 900;
    rays += `<polygon points="1250,250 ${x2},${y2} ${x2 + 80},${y2 + 40}" fill="${i % 2 ? accent : "#FF8A3D"}" opacity="0.5"/>`;
  }
  let clouds = "";
  for (let i = 0; i < 4; i++) {
    const cx = 150 + r() * 500;
    const cy = 70 + r() * 120;
    clouds += `<ellipse cx="${cx}" cy="${cy}" rx="${70 + r() * 50}" ry="${28 + r() * 14}" fill="#FFFFFF" opacity="0.9"/>
      <ellipse cx="${cx + 50}" cy="${cy + 10}" rx="${50 + r() * 30}" ry="${22 + r() * 10}" fill="#FFFFFF" opacity="0.9"/>`;
  }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#5EC9FF"/><stop offset="100%" stop-color="#9BE0FF"/>
  </linearGradient>
  <clipPath id="c"><rect width="${W}" height="${H}"/></clipPath></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g clip-path="url(#c)">${rays}</g>
  <circle cx="1250" cy="250" r="110" fill="#FFD84D" stroke="#0E1220" stroke-width="8"/>
  ${clouds}
  <ellipse cx="750" cy="520" rx="900" ry="90" fill="#5BD27A"/>
</svg>`;
}

function minimal(seed, accent) {
  const r = rng(seed);
  const sweepY = 120 + r() * 200;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0C0C0E"/><stop offset="100%" stop-color="#131316"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="8"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <path d="M 1000 ${sweepY + 200} Q 1250 ${sweepY - 100} 1520 ${sweepY + 40}"
    stroke="${accent}" stroke-width="5" fill="none" filter="url(#glow)" opacity="0.9"/>
  <path d="M 1000 ${sweepY + 200} Q 1250 ${sweepY - 100} 1520 ${sweepY + 40}"
    stroke="${accent}" stroke-width="2" fill="none"/>
  <circle cx="${1380 + r() * 60}" cy="${sweepY + r() * 40}" r="4" fill="${accent}"/>
</svg>`;
}

const KINDS = { neon, clean, pixel, cartoon, minimal };

export function demoBackgroundSVG(template, seed) {
  const fn = KINDS[template.demo.kind] || neon;
  return fn(seed, template.accent);
}
