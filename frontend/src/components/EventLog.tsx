import type { LLMEvent } from '../hooks/useWorldState'

export function EventLog({ events }: { events: LLMEvent[] }) {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 320 }}>
      <h3 style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                   color: '#9ca3af', marginBottom: 2 }}>Creature Thoughts</h3>
      {events.length === 0 && (
        <p style={{ color: '#4b5563', fontSize: 12 }}>Waiting for first interpretation…</p>
      )}
      {events.map((ev, i) => (
        <div key={i} style={{
          background: '#111827', borderRadius: 6, padding: '8px 10px',
          borderLeft: '2px solid #7c3aed',
        }}>
          {ev.thought && (
            <p style={{ color: '#c4b5fd', fontSize: 12, fontStyle: 'italic', marginBottom: 4 }}>
              💭 {ev.thought}
            </p>
          )}
          {ev.speech && (
            <p style={{ color: '#fde68a', fontSize: 12, marginBottom: 4 }}>
              💬 &ldquo;{ev.speech}&rdquo;
            </p>
          )}
          {ev.experience_interpretation && (
            <p style={{ color: '#6b7280', fontSize: 11 }}>
              {ev.experience_interpretation}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
