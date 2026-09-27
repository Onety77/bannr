// ============================================================
// HOW LARGE AN UPLOADED IMAGE MAY BE ONCE DECODED.
//
// A file's size says nothing about its pixels. A few-kilobyte PNG can
// declare 16,000 × 16,000, and sharp's own ceiling is ~268 million
// pixels — about a gigabyte of memory to decode one, which is more
// than a function has. One crafted upload would take the instance down
// with every run that was sharing it.
//
// 40 megapixels is a 48MP phone photo's neighbourhood, far above
// anything the client sends after lib/downscale.js, and a bounded
// amount of memory. /api/convert has used the same number since it
// was written.
//
// Passed as the second argument wherever a browser's bytes reach
// sharp: sharp(buf, DECODE).
// ============================================================
export const UPLOAD_PIXELS = 40_000_000;
export const DECODE = { limitInputPixels: UPLOAD_PIXELS };
