// SIGN IN — one button, everywhere.
//
// It used to be Google-specific, with a wallet button beside it, a
// line under each, and a paragraph. The choice belongs in the dialog
// that opens, not spread across whatever page you happened to be on
// — which is also why signing in was only really possible from
// /create: the surface was too big to put anywhere else.
"use client";
import { openSignIn } from "@/lib/modals";

export default function ConnectButton({ auth, size = "small", label = "Sign in", block = false }) {
  return (
    <button
      className={`btn ${size} primary${block ? " block" : ""}`}
      disabled={auth?.busy}
      onClick={openSignIn}
    >
      {label}
    </button>
  );
}
