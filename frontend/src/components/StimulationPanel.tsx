import type { StimState } from '../hooks/useWorldState'

const CHANNELS = [
  { key: 'reward',      label: 'Reward',      color: '#22c55e' },
  { key: 'distress',    label: 'Distress',    color: '#ef4444' },
  { key: 'curiosity',   label: 'Curiosity',   color: '#3b82f6' },
  { key: 'attachment',  label: 'Attachment',  color: '#f59e0b' },
  { key: 'arousal',     label: 'Arousal',     color: '#a855f7' },
  { key: 'fatigue',     label: 'Fatigue',     color: '#6b7280' },
  { key: 'threat',      label: 'Threat',      color: '#dc2626' },
  { key: 'familiarity', label: 'Familiarity', color: '#14b8a6' },
]

export function StimulationPanel({ stim }: { stim: StimState }) {
  return (
    <div style={{ padding: '12px 16px' }}>
      <h3 style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
                   color: '#9ca3af', marginBottom: 10 }}>Neural Stimulation</h3>
      {CHANNELS.map(ch => {
        const v = (stim as any)[ch.key] ?? 0
        const pct = ((v + 1) / 2) * 100   // [-1,1] → [0%,100%]
        return (
          <div key={ch.key} style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span style={{ color: '#d1d5db' }}>{ch.label}</span>
              <span style={{ color: ch.color, fontFamily: 'monospace' }}>{v.toFixed(3)}</span>
            </div>
            <div style={{ background: '#1f2937', borderRadius: 3, height: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: ch.color, borderRadius: 3,
                transition: 'width 0.15s ease',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
