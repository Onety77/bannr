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

export function detectMobile() {
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

      // Wallets disagree about what they hand back:
      //   Phantom desktop        { signature: Uint8Array }
      //   Phantom in-app browser { signature: base58 STRING }
      //   Solflare               the bytes directly
      //
      // The mobile string case is the one that bit us: passing a
      // string to new Uint8Array() yields an EMPTY array, so we were
      // sending a zero-length signature, the server rejected it, and
      // the button silently reset — an endless connect loop with no
      // visible reason.
      const raw = res?.signature ?? res;
      let bytes;
      if (typeof raw === "string") {
        // decode throws on malformed input — swallow it here so the
        // specific "couldn't read that signature" message below wins
        // over the generic catch-all.
        try {
          const bs58 = (await import("bs58")).default;
          bytes = bs58.decode(raw);
        } catch { bytes = null; }
      } else if (raw instanceof Uint8Array) {
        bytes = raw;
      } else if (raw?.byteLength !== undefined || Array.isArray(raw)) {
        bytes = new Uint8Array(raw);
      }

      // Never send something the server is guaranteed to reject —
      // fail here, where we can say what went wrong.
      if (!bytes || bytes.length !== 64) {
        return { error: "That wallet returned a signature we couldn't read. Try Phantom or Solflare." };
      }

      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return { signature: btoa(binary) };
    } catch (e) {
      // A rejected request and a broken wallet are different things.
      const msg = String(e?.message || "");
      if (/reject|denied|cancel/i.test(msg)) return { error: "Signature request was rejected." };
      return { error: "Couldn't get a signature from your wallet. Please try again." };
    }
  }, []);

  // Send SOL to the treasury (buy credits). Uses @solana/web3.js
  // lazily so it never loads on pages that don't pay.
  //
  // `accountId` is stamped into the transaction as a memo. That is
  // what makes wallet linking unnecessary: the payment names the
  // account it belongs to, so any wallet can pay for any account and
  // nobody else can claim the transaction. It costs the payer nothing
  // — same single approval, one extra instruction inside it.
  const payTreasury = useCallback(async (sol, accountId) => {
    const p = provider();
    const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
    if (!p?.publicKey) return { error: "Connect a wallet first." };
    if (!treasury) return { error: "Treasury wallet not configured yet (demo mode)." };
    try {
      const { PublicKey, SystemProgram, Transaction, TransactionInstruction } =
        await import("@solana/web3.js");

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

      // SPL Memo. No accounts, no signers — just bytes on the
      // transaction that the server reads back off the chain to know
      // whose credits these are.
      if (accountId) {
        tx.add(
          new TransactionInstruction({
            keys: [],
            programId: new PublicKey(MEMO_PROGRAM_ID),
            // TextEncoder, not Buffer — this runs in the browser, and
            // Buffer is a Node global that is only there if something
            // else in the bundle happened to polyfill it.
            data: new TextEncoder().encode(String(accountId)),
          })
        );
      }
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

// SPL Memo v2 — the canonical memo program on mainnet.
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

export const short = (a) => (a ? a.slice(0, 4) + "…" + a.slice(-4) : "");
