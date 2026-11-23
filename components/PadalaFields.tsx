'use client';
import { useState } from 'react';
import type { Rates } from '@/lib/padala';

const peso = (c: number) => 'PHP ' + (c / 100).toLocaleString('en-PH', { minimumFractionDigits: 2 });

/** Weight and declared value inputs with the fee worked out as you type (the server recomputes it). */
export function PadalaFields({ rates, weight = '', value = '' }: { rates: Rates; weight?: string; value?: string }) {
  const [w, setW] = useState(weight);
  const [v, setV] = useState(value);
  const kg = Math.ceil(Number(w) || 0);
  const declared = Math.round((Number(v) || 0) * 100);
  const valuation = Math.round((declared * rates.valuationPct) / 100);
  const fee = kg > 0 ? rates.base + rates.perKg * kg + valuation : 0;
  return (
    <>
      <div className="row2">
        <label className="field">Weight (kg)<input name="weight_kg" type="number" step="0.1" min="0.1" max={rates.maxKg} required value={w} onChange={(e) => setW(e.target.value)} /></label>
        <label className="field">Declared value (PHP)<input name="declared_value" type="number" step="1" min="0" max="100000" required value={v} onChange={(e) => setV(e.target.value)} /></label>
      </div>
      <dl className="fee">
        <dt>Base</dt><dd>{peso(rates.base)}</dd>
        <dt>{kg || 0} kg × {peso(rates.perKg)}</dt><dd>{peso(rates.perKg * kg)}</dd>
        <dt>Valuation ({rates.valuationPct}% of declared value)</dt><dd>{peso(valuation)}</dd>
        <dt className="fee-total">You pay</dt><dd className="fee-total" aria-live="polite">{peso(fee)}</dd>
      </dl>
    </>
  );
}
