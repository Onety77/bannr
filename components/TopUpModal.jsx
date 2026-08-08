// Signed in, nothing to spend, and they just pressed Generate.
//
// Two states, and which one shows is decided by the gate rather than
// by anything written here:
//
//   promo running  → hold the token, connect the wallet, free runs
//   promo over     → buy credits
//
// When the gate is switched off this becomes one button to the
// credits page, with nothing left over mentioning a token. That is
// the whole reason the copy reads the live config.
"use client";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import WalletContinue from "@/components/WalletContinue";
import { useAuth } from "@/lib/useAuth";
import { useToken } from "@/lib/useToken";
import { offerLine } from "@/lib/offer";
// The list price of the cheapest pack, so the button carries a number.
// lib/packs.js is client-safe by design — it holds dollars and no rate.
import { PACKS } from "@/lib/packs";
import { closeModal } from "@/lib/modals";

export default function TopUpModal() {
  const auth = useAuth();
  const router = useRouter();
  const token = useToken();
  const offer = offerLine(token);
  // Falls back rather than reading "$undefined" for the moment before
  // /api/token answers.
  const sym = token?.symbol ? `$${token.symbol}` : "$BANNR";

  if (auth.pendingSign) {
    return (
      <Modal title="Almost there" onClose={closeModal}>
        <WalletContinue auth={auth} />
      </Modal>
    );
  }

  const hasWallet = Boolean(auth.user?.wallets?.length) || auth.walletAvailable;

  function connect() {
    if (auth.needsDeeplink) { auth.startWalletDeeplink("link"); return; }
    auth.linkWallet();
  }

  const toCredits = () => { closeModal(); router.push("/credits"); };

  return (
    // ══ THE ENTIRE CONVERSION FUNNEL IS THIS ONE SCREEN ══
    //
    // Somebody made a banner, liked it, asked for another, and this is
    // what they get. Three things were wrong with it.
    //
    // "Connect your wallet" was the PRIMARY button. Connecting gives
    // you nothing unless you already hold the token — so the loudest
    // action on the screen did nothing at all for the people most
    // likely to be looking at it, and for everyone else it is a trip
    // to a DEX and back. The person wants a banner now.
    //
    // "Buy credits" carried no number. An unpriced button asks you to
    // navigate to find out what you are agreeing to, and the honest
    // answer is small enough to say out loud.
    //
    // And nothing said the free run comes back. That is true, it costs
    // a sale nobody was going to make today, and it is the difference
    // between a wall and a wait.
    <Modal title="Out of runs" onClose={closeModal}>
      <p className="modal-lead">Your free run is back tomorrow.</p>

      <div className="signin-opts">
        <button className="btn primary block" onClick={toCredits}>
          Buy credits — from ${PACKS[0].usd}
        </button>

        {/* The holder route, quieter and second, because it is the
            slower one. Absent entirely before the tiers are armed —
            offerLine returns null then, and a button pointing at an
            offer that does not exist yet is a dead end. */}
        {offer && (
          hasWallet ? (
            // A wallet is already linked. Connecting it again does
            // nothing, so this goes where the ladder actually is.
            <button className="btn block" onClick={toCredits}>
              Hold {sym} instead
            </button>
          ) : (
            <button className="btn block" disabled={auth.busy} onClick={connect}>
              {auth.busy ? <span className="spinner" /> : `Hold ${sym} instead`}
            </button>
          )
        )}
      </div>

      {offer && <p className="modal-foot">{offer}</p>}
      {auth.error && <p className="modal-err">{auth.error}</p>}
    </Modal>
  );
}
