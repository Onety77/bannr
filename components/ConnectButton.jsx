// ============================================================
// SIGN IN — every way into an account in one component, so the nav
// and the create page can never disagree about what is on offer.
//
// GOOGLE LEADS. It works in any browser, on any phone, with no
// extension and no seed phrase. A wallet was never needed to USE
// bannr — only to pay for it — so putting one at the door turned away
// everyone who hasn't got one, which includes most of the marketing
// and design people who actually buy banners. It also removes the
// worst failure in the product: a phone browser cannot see a wallet
// app at all, so "Connect" simply hung there.
//
// WALLET is kept as the second option, because some of this audience
// genuinely prefers it and every existing account was made that way.
// Three cases:
//   1. injected provider present   → sign normally
//   2. phone, no provider          → deeplink to the wallet APP
//   3. desktop, no provider        → don't offer it at all
//
// Case 2 used to send people into Phantom's own browser and then
// reunite two sessions by hand. It is a plain button now: the wallet
// app opens, they approve, they come back here signed in.
// ============================================================
"use client";
import WalletContinue from "@/components/WalletContinue";

export default function ConnectButton({ auth, size = "small", label = "Sign in", block = false }) {
  const cls = `btn ${size} primary${block ? " block" : ""}`;

  return (
    <button className={cls} disabled={auth.busy} onClick={auth.signInWithGoogle}>
      {auth.busy ? <span className="spinner" /> : <><GoogleMark />{label}</>}
    </button>
  );
}

// The wallet route, offered underneath rather than beside it — the
// alternative now, not the default.
export function WalletSignIn({ auth, block = true }) {
  const cls = `btn small${block ? " block" : ""}`;

  // Midway through a deeplink flow: the wallet named an address and a
  // challenge is waiting for the tap that carries it back. That tap
  // is not optional — see components/WalletContinue.
  if (auth.pendingSign) return <WalletContinue auth={auth} />;

  // A phone browser. The wallet app is right there on the device even
  // though this browser cannot see it, so this is a button like any
  // other — it just happens to leave and come back.
  //
  // NOT an async handler. The navigation has to happen inside this
  // tap or iOS opens phantom.app in the browser instead of the app.
  if (auth.needsDeeplink) {
    return (
      <span className="wal-start">
        <button className={cls} disabled={auth.busy} onClick={() => auth.startWalletDeeplink("signin")}>
          {auth.busy ? <span className="spinner" /> : "Continue with a wallet"}
        </button>
        {/* Said BEFORE the first tap, which is the whole point. The
            second wallet prompt is unavoidable on a first connection
            — one asks for the address, one proves it is yours — and
            arriving unannounced it reads as being asked twice for the
            same thing, or worse, as something trying to take
            something. Announced, it reads as step two.

            Not a word about why two are needed. That is our problem. */}
        <em className="wal-note-2">Two steps, both in your wallet. Nothing is spent.</em>
      </span>
    );
  }
  // No wallet on this device: offering it would only lead to a dead
  // end, and Google is right there.
  if (!auth.walletAvailable) return null;

  return (
    <button className={cls} disabled={auth.busy} onClick={auth.signIn}>
      Continue with a wallet
    </button>
  );
}

// The explanatory line under the buttons. Separate because the nav has
// no room for it and the create page very much wants it.
export function ConnectNote({ auth }) {
  // The phone case no longer needs explaining. It used to describe a
  // detour through another browser, because the detour was strange
  // enough that people abandoned it without one. A button that opens
  // your wallet and comes back is just a button.
  return (
    <p className="hint signin-note">
      New accounts get 12 free credits. No wallet needed — you only connect one
      to buy credits, and any wallet works.
    </p>
  );
}

// Inline so it costs no network request and no icon dependency.
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
