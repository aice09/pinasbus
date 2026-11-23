'use client';
export const PrintButton = ({ label = 'Print' }: { label?: string }) => <button className="btn" type="button" onClick={() => window.print()}>{label}</button>;
