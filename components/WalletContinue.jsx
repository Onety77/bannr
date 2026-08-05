// ============================================================
// THE SECOND HOP.
//
// Connecting and signing are two separate trips to the wallet app,
// and BOTH have to start from a tap. iOS only hands a universal link
// to the app when the navigation is user-initiated; fire it from an
// effect on page load and Safari opens phantom.app as a web page,
// which redirects to a screen telling you to install the app you are
// already holding.
//
// So this is not a progress indicator that happens to have a button.
// The button IS the mechanism. It renders wherever a flow is midway,
// which is why it is a component rather than markup on one page.
// ============================================================
"use client";
import { short } from "@/lib/wallet";

export default function WalletContinue({ auth }) {
  const p = auth.pendingSign;
  if (!p) return null;

  return (
    <div className="wcont">
      <span className="wcont-lead">
        Connected <b>{short(p.address)}</b>
      </span>
      <p className="hint">
        One more tap to prove it&apos;s yours. Nothing is sent, nothing is spent.
      </p>
      <div className="wcont-row">
        <button
          className="btn small primary"
          disabled={auth.busy}
          onClick={auth.continueWalletDeeplink}
        >
          {auth.busy ? <span className="spinner" /> : "Approve in your wallet"}
        </button>
        <button className="btn small" onClick={auth.cancelWalletDeeplink}>
          Cancel
        </button>
      </div>
    </div>
  );
}
