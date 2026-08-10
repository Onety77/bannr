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
  pendingPay: null,  // address known, waiting for a transaction
  paid: null,        // broadcast, waiting to be confirmed
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
        pendingPay: null,
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

      // Paying needs no challenge: the transaction is the proof, and
      // the memo inside it names the account.
      if (pending.intent === "buy") {
        setWalletState({
          pendingPay: {
            provider: result.provider,
            address: result.publicKey,
            payload: pending.payload || null,
          },
          busy: false,
          error: null,
        });
        return;
      }

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

    // A SIGNED transaction, not a broadcast one. Phantom retired the
    // method that did both, so the wallet now hands the bytes back and
    // submitting them is ours — see /api/solana/send.
    //
    // It happens here rather than on the credits page because until
    // this succeeds there is no signature, and a signature is the only
    // thing the rest of the flow knows how to talk about. The credits
    // page still owns confirming and granting, unchanged.
    if (result.type === "signed") {
      try {
        const res = await fetch("/api/solana/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: result.transaction }),
        });
        const out = await res.json();

        // ══ AN EXPIRED PAYMENT IS A RETRY, NOT A RESTART ══
        //
        // A blockhash dies in about a minute and the round trip
        // through the wallet can outlast one. Ending the flow here
        // sent the user all the way back to the beginning — including
        // the CONNECT hop — to fix a signature that had gone stale
        // while the connection behind it was perfectly alive.
        //
        // So the flow is left open and the wallet is put back in
        // pending: the credits page rebuilds the transaction on its
        // timer and offers the button again. One approval, not four.
        if (out.expired) {
          const live = DeepLink.restoreSession(result.provider);
          setWalletState({
            busy: false,
            error: out.error,
            pendingPay: live?.publicKey
              ? { provider: result.provider, address: live.publicKey, payload: pending?.payload || null }
              : null,
          });
          if (!live?.publicKey) flow.endFlow();
          return;
        }

        if (!res.ok || !out.signature) {
          flow.endFlow();
          setWalletState({
            pendingPay: null,
            busy: false,
            error: out.error || "Couldn't send that payment. You weren't charged.",
          });
          return;
        }
        setWalletState({
          pendingPay: null,
          busy: false,
          paid: { signature: out.signature, payload: pending?.payload || null },
        });
      } catch {
        // The signed transaction is spent either way — it may or may
        // not have reached the network. Saying "you weren't charged"
        // here would be a guess, so this says what is actually known.
        flow.endFlow();
        setWalletState({
          pendingPay: null,
          busy: false,
          error: "Lost the connection while sending. Check your wallet before paying again.",
        });
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
