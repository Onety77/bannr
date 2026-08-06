// Mounted once in the root layout, so any page, tab or nav can open
// one with a function call and none of them own the markup.
//
// Also reopens itself when a wallet flow comes back mid-way: iOS
// lands the redirect on a FRESH page load in a new tab, where no
// modal is open and the signature waiting to be sent would otherwise
// have nowhere to be shown.
"use client";
import { useEffect, useState } from "react";
import { getModal, subscribeModal, openSignIn } from "@/lib/modals";
import { useAuth } from "@/lib/useAuth";
import SignInModal from "@/components/SignInModal";
import TopUpModal from "@/components/TopUpModal";

export default function Modals() {
  const [which, setWhich] = useState(getModal);
  const auth = useAuth();

  useEffect(() => subscribeModal(setWhich), []);

  useEffect(() => {
    if (auth.pendingSign && !getModal()) openSignIn();
  }, [auth.pendingSign]);

  if (which === "signin") return <SignInModal />;
  if (which === "topup") return <TopUpModal />;
  return null;
}
