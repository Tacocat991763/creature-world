import { useEffect, useRef, useState, useCallback } from 'react'

export interface CreatureState {
  id: string; name: string
  x: number; y: number
  orientation: number; energy: number
  vx: number; vy: number
}

export interface EntityState {
  id: string; type: string; name: string
  x: number; y: number; radius: number
  color: string; shape: string
  interactable: boolean
}

export interface EnvState {
  time_of_day: string; hour: number
  ambient_light: number; weather: string; day: number
}

export interface StimState {
  reward: number; distress: number; curiosity: number; attachment: number
  arousal: number; fatigue: number; threat: number; familiarity: number
}

export interface WorldStateMsg {
  type: 'world_state'
  sim_time: number; version: number
  drive: string
  narration: string
  thought: string
  speech: string | null
  creature: CreatureState
  entities: EntityState[]
  environment: EnvState
  stimulation: StimState
}

export interface LLMEvent {
  timestamp: number
  thought: string; speech: string
  action_interpretation: string; experience_interpretation: string
}

export function useWorldState(url: string) {
  const ws = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [worldState, setWorldState] = useState<WorldStateMsg | null>(null)
  const [events, setEvents] = useState<LLMEvent[]>([])
  const [rawEvents, setRawEvents] = useState<any[]>([])

  useEffect(() => {
    function connect() {
      const socket = new WebSocket(url)
      ws.current = socket

      socket.onopen = () => setConnected(true)
      socket.onclose = () => {
        setConnected(false)
        setTimeout(connect, 2000)
      }
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'world_state') {
            setWorldState(msg)
          } else if (msg.type === 'event') {
            const payload = msg.payload || {}
            if (payload.thought || payload.speech) {
              setEvents(prev => [{
                timestamp: Date.now(),
                thought: payload.thought || '',
                speech: payload.speech || '',
                action_interpretation: payload.action_interpretation || '',
                experience_interpretation: payload.experience_interpretation || '',
              }, ...prev].slice(0, 30))
            }
            setRawEvents(prev => [msg, ...prev].slice(0, 100))
          }
        } catch {}
      }
    }
    connect()
    return () => ws.current?.close()
  }, [url])

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg))
    }
  }, [])

  return { connected, worldState, events, rawEvents, send }
}
