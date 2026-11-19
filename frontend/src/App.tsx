import { useState, useCallback, useEffect } from 'react'
import { useWorldState } from './hooks/useWorldState'
import { WorldCanvas } from './components/WorldCanvas'
import { StimulationPanel } from './components/StimulationPanel'
import { EventLog } from './components/EventLog'
import { DebugDashboard } from './components/DebugDashboard'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

const EMPTY_STIM = {
  reward: 0, distress: 0, curiosity: 0, attachment: 0,
  arousal: 0, fatigue: 0, threat: 0, familiarity: 0,
}

type PlaceMode = 'none' | 'flower' | 'rock' | 'food' | 'person'

export default function App() {
  const { connected, worldState, events, send } = useWorldState(WS_URL)
  const [placeMode, setPlaceMode] = useState<PlaceMode>('none')
  const [tab, setTab] = useState<'stim' | 'events' | 'debug'>('stim')
  const [llmEnabled, setLlmEnabled] = useState<boolean | null>(null)
  const [llmToggling, setLlmToggling] = useState(false)

  // Fetch initial LLM status once connected
  useEffect(() => {
    if (!connected) return
    fetch('/api/llm/status')
      .then(r => r.json())
      .then(d => setLlmEnabled(d.enabled))
      .catch(() => setLlmEnabled(false))
  }, [connected])

  const toggleLlm = useCallback(async () => {
    setLlmToggling(true)
    try {
      const r = await fetch('/api/llm/toggle', { method: 'POST' })
      const d = await r.json()
      setLlmEnabled(d.enabled)
    } finally {
      setLlmToggling(false)
    }
  }, [])

  const handlePlace = useCallback((wx: number, wy: number) => {
    if (placeMode === 'none') return
    send({ action: 'place_object', obj_type: placeMode, name: placeMode, x: wx, y: wy, radius: 1.0 })
    setPlaceMode('none')
  }, [placeMode, send])

  const stim = worldState?.stimulation ?? EMPTY_STIM

  const env = worldState?.environment

  return (
    <div style={{
      display: 'flex', height: '100vh', width: '100vw', background: '#0d1117',
      color: '#e6edf3', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Sidebar left */}
      <div style={{
        width: 260, flexShrink: 0, background: '#0f0f13', borderRight: '1px solid #1e1e2a',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Name + status */}
        <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #1e1e2a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%',
                          background: connected ? '#22c55e' : '#6b7280',
                          boxShadow: connected ? '0 0 6px #22c55e' : 'none' }} />
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>
              {worldState?.creature.name ?? 'Luma'}
            </span>
            {env && (
              <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>
                day {env.day} · {env.time_of_day}
              </span>
            )}
          </div>
        </div>

        {/* Current thought — always visible */}
        <div style={{
          padding: '14px 16px 10px', borderBottom: '1px solid #1e1e2a',
          minHeight: 90,
        }}>
          <div style={{ fontSize: 10, color: '#4b4b6a', textTransform: 'uppercase',
                        letterSpacing: '0.08em', marginBottom: 8 }}>right now</div>
          {/* Narration (what Luma is doing) */}
          <div style={{ fontSize: 11, color: '#8888aa', marginBottom: 10 }}>
            {worldState?.narration ?? '—'}
          </div>
          {/* Thought bubble */}
          <div style={{
            background: '#1a1a26', borderRadius: 10, padding: '10px 12px',
            fontSize: 13, color: '#c8c8e8', fontStyle: 'italic', lineHeight: 1.5,
            minHeight: 40, position: 'relative',
          }}>
            {worldState?.speech
              ? <><span style={{ color: '#a78bfa', fontStyle: 'normal', fontWeight: 600 }}>✦ </span>"{worldState.speech}"</>
              : (worldState?.thought ?? '...')}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e1e2a' }}>
          {(['stim', 'events', 'debug'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px 0', border: 'none', background: 'none',
              color: tab === t ? '#a78bfa' : '#4b4b6a', fontSize: 11,
              borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent',
              cursor: 'pointer', textTransform: 'capitalize',
            }}>{t}</button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'stim' && <StimulationPanel stim={stim as any} />}
          {tab === 'events' && <EventLog events={events} />}
          {tab === 'debug' && <DebugDashboard state={worldState} />}
        </div>
      </div>

      {/* Main canvas area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #21262d',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Place:</span>
          {(['none', 'flower', 'rock', 'food', 'person'] as PlaceMode[]).map(m => (
            <button key={m} onClick={() => setPlaceMode(m)} style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11,
              background: placeMode === m ? '#7c3aed' : '#21262d',
              color: placeMode === m ? '#fff' : '#9ca3af',
              cursor: 'pointer',
            }}>{m === 'none' ? '✕ cancel' : m}</button>
          ))}
          {placeMode !== 'none' && (
            <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 8 }}>
              Click on the world to place a {placeMode}
            </span>
          )}

          {/* LLM toggle — right-aligned */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>AI narration</span>
            <button
              onClick={toggleLlm}
              disabled={llmToggling || llmEnabled === null}
              title={llmEnabled ? 'Disable AI narration / planning' : 'Enable AI narration / planning (requires OpenAI key)'}
              style={{
                width: 42, height: 22, borderRadius: 11, border: 'none',
                background: llmEnabled ? '#7c3aed' : '#374151',
                position: 'relative', cursor: llmEnabled === null ? 'default' : 'pointer',
                transition: 'background 0.2s', flexShrink: 0,
                opacity: llmToggling ? 0.5 : 1,
              }}
            >
              <span style={{
                display: 'block', width: 16, height: 16, borderRadius: '50%',
                background: '#fff',
                position: 'absolute', top: 3,
                left: llmEnabled ? 23 : 3,
                transition: 'left 0.2s',
              }} />
            </button>
            {llmEnabled === false && (
              <span style={{ fontSize: 10, color: '#6b7280' }}>off</span>
            )}
            {llmEnabled === true && (
              <span style={{ fontSize: 10, color: '#a78bfa' }}>on</span>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <WorldCanvas state={worldState} onPlace={handlePlace} />

          {/* Emotion bars — pinos.world style, top of canvas */}
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 10, alignItems: 'center',
            background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)',
            borderRadius: 24, padding: '7px 18px',
            pointerEvents: 'none',
          }}>
            {[
              { key: 'curiosity',   label: 'Curiosity',   color: '#60a5fa' },
              { key: 'attachment',  label: 'Warmth',      color: '#f59e0b' },
              { key: 'reward',      label: 'Joy',         color: '#4ade80' },
              { key: 'distress',    label: 'Distress',    color: '#f87171' },
              { key: 'fatigue',     label: 'Fatigue',     color: '#94a3b8' },
            ].map(ch => {
              const v = (stim as any)[ch.key] ?? 0
              return (
                <div key={ch.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    width: 60, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3,
                  }}>
                    <div style={{
                      width: `${Math.round(v * 100)}%`, height: '100%',
                      background: ch.color, borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }}>
                    {ch.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Narration strip — always visible, LLM speech if available else drive text */}
          <div style={{
            position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.42)', backdropFilter: 'blur(8px)',
            borderRadius: 20, padding: '8px 20px', maxWidth: 460,
            color: 'rgba(255,255,255,0.88)', fontSize: 13, textAlign: 'center',
            pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'opacity 0.4s ease',
            opacity: worldState ? 1 : 0,
          }}>
            {events[0]?.speech
              ? `"${events[0].speech}"`
              : (worldState?.narration ?? 'Luma exists')}
          </div>

          {/* Controls hint */}
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(4px)',
            borderRadius: 20, padding: '5px 14px',
            color: 'rgba(255,255,255,0.65)', fontSize: 11, letterSpacing: '0.03em',
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            drag to look &nbsp;·&nbsp; W / S move &nbsp;·&nbsp; A / D turn
          </div>
        </div>
      </div>
    </div>
  )
}
