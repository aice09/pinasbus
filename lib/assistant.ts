// PINASBUS travel assistant on Gemini (key shared with AKADEMIA, Secret bikolbus-ai). It answers from live data via
// function calls only; it never sees other people's bookings beyond what a ticket reference already reveals.
import { byRef } from './bookings.ts';
import { clock, isDate, longDay, manilaNow, peso } from './catalog.ts';
import { q } from './db.ts';
import { liveSnapshot, routeGeometry, simulate } from './tracking.ts';
import { legOf, network, segmentFare, stopTime, takenOn, tripById, tripsOn } from './trips.ts';
import { PASSENGER_KINDS } from './layouts.ts';

const API = 'https://generativelanguage.googleapis.com/v1beta';
export const assistantEnabled = () => Boolean(process.env.GEMINI_API_KEY);

type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } };
type Content = { role: 'user' | 'model'; parts: Part[] };

const TOOLS = [{
  functionDeclarations: [
    { name: 'list_destinations', description: 'Places a passenger can travel to, optionally only those reachable from a given boarding point.', parameters: { type: 'OBJECT', properties: { from: { type: 'STRING', description: 'Boarding point name, e.g. "EDSA Cubao"' } } } },
    { name: 'search_trips', description: 'Bus departures on a date between two places, with company, time, class, fare and seats left.', parameters: { type: 'OBJECT', properties: { from: { type: 'STRING' }, to: { type: 'STRING' }, date: { type: 'STRING', description: 'YYYY-MM-DD in Manila time; default today' } }, required: ['to'] } },
    { name: 'booking_status', description: 'Status, seats and route of a ticket by its reference (PB… or BB…).', parameters: { type: 'OBJECT', properties: { ref: { type: 'STRING' } }, required: ['ref'] } },
    { name: 'where_is_my_bus', description: 'Current position summary, speed and arrival estimate for the bus of a ticket reference.', parameters: { type: 'OBJECT', properties: { ref: { type: 'STRING' } }, required: ['ref'] } },
  ],
}];

/** Best single match for a place name (exact, then partial). */
const near = (names: string[], want?: string) => {
  if (!want) return undefined;
  const w = want.toLowerCase().trim();
  return names.find((n) => n.toLowerCase() === w) ?? names.find((n) => n.toLowerCase().includes(w)) ?? names.find((n) => w.includes(n.toLowerCase()));
};

async function run(name: string, args: Record<string, unknown>) {
  const pairs = await network();
  const froms = Object.keys(pairs), tos = [...new Set(Object.values(pairs).flat())];
  if (name === 'list_destinations') {
    const f = near(froms, String(args.from ?? ''));
    return f ? { from: f, destinations: pairs[f] } : { boardingPoints: froms, destinations: tos };
  }
  if (name === 'search_trips') {
    // A place name like "Cubao" can mean several terminals (EDSA Cubao, Partas Cubao, Victory Liner Cubao): search them all.
    const all = (names: string[], want: string) => { const w = want.toLowerCase().trim(); return w ? names.filter((n) => n.toLowerCase().includes(w) || w.includes(n.toLowerCase())) : []; };
    const fs = all(froms, String(args.from ?? '')), ts = all(tos, String(args.to ?? ''));
    if (!ts.length) return { error: `No route goes to "${args.to}". Known destinations: ${tos.join(', ')}` };
    const date = isDate(args.date) && args.date >= manilaNow().date ? args.date : manilaNow().date;
    const legs = (await tripsOn(date)).flatMap((x) => {
      if (x.status !== 'scheduled') return [];
      for (const f of fs.length ? fs : [undefined]) for (const t of ts) { const leg = legOf(x, f, t); if (leg) return [{ x, leg }]; }
      return [];
    }).slice(0, 40);
    const taken = await takenOn(legs.map((y) => y.x.id));
    return {
      date: longDay(date), from: fs.length ? fs : 'any', to: ts,
      trips: legs.slice(0, 10).map(({ x, leg }) => ({
        company: x.org_name, boards: `${x.stops[leg.i].name} ${clock(stopTime(x, leg.i) ?? new Date(x.departs_at))}`, getsOff: x.stops[leg.j].name, class: x.class_name,
        fare: peso(segmentFare(x, leg.i, leg.j)), indicative: x.sources.some((s) => !s.verified), walkUp: x.category_rules?.bookable === false,
        seatsLeft: x.seats.filter((s) => PASSENGER_KINDS.includes(s.kind)).length - (taken.get(x.id) ?? 0),
        link: `/trips/${x.id}?from=${encodeURIComponent(x.stops[leg.i].name)}&to=${encodeURIComponent(x.stops[leg.j].name)}`,
      })),
      more: Math.max(0, legs.length - 10),
    };
  }
  const ref = String(args.ref ?? '').toUpperCase().replace(/\s/g, '');
  if (!/^(PB|BB)[A-Z2-9]{10}$/.test(ref)) return { error: 'That is not a ticket reference (12 characters starting with PB).' };
  const b = await byRef(ref);
  if (!b) return { error: 'No ticket with that reference.' };
  if (name === 'booking_status') return { ref, status: b.status, route: `${b.pickup} to ${b.dropoff}`, date: longDay(b.travel_date), seats: b.seats, total: peso(b.total_centavos), link: `/booking/${ref}` };
  const t = b.trip_uuid ? await tripById(b.trip_uuid) : null;
  if (!t) return { error: 'That ticket has no trip to track.' };
  const [r] = await q<{ id: string }>('select route_id id from schedules where id = $1', [t.schedule_id]);
  const g = await routeGeometry(r.id, t.stops);
  const s = (await liveSnapshot(t.id, g, t)) ?? (g ? simulate(t, g) : null);
  return s ? { simulated: s.simulated, status: s.status, speedKph: s.speedKph, remainingKm: s.remainingKm, eta: s.eta ? clock(new Date(s.eta)) : null, nextStop: s.nextStop, map: `/track/${t.id}` } : { error: 'No map data for this route.' };
}

