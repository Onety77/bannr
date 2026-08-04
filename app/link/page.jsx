// ============================================================
// /link — where a wallet handoff lands.
//
// You tapped "Connect a wallet" in Safari while signed in with Google.
// Safari has no injected wallet, so the only way through is Phantom's
// own in-app browser — which is a SEPARATE browser with none of
// Safari's cookies. Arriving there signed out is what used to make a
// second account: the wallet had nothing to attach to, so it became an
// account of its own, with its own credits and its own history.
//
// So the deeplink carries a token. This page spends it for a real
// session — the SAME account — and only then links the wallet.
//
// Three steps, and it says which one it is on, because this runs
// inside a wallet app where nothing else on screen explains itself.
// ============================================================
"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

function LinkInner() {
  const params = useSearchParams();
  const auth = useAuth();
  // claiming | linking | done | already | error
  const [stage, setStage] = useState("claiming");
  const [msg, setMsg] = useState("");
  // Credits that came across from a wallet-only account we just merged.
  const [merged, setMerged] = useState(0);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const token = params.get("t");
      if (!token) { setStage("error"); setMsg("That link is missing its code."); return; }

      // 1. Become the account that started this.
      try {
        const r = await fetch("/api/auth/handoff/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const d = await r.json();
        if (!r.ok) { setStage("error"); setMsg(d.error || "That link has expired."); return; }
      } catch {
        setStage("error");
        setMsg("Couldn't reach the server. Try again.");
        return;
      }

      // Spent. Take it out of the URL so it does not sit in history or
      // get shared by accident along with a screenshot.
      try {
        window.history.replaceState({}, "", "/link");
      } catch {}

      await auth.refresh();

      // 2. Link the wallet this browser has.
      setStage("linking");
      try {
        // The reason comes back from the call. Reading auth.error right
        // after awaiting it reads the PREVIOUS render, which is why this
        // used to say "that wallet couldn't be linked" no matter what
        // actually went wrong — including the one case we had written
        // proper copy for.
        const res = await auth.linkWallet();
        if (res?.ok) { setMerged(res.merged || 0); setStage("done"); return; }
        setStage("error");
        setMsg(res?.error || "That wallet couldn't be linked.");
      } catch {
        setStage("error");
        setMsg("That wallet couldn't be linked.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="wrap linkp">
      <h1>
        {stage === "done" ? "Wallet linked" : stage === "error" ? "Couldn't link that" : "Linking your wallet"}
      </h1>

      {stage !== "done" && stage !== "error" && (
        <p className="linkp-step">
          <span className="spinner" />
          {stage === "claiming" ? "Signing you in…" : "Waiting for your wallet…"}
        </p>
      )}

      {stage === "done" && (
        <>
          <p className="linkp-note">
            It belongs to the same account you were already signed in to, so your
            credits and everything you have made are all in one place.
            {merged > 0 && (
              <>
                {" "}
                <b>
                  That wallet had its own account with {merged} credit
                  {merged === 1 ? "" : "s"} on it — those came across too.
                </b>
              </>
            )}
          </p>
          <div className="linkp-actions">
            <Link className="btn primary" href="/create">Make a banner</Link>
            <Link className="btn" href="/settings">Back to settings</Link>
          </div>
        </>
      )}

      {stage === "error" && (
        <>
          <p className="linkp-note">{msg}</p>
          <div className="linkp-actions">
            <Link className="btn primary" href="/settings">Try again</Link>
          </div>
        </>
      )}
    </main>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={<main className="wrap linkp"><h1>Linking your wallet</h1></main>}>
      <LinkInner />
    </Suspense>
  );
}
