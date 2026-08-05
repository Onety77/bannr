// ============================================================
// SIGN IN — every way into an account in one component, so the nav
// and the create page can never disagree about what is on offer.
//
// TWO DOORS INTO THE SAME ROOM. A wallet and a Google account are
// equal here: either one opens an account, either one can be added to
// the other afterwards. A wallet briefly could not create an account
// at all, which made the button beside it a door that opened onto an
// error telling you to go and use the other one.
//
// WHAT MADE THIS CONFUSING WAS NEVER THE CHOICE — it was that
// nothing said where either one led.
//
//   Two verbs. "Sign in to generate" beside "Continue with a wallet"
//   reads as two different systems rather than two ways into one.
//   One verb now.
//
//   No stated outcome. The only difference anyone cares about is
//   whether the free generations start now or after another step,
//   and that was invisible at the exact moment of choosing. One line
//   under each, naming that and nothing else.
//
//   No way back. A fork with no stated exit reads as a commitment,
//   so people stall on it. One line says you can add the other
//   later, which is true and which is what removes the stakes.
//
// THE ORDER FOLLOWS WHAT IS TRUE, not a preference: when the gate is
// live the wallet is listed first, because it is the one that pays
// off immediately. With no gate a wallet buys you nothing yet, so
// Google leads. One rule, and it is explainable to anyone who asks
// why their screen differs from a friend's.
//
// The wallet has three cases:
//   1. injected provider present   → sign normally
//   2. phone, no provider          → deeplink to the wallet APP
//   3. desktop, no provider        → don't offer it at all
// ============================================================
"use client";
import { useEffect } from "react";
import WalletContinue from "@/components/WalletContinue";
import { useToken } from "@/lib/useToken";
import { offerLine } from "@/lib/offer";

export default function ConnectButton({ auth, size = "small", label = "Sign in", block = false }) {
  const cls = `btn ${size} primary${block ? " block" : ""}`;

  return (
    <button className={cls} disabled={auth.busy} onClick={auth.signInWithGoogle}>
      {auth.busy ? <span className="spinner" /> : <><GoogleMark />{label}</>}
    </button>
  );
}

// Just the wallet button. Returns null where a wallet cannot be
// reached at all — a desktop with no extension — because offering a
// door that leads nowhere is worse than offering one door.
export function WalletSignIn({ auth, block = true }) {
  const cls = `btn small${block ? " block" : ""}`;

  // Arm the one-tap path. A wallet connected on an earlier visit
  // still has a session, so only the signature is missing — and the
  // challenge for it is fetched now, before the tap, because fetching
  // it during the tap would spend the gesture the universal link
  // needs. Costs nothing when there is no session to arm.
  useEffect(() => {
    if (auth.needsDeeplink) auth.armWalletDeeplink?.();
  }, [auth.needsDeeplink]);

  // NOT an async handler. The navigation has to happen inside this
  // tap or iOS opens phantom.app in the browser instead of the app.
  if (auth.needsDeeplink) {
    return (
      <button className={cls} disabled={auth.busy} onClick={() => auth.startWalletDeeplink("signin")}>
        {auth.busy ? <span className="spinner" /> : "Continue with a wallet"}
      </button>
    );
  }
  if (!auth.walletAvailable) return null;

  return (
    <button className={cls} disabled={auth.busy} onClick={auth.signIn}>
      Continue with a wallet
    </button>
  );
}

// ============================================================
// THE CHOICE. Both doors, each saying where it leads, in the order
// that is true today. Used wherever someone signed out is asked to
// sign in — which is two places, and they must not drift apart.
// ============================================================
export function SignInChoice({ auth }) {
  const offer = offerLine(useToken());

  // Midway through a wallet flow: the address is known and a
  // signature is waiting. That replaces the whole choice — they have
  // already chosen.
  if (auth.pendingSign) return <WalletContinue auth={auth} />;

  // Whether a wallet is reachable on this device at all. Mirrors
  // WalletSignIn's own conditions, because the reversibility line
  // below must not claim there is another door when there is not.
  const walletPossible = auth.needsDeeplink || auth.walletAvailable;

  const google = (
    <div className="door" key="google">
      <ConnectButton auth={auth} size="" block label="Continue with Google" />
      <em>{offer ? "Add a wallet later for free generations" : "Works on any device"}</em>
    </div>
  );

  const wallet = walletPossible ? (
    <div className="door" key="wallet">
      <WalletSignIn auth={auth} />
      {/* The outcome, and only the outcome. This briefly carried "·
          two taps" as well, which stopped being true the moment
          returning visitors started getting one — the session
          survives, so only the signature is missing. A count that is
          wrong half the time is worse than no count, and the "Step 2
          of 2" on the screen that follows already stops the second
          prompt arriving as a surprise. */}
      <em>{offer ? "Free generations start right away" : "Sign in with the wallet you pay from"}</em>
    </div>
  ) : null;

  // Wallet first only when it actually pays off sooner.
  const order = offer && wallet ? [wallet, google] : [google, wallet];

  return (
    <div className="doors">
      {order}
      {/* The line that takes the stakes out of the fork. Only when
          there really are two, or it is a promise about a door this
          device cannot open. */}
      {wallet && <p className="doors-note">You can add the other later.</p>}
    </div>
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
