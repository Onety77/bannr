// ============================================================
// STAGE AURA — what plays while a banner renders, and the surface
// it then resolves out of.
//
// Deliberately built from the same language as the landing hero:
// soft blurred colour fields in the brand palette, slow drift, no
// hard edges. The previous version was a drafting-table motif —
// graph paper, crop marks, a hunting reticle — which was literal
// about "designing" but read as CAD software next to the rest of
// this site. This is the same idea told the way bannr actually
// looks: colour gathering, settling, finding a composition.
//
// The orbs slowly converge toward the centre and drift apart again
// on three different cycles, so the loop never lands in the same
// place twice across a ~45s wait.
//
// Rendered with `done` over a finished banner it becomes the
// reveal: the aura dissolves as the art develops beneath it, so
// loading and arrival are one continuous surface rather than a
// swap. Purely decorative → aria-hidden, no pointer events.
// ============================================================
export default function StageAura({ done = false }) {
  return (
    <div className={`aura-stage ${done ? "done" : ""}`} aria-hidden="true">
      <span className="aura-orb o1" />
      <span className="aura-orb o2" />
      <span className="aura-orb o3" />
      <span className="aura-sheen" />
    </div>
  );
}
