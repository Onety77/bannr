// Counts the visit. Mounted once in the root layout so it catches
// every way in — the homepage, a shared /feed/{id} link, a profile,
// someone landing straight on /create from a tweet.
//
// Renders nothing, blocks nothing, and knows nothing about who you
// are. See lib/stats.js for the shape of what it feeds and lib/track.js
// for why it only fires once per tab.
"use client";
import { useEffect } from "react";
import { track } from "@/lib/track";

export default function Track() {
  useEffect(() => {
    track("landed");
  }, []);
  return null;
}
