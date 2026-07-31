// ============================================================
// WALLET — lightweight Phantom/Solflare connector via injected
// providers.
//
// MOBILE: a phone's normal browser has no injected provider —
// Safari and Chrome cannot see a wallet app. But a wallet's OWN
// in-app browser injects one, so everything in this file already
// works there, unchanged. That's the whole strategy: rather than
// build a second signing path, hand the user across to Phantom's
// browser and let the existing code run.
//
// Deliberately NOT Mobile Wallet Adapter. MWA works through Android
// intents and does nothing on iOS, so it would solve roughly half
// the problem for considerably more work. The handoff below covers
// both platforms.
// ============================================================
"use client";
import { useCallback, useEffect, useState } from "react";

function provider() {
  if (typeof window === "undefined") return null;
  if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
  if (window.solflare?.isSolflare) return window.solflare;
  if (window.solana) return window.solana;
  return null;
}

function detectMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Deeplink that reopens the current page inside a wallet's in-app
// browser. `ref` is what the wallet shows as the requesting site.
export function phantomBrowseUrl(url) {
  if (typeof window === "undefined") return "#";
  const target = url || window.location.href;
  return `https://phantom.app/ul/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(window.location.origin)}`;
}

export function solflareBrowseUrl(url) {
  if (typeof window === "undefined") return "#";
  const target = url || window.location.href;
  return `https://solflare.com/ul/v1/browse/${encodeURIComponent(target)}?ref=${encodeURIComponent(window.location.origin)}`;
}

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [available, setAvailable] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    // Read after mount, never during render: the server has no
    // navigator, so deciding this during render would mismatch on
    // hydration and flash the wrong button.
    setAvailable(Boolean(provider()));
    setMobile(detectMobile());
    const p = provider();
    if (p?.publicKey) setAddress(p.publicKey.toString());
  }, []);

  const connect = useCallback(async () => {
    const p = provider();
    if (!p) return { error: "No Solana wallet found. Install Phantom or Solflare." };
    try {
      const res = await p.connect();
      const addr = (res?.publicKey || p.publicKey).toString();
      setAddress(addr);
      return { address: addr };
    } catch {
      return { error: "Connection rejected." };
    }
  }, []);

  const disconnect = useCallback(async () => {
    try { await provider()?.disconnect(); } catch {}
    setAddress(null);
  }, []);

  // Sign a plain-text message to prove ownership. Not a transaction:
  // nothing is sent to the chain, nothing is spent, no gas. Wallets
  // show the text verbatim, which is why lib/auth.js composes it to
  // be readable and to state that it authorises nothing.
  const signMessage = useCallback(async (message) => {
    const p = provider();
    if (!p) return { error: "No Solana wallet found. Install Phantom or Solflare." };
    if (typeof p.signMessage !== "function") {
      return { error: "This wallet can't sign messages. Try Phantom or Solflare." };
    }
    try {
      const encoded = new TextEncoder().encode(message);
      const res = await p.signMessage(encoded, "utf8");
      // Phantom returns { signature }, Solflare returns the bytes
      // directly — normalise before base64-encoding for the server.
      const bytes = res?.signature ?? res;
      let binary = "";
      for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
      return { signature: btoa(binary) };
    } catch {
      return { error: "Signature request was rejected." };
    }
  }, []);

  // Send SOL to the treasury (buy credits). Uses @solana/web3.js
  // lazily so it never loads on pages that don't pay.
  const payTreasury = useCallback(async (sol) => {
    const p = provider();
    const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
    if (!p?.publicKey) return { error: "Connect a wallet first." };
    if (!treasury) return { error: "Treasury wallet not configured yet (demo mode)." };
    try {
      const { PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");

      // Blockhash comes from our own server, which holds the Helius
      // key. Reading process.env.HELIUS_RPC_URL here would always be
      // undefined — this file runs in the browser — and the silent
      // fallback was the rate-limited public RPC, on the money path.
      const bhRes = await fetch("/api/solana/blockhash", { cache: "no-store" });
      const bh = await bhRes.json();
      if (!bhRes.ok || !bh.blockhash) {
        return { error: bh.error || "Couldn't reach the network. Try again in a moment." };
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: p.publicKey,
          toPubkey: new PublicKey(treasury),
          lamports: Math.round(sol * 1e9),
        })
      );
      tx.feePayer = p.publicKey;
      tx.recentBlockhash = bh.blockhash;
      // The wallet broadcasts through its OWN RPC connection, so we
      // never need one client-side beyond the blockhash above.
      const { signature } = await p.signAndSendTransaction(tx);
      return { signature };
    } catch (e) {
      return { error: e.message || "Payment failed." };
    }
  }, []);

  return { address, available, mobile, connect, disconnect, signMessage, payTreasury };
}

export const short = (a) => (a ? a.slice(0, 4) + "…" + a.slice(-4) : "");
