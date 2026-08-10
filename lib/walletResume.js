// ============================================================
// ONE OWNER FOR THE WALLET REDIRECT.
//
// useAuth is a hook, and several components call it on the same page
// — the nav and the page itself, at least. When the resume lived
// inside it, every one of those instances raced to consume the same
// redirect, and it went wrong in two ways at once:
//
//   THE WINNER KEPT THE STATE. handleRedirect scrubs the URL, so the
//   first caller got the result and the rest got null. If the nav
//   won, the settings page never learned there was a signature
//   waiting and never drew the button — the flow just stopped.
//
//   AND THEY COULD BOTH GET IN. There was an await between "is this
//   a redirect?" and "handle it", so both instances passed the check
//   before either acted.
//
// So the redirect is consumed HERE, exactly once per page load, by
// module state that no amount of re-rendering can duplicate. Every
// useAuth subscribes and sees the same thing.
//
// A DECRYPT FAILURE IS A DEAD END, NOT A RETRY. It means the stored
// keypair no longer matches the one the wallet answered — a second
// connect overwrote it, or storage was cleared between hops. The
// state is unrecoverable at that point, so it is thrown away rather
// than left to fail again, and the message says what to do.
// ============================================================
"use client";
import { setUser } from "@/lib/credits";

let state = {
  pendingSign: null, // challenge fetched, waiting for a tap
  linked: null,      // a flow that finished
  error: null,
  busy: false,
};

const subs = new Set();
let started = false;

export function getWalletState() {
  return state;
}

export function subscribeWallet(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function setWalletState(patch) {
  state = { ...state, ...patch };
  for (const fn of subs) fn(state);
}

// Runs at most once per page load, however many hooks ask.
export function resumeOnce() {
  if (started) return;
  started = true;

  (async () => {
    const { default: DeepLink } = await import("@/lib/deeplink").catch(() => ({}));
    if (!DeepLink?.isRedirect || !DeepLink.isRedirect()) return;

    const flow = await import("@/lib/walletFlow");
    const result = DeepLink.handleRedirect();
    if (!result) return;

    const pending = flow.readFlow();

    if (result.type === "error") {
      flow.endFlow();
      // Anything about a key or a payload means the saved state is
      // inconsistent with what the wallet just answered. Leaving it
      // in place means the next attempt fails the same way, which is
      // exactly how this looked: an error that would not clear.
      const broken = /decrypt|expired|session/i.test(result.message || "");
      if (broken) DeepLink.disconnectAll();
      setWalletState({
        pendingSign: null,
        busy: false,
        error: /reject|declin|cancel/i.test(result.message)
          ? null // a decision, not a fault
          : broken
            ? "That wallet connection went stale. Tap connect and approve it once more."
            : result.message,
      });
      return;
    }

    if (result.type === "connect") {
      if (!pending) return; // a stray redirect, not something we asked for

      // There is no "buy" branch here any more. Paying is a Solana Pay
      // transfer request now — the wallet builds and sends it, nothing
      // comes back through a redirect, and the payment is found on
      // chain by its reference. See lib/solanaPay.js. So every connect
      // that reaches this point is on its way to a signature.
      try {
        const challenge = await flow.fetchChallenge(result.publicKey);
        setWalletState({
          pendingSign: {
            provider: result.provider,
            address: result.publicKey,
            message: challenge.message,
          },
          busy: false,
          error: null,
        });
      } catch (e) {
        flow.endFlow();
        setWalletState({ busy: false, error: e?.message || "Couldn't start signing." });
      }
      return;
    }

    if (result.type === "message") {
      if (!pending?.nonce || !pending?.address) { flow.endFlow(); return; }
      setWalletState({ busy: true, pendingSign: null });
      try {
        const out = await flow.submitSignature({
          intent: pending.intent,
          address: pending.address,
          nonce: pending.nonce,
          signature: result.signature,
        });
        flow.endFlow();
        // The tab this started in is still open, still showing
        // "Approve in your wallet". This is the only signal that
        // reaches it.
        flow.announceDone();
        setUser(out.user);
        setWalletState({
          busy: false,
          error: null,
          linked: { intent: pending.intent, merged: out.merged || 0 },
        });
      } catch (e) {
        flow.endFlow();
        setWalletState({ busy: false, error: e?.message || "That didn't work. Please try again." });
      }
    }
  })();
}
