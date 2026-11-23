'use client';
import { startTransition, useActionState, useEffect, useRef } from 'react';

export type ActionResult = { error?: string; ok?: string } | undefined;
type Props = {
  action: (prev: ActionResult, data: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  submit: string;
  pending?: string;
  className?: string;
  quiet?: boolean;
  confirm?: string;
  reset?: boolean; // clear the fields after a successful save (add forms)
};

/** A form bound to a server action, with inline success/error messages. */
export function ActionForm({ action, children, submit, pending = 'Saving…', className = 'stack', quiet, confirm, reset }: Props) {
  const [state, run, busy] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && reset) ref.current?.reset(); }, [state, reset]);
  return (
    // Submitting by hand (not <form action>) so React doesn't clear the fields when the server returns an error.
    <form ref={ref} className={className} onSubmit={(e) => {
      e.preventDefault();
      if (confirm && !window.confirm(confirm)) return;
      const data = new FormData(e.currentTarget);
      startTransition(() => run(data));
    }}>
      {children}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.ok && <p className="ok" role="status">{state.ok}</p>}
      <div><button className={quiet ? 'btn quiet' : 'btn'} type="submit" disabled={busy}>{busy ? pending : submit}</button></div>
    </form>
  );
}
