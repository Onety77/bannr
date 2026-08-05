// ============================================================
// THE FUNNEL — three numbers a day.
//
//   landed     opened the site
//   started    typed a name or imported a contract address
//   generated  actually pressed Generate and got charged
//
// That is the whole thing. It answers the one question nobody could
// answer before: of the people who arrive, how many get as far as
// wanting a banner, and how many of THOSE get one. Two very different
// problems with two very different fixes, and until now we have been
// arguing about which one we have by reasoning from the shape of a
// page rather than from what people did on it.
//
// LAUNCH WEEK IS THE ONE WEEK THAT CANNOT BE RE-RECORDED, which is
// the only reason this is worth building before it is worth reading.
//
// NOT TRACKING. There is no third party, no cookie, no identifier and
// no per-person row — a counter cannot be read backwards into a
// person. Three integers in one document per day, and the document ID
// is the date:
//
//   stats/2026-08-05  { landed: 812, started: 210, generated: 34 }
//
// The date ID is the reason this needs no index and no query. Reading
// a week is seven known IDs handed to getAll in one round trip, which
// is also why it cannot break the way a where() + orderBy can.
//
// Increments are FIRE AND FORGET. A counter is never worth failing a
// request over, so every write here swallows its own errors and every
// caller is free to ignore the promise.
// ============================================================
import "server-only";
import { getAdminDb } from "@/lib/firebaseAdmin";

// The allowlist IS the validation. /api/track writes whatever the
// browser names, so anything not in here has to bounce — otherwise a
// stray call invents a field, and a document full of typos is worse
// than no numbers at all.
export const EVENTS = ["landed", "started", "generated"];

// GENERATED IS NOT ACCEPTED FROM A BROWSER. It is counted server-side
// inside the generate route, next to the code that spends the credit,
// so it cannot be inflated by anyone with a fetch() and an opinion. It
// is the number every other number is measured against; it is the one
// that has to be true.
export const CLIENT_EVENTS = ["landed", "started"];

export function dayKey(d = new Date()) {
  // UTC, deliberately. A day boundary that moves with whoever is
  // looking makes two people disagree about yesterday.
  return d.toISOString().slice(0, 10);
}

export async function bump(event, n = 1) {
  if (!EVENTS.includes(event)) return false;
  const db = getAdminDb();
  if (!db) return false;
  try {
    const { FieldValue } = require("firebase-admin/firestore");
    await db
      .collection("stats")
      .doc(dayKey())
      .set({ [event]: FieldValue.increment(n) }, { merge: true });
    return true;
  } catch (e) {
    // Deliberately quiet in the response, loud in the logs. Losing a
    // count is not a reason to fail whatever the caller was doing.
    console.error("[stats] bump failed:", e.message);
    return false;
  }
}

// The last `days` days, oldest first, with the gaps filled in. A day
// with no traffic has no document, and leaving it out would draw a
// chart that skips it — which reads as "nothing happened here" when
// it should read as "nothing happened here".
export async function recent(days = 14) {
  const db = getAdminDb();
  if (!db) return [];

  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(dayKey(d));
  }

  try {
    const refs = keys.map((k) => db.collection("stats").doc(k));
    const snaps = await db.getAll(...refs);
    const found = new Map();
    for (const s of snaps) if (s.exists) found.set(s.id, s.data() || {});
    return keys.map((k) => {
      const d = found.get(k) || {};
      return {
        day: k,
        landed: d.landed || 0,
        started: d.started || 0,
        generated: d.generated || 0,
      };
    });
  } catch (e) {
    console.error("[stats] read failed:", e.message);
    return [];
  }
}
