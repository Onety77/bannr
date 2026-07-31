// ============================================================
// useAuth — the whole sign-in flow behind one hook, so the nav and
// the create page can never disagree about who is signed in.
//
// The flow is three steps and the user sees one popup:
//   connect  → wallet exposes its address
//   nonce    → server issues a one-time challenge + the exact text
//   sign     → wallet signs; server verifies and sets the cookie
//
// The message text always comes FROM the server. If the client
// composed its own, the two could drift by a character and every
// signature would fail verification with nothing to show why.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { fetchMe, setUser, getCachedUser, signOut as clearSession } from "@/lib/credits";

export function useAuth() {
  const wallet = useWallet();
  const [user, setLocalUser] = useState(getCachedUser());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // One listener keeps every mounted consumer in step, so a balance
  // change after a generation updates the nav without prop-drilling.
  useEffect(() => {
    const sync = () => setLocalUser(getCachedUser());
    window.addEventListener("bannr:credits", sync);
    fetchMe().then(() => {
      sync();
      setLoading(false);
    });
    return () => window.removeEventListener("bannr:credits", sync);
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const conn = await wallet.connect();
      if (conn.error) { setError(conn.error); return null; }

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: conn.address }),
      });
      const challenge = await nonceRes.json();
      if (!nonceRes.ok) { setError(challenge.error || "Could not start sign-in."); return null; }

      const signed = await wallet.signMessage(challenge.message);
      if (signed.error) { setError(signed.error); return null; }

      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: conn.address,
          nonce: challenge.nonce,
          signature: signed.signature,
        }),
      });
      const out = await verifyRes.json();
      if (!verifyRes.ok || !out.ok) { setError(out.error || "Sign-in failed."); return null; }

      setUser(out.user);
      return out.user;
    } catch {
      setError("Something went wrong signing in. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [wallet]);

  const signOut = useCallback(async () => {
    // Order matters: clear our session first. Disconnecting the wallet
    // doesn't end it — the session is ours, not the wallet's.
    await clearSession();
    await wallet.disconnect();
  }, [wallet]);

  // Re-read the authoritative balance. Used after any outcome the
  // client can't infer — a dropped connection mid-generation, say,
  // where we genuinely don't know whether the server charged.
  const refresh = useCallback(async () => {
    await fetchMe();
    setLocalUser(getCachedUser());
  }, []);

  return {
    user,
    loading,
    busy,
    error,
    walletAvailable: wallet.available,
    // True only on a phone with no injected provider — i.e. someone in
    // Safari/Chrome rather than inside a wallet's own browser. The
    // fix is a handoff, not a connect attempt.
    needsHandoff: wallet.mobile && !wallet.available,
    signIn,
    signOut,
    refresh,
    clearError: () => setError(null),
  };
}
