// ============================================================
// PUBLIC ERROR COPY — the only thing that crosses the wire.
//
// Two rules, both non-negotiable:
//
//   1. Never name the AI provider. Which model renders the banners
//      is our business, not the customer's. Naming it tells every
//      user exactly where to go to cut us out, and makes our
//      outages read as someone else's product failing.
//
//   2. Never leak internal configuration. Nobody outside this repo
//      should ever be told to check an API key or an env file —
//      that copy was written for a developer and is meaningless,
//      and slightly alarming, to a paying customer.
//
// Once the provider's own taxonomy is stripped out, only three
// things remain that a user can actually act on:
//
//   - the brief tripped content checks  → they can change it
//   - it took too long                  → they can retry now
//   - anything else                     → our fault, retry later
//
// Quota, billing, a dead API key and an unexpected crash all
// collapse into that last bucket, because from the user's side
// they are identical: nothing they did, nothing they can fix.
//
// The real error is still logged server-side at the call site —
// only what the user sees is sanitised.
// ============================================================

// Shared refusal detection — the retry ladder needs the same answer
// to "was that a content refusal?" as the final classifier, or a
// retried error could be classified differently than the one that
// triggered the retry.
export function isPolicyError(err) {
  const msg = err?.message || "";
  const quota = /quota|rate.?limit|billing|insufficient/i.test(msg) || err?.status === 429;
  return !quota && (/content_policy|moderation|safety/i.test(msg) || err?.status === 400);
}

export function publicError(err, kind = "generate") {
  const msg = err?.message || "";
  const status = err?.status;
  const charge = kind === "edit" ? "You weren't charged." : "Your credits weren't spent.";

  // Message beats status code deliberately: the provider returns 400
  // for BOTH content-policy refusals and billing limits, and those
  // are opposite situations — one the user can fix, one they can't.
  const quota = /quota|rate.?limit|billing|insufficient/i.test(msg) || status === 429;
  const policy = !quota && (/content_policy|moderation|safety/i.test(msg) || status === 400);
  const timeout = /timed out|timeout/i.test(msg) || status === 504;

  // `reason` is for us, not the user: the routes use it to decide
  // whether this is worth recording for the admin refusal log.
  if (policy) {
    return {
      reason: "policy",
      status: 400,
      error:
        kind === "edit"
          ? `That change didn't clear our content checks. Try describing it another way. ${charge}`
          : `That brief didn't clear our content checks. Try a different description, name or image — a small change is usually enough. ${charge}`,
    };
  }

  if (timeout) {
    return {
      reason: "timeout",
      status: 504,
      error: `That one took too long to come back. Please try again. ${charge}`,
    };
  }

  return {
    reason: "internal",
    status: 502,
    error: `Something went wrong on our end. Give it a couple of minutes and try again. ${charge}`,
  };
}
