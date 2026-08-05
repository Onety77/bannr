// ============================================================
// THE FRONT DOOR — paste a contract address, get a banner.
//
// This replaces a button, and that is the point. "Create your banner"
// asks someone to go somewhere and start work; an input asks them to
// paste one thing they already have in their clipboard. The second is
// a far smaller request, and it is the same request.
//
// It does NOT do the lookup itself. It hands the address to /create,
// which already knows how to import one — same code path whether you
// arrived from here, typed it there, or picked it from your recents.
// One implementation, three doors.
//
// Pasting submits immediately. There is no other reason to put a
// contract address in this box, so asking for a second tap to confirm
// an unambiguous intent is friction with nothing on the other side.
// ============================================================
"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
// Checked here only to catch an obvious mistype before a page
// transition — the server validates properly, and a wrong-but-
// plausible address fails there with a better message than we could
// give.
import { LOOKS_LIKE_CA } from "@/lib/ca";

export default function HeroStart() {
  const router = useRouter();
  const [ca, setCa] = useState("");
  const [err, setErr] = useState(false);
  const [going, setGoing] = useState(false);

  function go(value) {
    const addr = String(value ?? ca).trim();
    if (!addr) return;
    if (!LOOKS_LIKE_CA.test(addr)) { setErr(true); return; }
    setErr(false);
    setGoing(true);
    router.push(`/create?ca=${encodeURIComponent(addr)}`);
  }

  return (
    <div className="hstart reveal d2">
      <form
        className={`hstart-field${err ? " bad" : ""}`}
        onSubmit={(e) => { e.preventDefault(); go(); }}
      >
        <input
          value={ca}
          onChange={(e) => { setCa(e.target.value); setErr(false); }}
          onPaste={(e) => {
            const text = (e.clipboardData?.getData("text") || "").trim();
            if (!text) return;
            e.preventDefault();
            setCa(text);
            go(text);
          }}
          placeholder="Paste your contract address"
          aria-label="Contract address"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          enterKeyHint="go"
        />
        <button type="submit" aria-label="Start" disabled={going}>
          {going ? <span className="spinner" /> : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10h11M11 5.5 15.5 10 11 14.5" />
            </svg>
          )}
        </button>
      </form>

      {/* The escape hatch stays a LINK, never a second button. A button
          beside the input competes with it, and the whole reason this
          exists is that there should be one obvious move. Projects that
          have not launched still need it. */}
      <p className="hstart-alt">
        {err
          ? <span className="hstart-err">That doesn&apos;t look like a contract address.</span>
          : <>Not launched yet? <Link href="/create">Start from scratch</Link> · <Link href="/credits">See pricing</Link></>}
      </p>
    </div>
  );
}
