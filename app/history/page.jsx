// MY BANNERS — every past generation, one-click re-run settings.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getHistory } from "@/lib/credits";

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  useEffect(() => setItems(getHistory()), []);

  return (
    <main className="wrap">
      <div className="page-head">
        <h1>My banners</h1>
        <p>Every run, saved. Re-run any brief with one click.</p>
      </div>

      {items.length === 0 ? (
        <div className="empty-canvas page-gap">
          <div>
            <div className="dims">NOTHING PRINTED YET</div>
            <div className="sub">Your first banner is three fields away.</div>
            <div className="empty-cta">
              <Link href="/create" className="btn primary small">Create a banner</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="history-grid">
          {items.map((it) => (
            <div className="history-card" key={it.id}>
              {it.thumb && <img src={it.thumb} alt={`${it.brief?.ticker} banner`} />}
              <div className="meta">
                <b>{it.brief?.ticker || it.brief?.name}</b>
                <span>
                  {it.templateName} · {it.variantCount} options ·{" "}
                  {new Date(it.ts).toLocaleDateString()}
                </span>
                <Link href={`/create?style=${it.templateId}`} className="btn small">
                  Re-run style
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
