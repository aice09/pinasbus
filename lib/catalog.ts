// Shared money and Manila-time helpers.

export const peso = (centavos: number) =>
  'PHP ' + (centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Today's date in Manila as YYYY-MM-DD, and minutes since midnight. */
export function manilaNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const BOOKING_WINDOW_DAYS = 60;

export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Online sales close 60 minutes before the bus leaves the passenger's boarding stop. */
export function bookable(boardsAt: Date | null, now = new Date()) {
  return !!boardsAt && boardsAt.getTime() - 60 * 60_000 > now.getTime() && boardsAt.getTime() - now.getTime() < (BOOKING_WINDOW_DAYS + 1) * 86400_000;
}

export const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const clock = (d: Date | null) =>
  d ? d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : 'time not published';

export const longDay = (date: string) =>
  new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const hasCR = (amenities: string[]) => amenities.includes('Restroom / CR');
