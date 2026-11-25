/** Re-mounts on every navigation, so each page enters with the short animation in globals.css (.page-enter). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
