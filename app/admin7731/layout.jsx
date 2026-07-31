// Server component wrapper solely so this segment can carry its
// own noindex metadata (the page itself is a client component).
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "bannr",
};

export default function AdminLayout({ children }) {
  return children;
}
