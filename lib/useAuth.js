// ============================================================
// useAuth — every way into an account, behind one hook, so the nav
// and the create page can never disagree about who is signed in.
//
// GOOGLE is the front door. One tap, works in any browser, on any
// phone, and needs no extension — which matters because a wallet was
// never required to USE bannr, only to pay for it. Requiring one at
// the door turned away everyone who has not got one, including most
// of the marketing and design people who actually buy banners.
//
// WALLET sign-in stays, for people who prefer it and for the accounts
// that already exist. Three steps, one popup:
//   connect  → wallet exposes its address
//   nonce    → server issues a one-time challenge + the exact text
//   sign     → wallet signs; server verifies and sets the cookie
//
// The message text always comes FROM the server. If the client
// composed its own, the two could drift by a character and every
// signature would fail verification with nothing to show why.
//
// Both doors land on the same account record. Buying credits is a
// separate act that connects a wallet at that moment and never needs
// to remember it — see /api/pay/claim.
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

  // Google. The popup is Firebase's; we only forward the resulting ID
  // token, and the server verifies it rather than trusting a word of
  // what the browser says about who it is.
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const [{ getFirebase }, authMod] = await Promise.all([
        import("@/lib/firebaseClient"),
        import("firebase/auth"),
      ]);
      const { getAuth, GoogleAuthProvider, signInWithPopup } = authMod;
      const app = getFirebase();
      if (!app) { setError("Sign-in is not configured yet."); return null; }

      // Force the account chooser every time. Firebase keeps its own
      // session independently of our cookie, so without this, signing
      // out and clicking Sign in again silently drops you straight
      // back into the same account — which reads as sign-out being
      // broken, and is worse on a shared computer.
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const cred = await signInWithPopup(getAuth(app), provider);
      const idToken = await cred.user.getIdToken();

      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const out = await res.json();
      if (!res.ok || !out.ok) { setError(out.error || "Sign-in failed."); return null; }

      setUser(out.user);
      return out.user;
    } catch (e) {
      // Closing the popup is a decision, not a fault, so it says
      // nothing rather than showing an error nobody caused.
      const code = String(e?.code || "");
      if (/popup-closed|cancelled-popup|popup-blocked/.test(code)) {
        if (code.includes("blocked")) setError("Your browser blocked the sign-in window.");
        return null;
      }
      setError("Something went wrong signing in. Please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // ---------- adding a second way in ----------
  // Same proofs as signing in; the difference is only that the account
  // comes from the existing session rather than from the identity.

  const linkGoogle = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const [{ getFirebase }, authMod] = await Promise.all([
        import("@/lib/firebaseClient"),
        import("firebase/auth"),
      ]);
      const { getAuth, GoogleAuthProvider, signInWithPopup } = authMod;
      const app = getFirebase();
      if (!app) { setError("Sign-in is not configured yet."); return false; }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(getAuth(app), provider);

      const res = await fetch("/api/auth/identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "google", idToken: await cred.user.getIdToken() }),
      });
      const out = await res.json();
      if (!res.ok) { setError(out.error || "Couldn't link that account."); return false; }
      setUser(out.user);
      return true;
    } catch (e) {
      if (/popup-closed|cancelled-popup/.test(String(e?.code || ""))) return false;
      setError("Couldn't link that account. Please try again.");
      return false;
    } finally { setBusy(false); }
  }, []);

  const linkWallet = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const conn = await wallet.connect();
      if (conn.error) { setError(conn.error); return false; }

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: conn.address }),
      });
      const challenge = await nonceRes.json();
      if (!nonceRes.ok) { setError(challenge.error || "Could not start."); return false; }

      const signed = await wallet.signMessage(challenge.message);
      if (signed.error) { setError(signed.error); return false; }

      const res = await fetch("/api/auth/identities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "wallet",
          wallet: conn.address,
          nonce: challenge.nonce,
          signature: signed.signature,
        }),
      });
      const out = await res.json();
      if (!res.ok) { setError(out.error || "Couldn't link that wallet."); return false; }
      setUser(out.user);
      return true;
    } catch {
      setError("Couldn't link that wallet. Please try again.");
      return false;
    } finally { setBusy(false); }
  }, [wallet]);

  const unlinkIdentity = useCallback(async (type, id) => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/identities", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      const out = await res.json();
      if (!res.ok) { setError(out.error || "Couldn't remove that."); return false; }
      setUser(out.user);
      return true;
    } catch {
      setError("Couldn't remove that. Please try again.");
      return false;
    } finally { setBusy(false); }
  }, []);

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
    signInWithGoogle,
    linkGoogle,
    linkWallet,
    unlinkIdentity,
    signOut,
    refresh,
    clearError: () => setError(null),
  };
}
