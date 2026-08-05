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
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet, detectMobile } from "@/lib/wallet";
import { fetchMe, setUser, getCachedUser, signOut as clearSession } from "@/lib/credits";

// A popup cannot work on a phone. Firebase opens its handler in a new
// tab, the tab has no opener to hand the credential back to, and it
// sits there blank while the original page still thinks you are signed
// out. That is not a bug to work around — REDIRECT is simply the
// correct flow on mobile, and it is what every app does: the whole
// page goes to Google and comes back signed in.
//
// The intent is parked in sessionStorage across the navigation, so on
// return we know whether we were signing in or linking, and so the
// firebase/auth bundle is only loaded when there is actually a result
// waiting.
const REDIRECT_INTENT = "bannr:google-redirect";

async function loadFirebaseAuth() {
  const [{ getFirebase }, mod] = await Promise.all([
    import("@/lib/firebaseClient"),
    import("firebase/auth"),
  ]);
  return { app: getFirebase(), ...mod };
}

export function useAuth() {
  const wallet = useWallet();
  const [user, setLocalUser] = useState(getCachedUser());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Set when a deeplink round trip finished successfully. The page
  // that started it was unloaded two navigations ago, so there is no
  // promise left to resolve — a flag is the only way to tell the UI
  // that the thing it asked for actually happened.
  const [linked, setLinked] = useState(null);
  // A challenge fetched and waiting for the tap that carries it to
  // the wallet. Declared here, above the effect that sets it and the
  // callback that reads it — const does not hoist, and reading it
  // before this line throws at render.
  const [pendingSign, setPendingSign] = useState(null);

  // One listener keeps every mounted consumer in step, so a balance
  // change after a generation updates the nav without prop-drilling.
  useEffect(() => {
    const sync = () => setLocalUser(getCachedUser());
    window.addEventListener("bannr:credits", sync);
    (async () => {
      // Must finish BEFORE fetchMe, since it is what sets the cookie
      // that fetchMe then reads. No-op unless we started a redirect.
      await completeGoogleRedirect();
      await fetchMe();
      sync();
      setLoading(false);
    })();
    return () => window.removeEventListener("bannr:credits", sync);
  }, []);

  // Pick up a sign-in that finished on Google's side and sent the
  // browser back here.
  async function completeGoogleRedirect() {
    let intent = null;
    try { intent = sessionStorage.getItem(REDIRECT_INTENT); } catch {}
    if (!intent) return;
    try { sessionStorage.removeItem(REDIRECT_INTENT); } catch {}

    try {
      const { app, getAuth, getRedirectResult } = await loadFirebaseAuth();
      if (!app) return;
      const cred = await getRedirectResult(getAuth(app));
      // Null means the user backed out, or the page was reloaded after
      // we already consumed it. Neither is an error worth showing.
      if (!cred?.user) return;

      const idToken = await cred.user.getIdToken();
      const linking = intent === "link";
      const res = await fetch(linking ? "/api/auth/identities" : "/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linking ? { type: "google", idToken } : { idToken }),
      });
      const out = await res.json();
      if (!res.ok) { setError(out.error || "Sign-in failed."); return; }
      setUser(out.user);
    } catch {
      setError("Something went wrong signing in. Please try again.");
    }
  }

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
      const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = authMod;
      const app = getFirebase();
      if (!app) { setError("Sign-in is not configured yet."); return null; }

      // Force the account chooser every time. Firebase keeps its own
      // session independently of our cookie, so without this, signing
      // out and clicking Sign in again silently drops you straight
      // back into the same account — which reads as sign-out being
      // broken, and is worse on a shared computer.
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      if (detectMobile()) {
        try { sessionStorage.setItem(REDIRECT_INTENT, "signin"); } catch {}
        await signInWithRedirect(getAuth(app), provider);
        return null; // the page navigates away; we resume on return
      }

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
      const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } = authMod;
      const app = getFirebase();
      if (!app) { setError("Sign-in is not configured yet."); return false; }

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      if (detectMobile()) {
        try { sessionStorage.setItem(REDIRECT_INTENT, "link"); } catch {}
        await signInWithRedirect(getAuth(app), provider);
        return false; // resumes in completeGoogleRedirect
      }

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
      if (conn.error) { setError(conn.error); return { ok: false, error: conn.error }; }

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: conn.address }),
      });
      const challenge = await nonceRes.json();
      if (!nonceRes.ok) {
        const why = challenge.error || "Could not start.";
        setError(why);
        return { ok: false, error: why };
      }

      const signed = await wallet.signMessage(challenge.message);
      if (signed.error) { setError(signed.error); return { ok: false, error: signed.error }; }

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
      if (!res.ok) {
        const why = out.error || "Couldn't link that wallet.";
        setError(why);
        // Returned as well as stored. A caller that awaits this and then
        // reads auth.error gets the PREVIOUS render's value, which is how
        // the link page ended up showing a generic message for every
        // failure including ones we had written good copy for.
        return { ok: false, error: why };
      }
      setUser(out.user);
      // `merged` is how many credits came across from an account that
      // was nothing but this wallet — see claimWalletIdentity.
      return { ok: true, merged: out.merged || 0 };
    } catch {
      const why = "Couldn't link that wallet. Please try again.";
      setError(why);
      return { ok: false, error: why };
    } finally { setBusy(false); }
  }, [wallet]);

  // ---------- the deeplink path ----------
  // For a phone browser with no injected provider. Instead of sending
  // someone into a wallet's own browser and reuniting two sessions by
  // hand, the wallet APP is asked directly and hands the answer back
  // on a redirect. See lib/deeplink.js.
  //
  // ══ EVERY NAVIGATION HERE MUST HAPPEN INSIDE THE TAP ══
  //
  // A universal link only reaches the app when iOS considers the
  // navigation USER-INITIATED. Await anything first — a dynamic
  // import, a fetch — and the gesture has expired by the time
  // location.href is set, so Safari treats it as an ordinary
  // navigation and LOADS phantom.app as a web page. It redirects to
  // the download screen, and the user is told to install an app they
  // already have.
  //
  // That is exactly what the first version of this did, and it is why
  // the modules are preloaded below and why the second hop is a
  // button rather than something that fires on load. Nothing between
  // the tap and the navigation may be asynchronous. Ever.
  const dl = useRef(null);

  useEffect(() => {
    // Preloaded the moment we know this device needs it, so the tap
    // itself has nothing to wait for. Not on every device: this pulls
    // in tweetnacl, and a desktop with an extension never uses it.
    if (!wallet.mobile || wallet.available) return;
    let live = true;
    Promise.all([import("@/lib/deeplink"), import("@/lib/walletFlow")])
      .then(([d, f]) => { if (live) dl.current = { DeepLink: d.default, flow: f }; })
      .catch(() => {});
    return () => { live = false; };
  }, [wallet.mobile, wallet.available]);

  // SYNCHRONOUS. Not async, and nothing inside it is awaited.
  const startWalletDeeplink = useCallback((intent, provider = "phantom") => {
    const mods = dl.current;
    if (!mods) { setError("Still loading — try that again in a second."); return false; }
    setError(null);
    try {
      mods.flow.beginFlow(intent, provider);
      // Always the connect hop, even with a session already saved.
      // Skipping to signMessage would need a nonce first, and fetching
      // one is the await that breaks the gesture. Connect is pure
      // crypto and navigates immediately.
      mods.DeepLink.connect(provider);
      setBusy(true);
      return true;
    } catch (e) {
      setError(e?.message || "Couldn't open your wallet app.");
      return false;
    }
  }, []);

  // The second hop, also a tap. Once the wallet has told us the
  // address, the challenge is fetched on page load and parked; this
  // then navigates with nothing in between.
  const continueWalletDeeplink = useCallback(() => {
    const mods = dl.current;
    const p = pendingSign;
    if (!mods || !p) return false;
    try {
      setBusy(true);
      mods.DeepLink.signMessage(p.provider, p.message, "wallet");
      return true;
    } catch (e) {
      setError(e?.message || "Couldn't open your wallet app.");
      setBusy(false);
      return false;
    }
  }, [pendingSign]);

  // Resume. Runs on EVERY page load, because the wallet redirects back
  // to whichever page started the flow — but it costs nothing when
  // there is no marker in the URL: the check is one URLSearchParams
  // read, and lib/deeplink.js (with tweetnacl inside it) is not even
  // imported until there is something to do.
  useEffect(() => {
    let live = true;
    (async () => {
      const { default: DeepLink } = await import("@/lib/deeplink").catch(() => ({}));
      if (!DeepLink?.isRedirect || !DeepLink.isRedirect()) return;

      const flow = await import("@/lib/walletFlow");
      const result = DeepLink.handleRedirect();
      if (!result || !live) return;

      const pending = flow.readFlow();

      if (result.type === "error") {
        flow.endFlow();
        setPendingSign(null);
        setBusy(false);
        // A rejection in the wallet app is a decision, not a fault.
        setError(/reject|declin|cancel/i.test(result.message) ? null : result.message);
        return;
      }

      // Hop one came back with an address. Fetch the challenge now —
      // this is a page load, so there is no gesture to spend — and
      // park it. The navigation to sign it has to come from a TAP, so
      // it waits for one rather than firing here.
      if (result.type === "connect") {
        if (!pending) return; // a stray redirect, not something we asked for
        try {
          const challenge = await flow.fetchChallenge(result.publicKey);
          if (!live) return;
          setPendingSign({
            provider: result.provider,
            address: result.publicKey,
            message: challenge.message,
          });
          setBusy(false);
        } catch (e) {
          flow.endFlow();
          if (live) { setBusy(false); setError(e?.message || "Couldn't start signing."); }
        }
        return;
      }

      // Hop two: the signature. This is the only thing the server
      // will accept as proof the address is theirs.
      if (result.type === "message") {
        if (!pending?.nonce || !pending?.address) { flow.endFlow(); return; }
        setBusy(true);
        setPendingSign(null);
        try {
          const out = await flow.submitSignature({
            intent: pending.intent,
            address: pending.address,
            nonce: pending.nonce,
            signature: result.signature,
          });
          flow.endFlow();
          if (!live) return;
          setUser(out.user);
          setLocalUser(out.user);
          setLinked({ intent: pending.intent, merged: out.merged || 0 });
        } catch (e) {
          flow.endFlow();
          if (live) setError(e?.message || "That didn't work. Please try again.");
        } finally {
          if (live) setBusy(false);
        }
      }
    })();
    return () => { live = false; };
  }, []);

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
    // A phone browser with no injected provider — Safari or Chrome
    // rather than inside a wallet's own browser. Once meant "offer a
    // handoff into Phantom's browser"; now it means "use deeplinks",
    // which is the same situation answered properly.
    needsDeeplink: wallet.mobile && !wallet.available,
    startWalletDeeplink,
    // Set between the two hops: the wallet has named an address and a
    // challenge is waiting. Whichever page is showing must offer a
    // button, because the navigation has to come from a tap.
    pendingSign,
    continueWalletDeeplink,
    cancelWalletDeeplink: () => { setPendingSign(null); setBusy(false); },
    // The outcome of a deeplink round trip, or null. Read once and
    // cleared — it survived two page loads to get here.
    linked,
    clearLinked: () => setLinked(null),
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