const SYSTEM = () => `You are the PINASBUS travel assistant on a Philippine multi-company bus booking site. Today is ${longDay(manilaNow().date)} (Manila).
Reply in the language the user writes (English, Filipino or Taglish), briefly and warmly.
Rules:
- Use the tools for any route, schedule, fare, seat, ticket or bus-location question. Never guess or invent times, fares, companies or routes.
- When a tool marks a trip "indicative", say its time and fare are demonstration values, not the company's published ones. When "simulated", say the bus position is simulated.
- Give links exactly as the tools return them, as Markdown links, e.g. [Choose seats](/trips/...).
- Policies you may explain: seats are held 15 minutes while paying; online fee is 5.2% + ₱16 per seat; senior citizen, PWD and student discounts need the ID type and last 4 characters and the ID at boarding; blue ♿, amber SC and purple P seats are for eligible passengers until the company's release time; baggage allowance is set per company (often 20 kg per seat) and bags can be registered on the ticket page; Padala packages are sent from /padala; city buses (EDSA Carousel) are walk-up, pay on board.
- The bus companies are listed from public data for a demonstration and are not affiliated with PINASBUS; say so if asked about partnerships.
- You cannot book, pay, cancel or refund; point to the right page or to /contact.`;

/** One assistant turn with up to 4 tool rounds. `history` alternates user/model text. */
export async function ask(history: { role: 'user' | 'model'; text: string }[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  // Same model as AKADEMIA first; stable fallbacks when it is overloaded (503) or rate-limited (429).
  const models = [...new Set([process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite'])];
  const contents: Content[] = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  for (let round = 0; round < 5; round++) {
    const payload = JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM() }] }, contents, tools: TOOLS, generationConfig: { temperature: 0.3, maxOutputTokens: 900 } });
    let res: Response | null = null, body: { candidates?: { content?: { parts?: Part[] } }[]; error?: { message?: string } } = {};
    for (const [n, model] of models.flatMap((m) => [m, m]).entries()) {
      try {
        res = await fetch(`${API}/models/${model}:generateContent`, { method: 'POST', signal: AbortSignal.timeout(15_000), headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: payload });
        body = await res.json().catch(() => ({}));
      } catch { res = null; body = { error: { message: `${model} timed out` } }; continue; } // overloaded models sometimes hang: try the next
      if (res.ok || ![404, 429, 500, 503].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 600 * (n % 2 + 1)));
    }
    if (!res?.ok) throw new Error(`Gemini ${res?.status}: ${JSON.stringify(body.error?.message ?? body).slice(0, 200)}`);
    const parts: Part[] = body.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return parts.map((p) => p.text ?? '').join('').trim() || 'Sorry, I could not answer that. Try asking differently.';
    contents.push({ role: 'model', parts });
    const responses: Part[] = [];
    for (const c of calls) {
      let out: unknown;
      try { out = await run(c.functionCall!.name, c.functionCall!.args ?? {}); } catch (e) { out = { error: (e as Error).message.slice(0, 200) }; }
      responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: out } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return 'That took too many steps. Please ask a narrower question.';
}
