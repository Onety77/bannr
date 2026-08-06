// Which modal is open, as module state so anything can open one
// without prop-drilling a handler through the nav, four tabs and a
// page body. Same shape as lib/walletResume.
"use client";

let open = null; // null | "signin" | "topup"
const subs = new Set();

export function getModal() { return open; }
export function subscribeModal(fn) { subs.add(fn); return () => subs.delete(fn); }

function set(next) {
  if (open === next) return;
  open = next;
  for (const fn of subs) fn(open);
}

export const openSignIn = () => set("signin");
export const openTopUp = () => set("topup");
export const closeModal = () => set(null);
