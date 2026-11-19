import type { WorldStateMsg } from '../hooks/useWorldState'

export function DebugDashboard({ state }: { state: WorldStateMsg | null }) {
  if (!state) return <div style={{ padding: 16, color: '#6b7280', fontSize: 12 }}>Connecting…</div>

  const c = state.creature
  const env = state.environment

  return (
    <div style={{ padding: '12px 16px', fontSize: 11, fontFamily: 'monospace', color: '#9ca3af' }}>
      <h3 style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                   color: '#9ca3af', marginBottom: 10 }}>Debug</h3>
      <Row label="Sim time" value={state.sim_time.toFixed(1) + 's'} />
      <Row label="Version" value={state.version} />
      <Row label="Day" value={`${env.day} ${env.time_of_day} (${env.hour.toFixed(1)}h)`} />
      <Row label="Light" value={(env.ambient_light * 100).toFixed(0) + '%'} />
      <Row label="Pos" value={`(${c.x.toFixed(1)}, ${c.y.toFixed(1)})`} />
      <Row label="Vel" value={`(${c.vx.toFixed(2)}, ${c.vy.toFixed(2)})`} />
      <Row label="Orientation" value={c.orientation.toFixed(1) + '°'} />
      <Row label="Energy" value={(c.energy * 100).toFixed(0) + '%'} />
      <Row label="Entities" value={state.entities.length} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ color: '#e5e7eb' }}>{value}</span>
    </div>
  )
}
