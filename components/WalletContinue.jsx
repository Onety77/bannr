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
      {/* "Step 2 of 2" rather than a fresh-looking request. The line
          before the first tap promised two; this is the one that
          keeps the promise, and a count is what turns "it's asking
          again?" into "this is the last one". */}
      <span className="wcont-lead">
        <b className="wcont-step">Step 2 of 2</b>
        Connected <span className="mono">{short(p.address)}</span>
      </span>
      {/* SIGN, because that is the word Phantom puts on its own
          screen. Calling it "approve" here and reading "Sign Message"
          there makes it look like a different, unannounced request.

          AND NO REASSURANCE. This used to add "it costs nothing and
          moves nothing", which was true and was a mistake: nobody
          arrives at a signature worrying about the cost, so raising
          it is what starts them wondering whether they should be. A
          line that answers a question nobody asked teaches them to
          ask it. */}
      <p className="hint">Sign to prove this wallet is yours.</p>
      <div className="wcont-row">
        <button
          className="btn small primary"
          disabled={auth.busy}
          onClick={auth.continueWalletDeeplink}
        >
          {auth.busy ? <span className="spinner" /> : "Sign the message"}
        </button>
        <button className="btn small" onClick={auth.cancelWalletDeeplink}>
          Cancel
        </button>
      </div>
    </div>
  );
}
