// Real clickable social buttons — URLs live in lib/site.js.
// Icons are inline SVG (stroke = currentColor) — no emoji.
import { SOCIALS } from "@/lib/site";

const ICONS = {
  x: (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M12.6 1h2.2L9.9 6.6 15.7 15h-4.5l-3.5-4.7L3.6 15H1.4l5.2-6L1 1h4.6l3.2 4.3L12.6 1zm-.8 12.7h1.2L4.9 2.2H3.6l8.2 11.5z" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M14.9 1.6 1.6 6.9c-.9.4-.9 1 0 1.3l3.3 1 1.3 4c.2.5.7.6 1.1.3l1.9-1.6 3.4 2.5c.5.3 1 .1 1.1-.5l2.3-11.2c.2-.8-.4-1.4-1.1-1.1zM5.6 8.9l7.1-4.4c.3-.2.5.1.3.3L7.2 10l-.3 2.5-1.3-3.6z" />
    </svg>
  ),
  community: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="2.3" />
      <circle cx="11" cy="6.5" r="1.8" />
      <path d="M1.5 13.5c0-2.2 1.8-4 4-4s4 1.8 4 4M10.5 11c1.9 0 3.5 1.2 4 2.5" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M1.5 14.5h13M2.5 11l3.2-3.8 2.6 2.2 4.9-6" />
      <path d="M13.5 6.5v-3h-3" />
    </svg>
  ),
};

export default function Socials({ compact = false }) {
  return (
    <div className={`socials ${compact ? "compact" : ""}`}>
      {SOCIALS.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="social-btn"
          aria-label={s.label}
        >
          {ICONS[s.id] || ICONS.chart}
          {!compact && <span>{s.label}</span>}
        </a>
      ))}
    </div>
  );
}
