// ============================================================
// SIGNED IN, WITH NOTHING TO SPEND.
//
// A state that did not exist until the token launched. Signing up
// used to hand out 12 credits, so everybody arrived able to make
// something; free generations come from HOLDING $BANNR now, and a new
// account starts at zero.
//
// Which means someone can sign in, fill in the whole brief, press
// Generate and only THEN be told they cannot. Finding that out after
// the work is the version of this that loses people — so it is said
// at the top, before anything is typed.
//
// TWO ROUTES, BOTH REAL. Hold the token for a daily allowance, or buy
// credits with SOL. Neither is presented as the lesser one, because
// which is better genuinely depends on whether someone wants one
// banner or wants to be around.
//
// Renders NOTHING when there is something to spend, and nothing while
// the balance is still loading — a "you have no credits" notice that
// flashes at somebody who has plenty is its own small betrayal.
// ============================================================
"use client";
import Link from "next/link";
import { useToken } from "@/lib/useToken";
import { offerLine } from "@/lib/offer";

export default function NothingToSpend({ auth, cost = 1 }) {
  const offer = offerLine(useToken());

  if (auth.loading || !auth.user) return null;
  const credits = auth.user.credits || 0;
  const free = auth.user.holderRunsLeft || 0;
  if (free > 0 || credits >= cost) return null;

  return (
    <div className="nts">
      <p className="nts-lead">You have no credits yet.</p>
      <div className="nts-routes">
        {offer && (
          <span className="nts-route">
            {offer}{" "}
            <Link href="/settings" className="link-quiet">Connect your wallet</Link>
          </span>
        )}
        <span className="nts-route">
          Or <Link href="/credits" className="link-quiet">buy credits</Link> with SOL.
        </span>
      </div>
    </div>
  );
}
