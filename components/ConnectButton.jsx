// ============================================================
// CONNECT BUTTON — one component for the three genuinely different
// situations a visitor can be in, so the nav and the create page
// can never disagree about what to offer.
//
//   1. injected provider present   → sign in normally
//   2. phone, no provider          → hand off to the wallet's browser
//   3. desktop, no provider        → they need to install one
//
// Case 2 is the one that matters: a phone browser can't see a wallet
// app at all, so "Connect" would fail and "Get a wallet" insults
// someone who already has Phantom on their home screen. The deeplink
// reopens this exact page inside Phantom's in-app browser, where a
// provider IS injected and the normal flow just works.
// ============================================================
"use client";
import { phantomBrowseUrl, solflareBrowseUrl } from "@/lib/wallet";

export default function ConnectButton({ auth, size = "small", label = "Connect wallet", block = false }) {
  const cls = `btn ${size} primary${block ? " block" : ""}`;

  if (auth.needsHandoff) {
    return (
      <a className={cls} href={phantomBrowseUrl()}>
        Open in Phantom
      </a>
    );
  }

  if (!auth.walletAvailable) {
    return (
      <a className={cls} href="https://phantom.app/download" target="_blank" rel="noopener noreferrer">
        Get a wallet
      </a>
    );
  }

  return (
    <button className={cls} disabled={auth.busy} onClick={auth.signIn}>
      {auth.busy ? <span className="spinner" /> : label}
    </button>
  );
}

// The explanatory line under the button. Separate because the nav has
// no room for it and the create page very much wants it.
export function ConnectNote({ auth }) {
  if (auth.needsHandoff) {
    return (
      <p className="hint signin-note">
        Phone browsers can&apos;t talk to wallet apps directly, so this opens bannr
        inside Phantom — everything works normally from there.{" "}
        <a href={solflareBrowseUrl()} className="link-quiet">Use Solflare instead</a>
      </p>
    );
  }
  if (!auth.walletAvailable) {
    return (
      <p className="hint signin-note">
        You&apos;ll need a Solana wallet. Phantom takes about a minute to set up.
      </p>
    );
  }
  return (
    <p className="hint signin-note">
      One signature, no transaction, nothing spent. New wallets get free credits to start.
    </p>
  );
}
