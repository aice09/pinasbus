'use client';
import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'model'; text: string };
const START: Msg = { role: 'model', text: 'Hi! I can find trips and fares, check a ticket, or tell you where your bus is. Try “Cubao to Naga tomorrow night”.' };

/** Renders [label](/path) links and line breaks; everything else is plain text (no HTML from the model). */
function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  text.split('\n').forEach((line, li) => {
    if (li) out.push(<br key={`b${li}`} />);
    let rest = line.replace(/\*\*/g, '').replace(/^\s*[*-]\s+/, '• '), k = 0;
    for (const m of [...line.replace(/\*\*/g, '').matchAll(/\[([^\]]+)\]\((\/[^)\s]*)\)/g)]) {
      const [all, label, href] = m;
      const i = rest.indexOf(all);
      out.push(rest.slice(0, i));
      out.push(<a key={`${li}-${k++}`} href={href}>{label}</a>);
      rest = rest.slice(i + all.length);
    }
    out.push(rest);
  });
  return <>{out}</>;
}

/** Floating travel assistant (Gemini, answering from live PINASBUS data). */
export function Assistant() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([START]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(next); setText(''); setBusy(true);
    const r = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next.slice(1) }) })
      .then((x) => x.json()).catch(() => ({ error: 'No connection.' }));
    setMsgs([...next, { role: 'model', text: r.reply ?? r.error ?? 'Something went wrong.' }]);
    setBusy(false);
  }

  return (
    <div className="ai">
      {open && (
        <section className="ai-panel" role="dialog" aria-label="PINASBUS assistant">
          <header><strong>PINASBUS assistant</strong><span className="note">AI, answers from live schedules</span><button type="button" className="linkbtn" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button></header>
          <div className="ai-msgs" aria-live="polite">
            {msgs.map((m, i) => <p key={i} className={'ai-msg ' + m.role}><Rich text={m.text} /></p>)}
            {busy && <p className="ai-msg model note">Checking schedules…</p>}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="ai-form">
            <label className="sr-only" htmlFor="ai-q">Your question</label>
            <input id="ai-q" value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder="Ask about trips, fares, tickets…" autoComplete="off" />
            <button className="btn small" type="submit" disabled={busy || !text.trim()}>Send</button>
          </form>
          <p className="ai-foot">AI can make mistakes; the trip and ticket pages are authoritative.</p>
        </section>
      )}
      <button type="button" className="ai-fab" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 4h16v11H8l-4 4Z" fill="currentColor" /></svg>
        <span>{open ? 'Close' : 'Ask PINASBUS'}</span>
      </button>
    </div>
  );
}
