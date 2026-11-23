/**
 * Shows an email address without Cloudflare's "email obfuscation" rewriting it: Cloudflare swaps addresses it finds
 * in HTML for a script-decoded link, which breaks React hydration and our CSP. Splitting the text at "@" avoids the match.
 */
export function Email({ value }: { value: string }) {
  const at = value.lastIndexOf('@');
  if (at < 0) return <>{value}</>;
  return <span className="email">{value.slice(0, at)}<span>@</span>{value.slice(at + 1)}</span>;
}
