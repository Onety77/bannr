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
import { closeModal } from "@/lib/modals";

export default function TopUpModal() {
  const auth = useAuth();
  const router = useRouter();
  const offer = offerLine(useToken());

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

  return (
    // "Get free generations" was the title, and it stopped being true
    // when everyone started getting one a day: the offer underneath is
    // now whatever holding ADDS, which is often the style picker and a
    // discount rather than more runs. A title promising free
    // generations above a line that offers something else reads as a
    // bait. This one states the situation and lets the offer speak.
    <Modal title={offer ? "Out of runs" : "You need credits"} onClose={closeModal}>
      {offer ? (
        <>
          <p className="modal-lead">{offer}</p>
          <div className="signin-opts">
            <button className="btn primary block" disabled={auth.busy} onClick={connect}>
              {auth.busy ? <span className="spinner" /> : "Connect your wallet"}
            </button>
            <button
              className="btn block"
              onClick={() => { closeModal(); router.push("/credits"); }}
            >
              Buy credits instead
            </button>
          </div>
        </>
      ) : (
        <div className="signin-opts">
          <button
            className="btn primary block"
            onClick={() => { closeModal(); router.push("/credits"); }}
          >
            Buy credits
          </button>
        </div>
      )}
      {auth.error && <p className="modal-err">{auth.error}</p>}
    </Modal>
  );
}
