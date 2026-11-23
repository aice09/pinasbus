import { clock } from '@/lib/catalog';
import { stopTime, type TripRow } from '@/lib/trips';

/** Planned road itinerary: stops with times, then the expressways, highways and ferries in between. */
export function Itinerary({ trip }: { trip: Pick<TripRow, 'stops' | 'itinerary' | 'departs_at' | 'mode'> }) {
  return (
    <div className="itin">
      <ol className="stops">
        {trip.stops.map((s, i) => (
          <li key={i}>
            <strong>{s.name}</strong>
            <span className="note">{[s.boarding && 'pick-up', s.alighting && 'drop-off'].filter(Boolean).join(' and ')}{stopTime(trip, i) ? `, ${clock(stopTime(trip, i))}` : ''}</span>
          </li>
        ))}
      </ol>
      {trip.itinerary.length > 0 && (
        <ul className="legs" aria-label="Roads and crossings">
          {trip.itinerary.map((l, i) => (
            <li key={i} className={`leg-${l.type}`}>
              <span className="leg-type">{l.type === 'expressway' ? 'Expressway' : l.type === 'ferry' ? 'Ferry' : l.type === 'highway' ? 'Highway' : 'City roads'}</span>
              <strong>{l.name}</strong><span className="note">{l.from} to {l.to}{l.toll ? ', tolled' : ''}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="note">This is the planned route. Live tracking shows the road actually taken once the trip starts.</p>
    </div>
  );
}
