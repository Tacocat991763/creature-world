import { useState, useEffect, useRef, useCallback } from 'react'

interface Message {
  id: string
  role: 'visitor' | 'luma'
  content: string
  created_at: number
}

interface Visitor {
  id: string
  display_name: string | null
  message_count: number
}

function getOrCreateVisitorId(): string {
  try {
    const stored = localStorage.getItem('luma_visitor_id')
    if (stored) return stored
    const id = `v_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
    localStorage.setItem('luma_visitor_id', id)
    return id
  } catch {
    return `v_${Math.random().toString(36).slice(2, 26)}`
  }
}

export function ConversationPanel() {
  const [visitorId] = useState(getOrCreateVisitorId)
  const [displayName, setDisplayName] = useState<string>(() => {
    try { return localStorage.getItem('luma_display_name') ?? '' } catch { return '' }
  })
  const [nameInput, setNameInput] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [visitor, setVisitor] = useState<Visitor | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Load history on mount
  useEffect(() => {
    fetch(`/api/chat/history?visitor_id=${visitorId}&limit=40`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setMessages(d.messages ?? [])
          setVisitor(d.visitor)
        }
      })
      .catch(() => {})

    fetch('/api/status')
      .then(r => r.json())
      .then(d => setAvailable(d.conversation_available))
      .catch(() => setAvailable(false))
  }, [visitorId])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const optimistic: Message = {
      id: `opt_${Date.now()}`,
      role: 'visitor',
      content: text,
      created_at: Date.now() / 1000,
    }
    setMessages(prev => [...prev, optimistic])

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, message: text, display_name: displayName || undefined }),
      })
      const d = await r.json()
      if (d.ok) {
        const reply: Message = {
          id: `r_${Date.now()}`,
          role: 'luma',
          content: d.reply,
          created_at: Date.now() / 1000,
        }
        setMessages(prev => [...prev.filter(m => m.id !== optimistic.id), optimistic, reply])
        if (d.visitor) setVisitor(d.visitor)
      }
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
    } finally {
      setSending(false)
    }
  }, [input, sending, visitorId, displayName])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }, [send])

  const saveName = () => {
    const name = nameInput.trim()
    if (name) {
      setDisplayName(name)
      try { localStorage.setItem('luma_display_name', name) } catch {}
      fetch('/api/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor_id: visitorId, display_name: name }),
      }).catch(() => {})
    }
    setShowNamePrompt(false)
  }

  return (
    <div style={{
      width: 300, flexShrink: 0, background: '#0d0d12', borderLeft: '1px solid #1e1e2a',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px 10px', borderBottom: '1px solid #1e1e2a',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#c8c8e8' }}>Talk to Luma</span>
        {available === false && (
          <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>voice offline</span>
        )}
        {available === true && (
          <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 'auto' }}>●</span>
        )}
        <button
          onClick={() => { setShowNamePrompt(v => !v); setNameInput(displayName) }}
          title={displayName ? `You: ${displayName}` : "Set your name"}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: '#6b7280', padding: '2px 4px',
          }}
        >
          {displayName ? displayName : '+ name'}
        </button>
      </div>

      {/* Name prompt */}
      {showNamePrompt && (
        <div style={{ padding: '8px 16px', background: '#12121a', borderBottom: '1px solid #1e1e2a', display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveName()}
            placeholder="Your name (optional)"
            style={{
              flex: 1, background: '#1a1a26', border: '1px solid #2a2a3a', borderRadius: 6,
              color: '#c8c8e8', fontSize: 12, padding: '4px 8px', outline: 'none',
            }}
          />
          <button onClick={saveName} style={{
            background: '#7c3aed', border: 'none', borderRadius: 6,
            color: '#fff', fontSize: 12, padding: '4px 10px', cursor: 'pointer',
          }}>Save</button>
        </div>
      )}

      {/* Message list */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px' }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center', color: '#4b4b6a', fontSize: 12, marginTop: 40,
            lineHeight: 1.6,
          }}>
            Luma exists in her world right now.{'\n'}
            <br />Say something.
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} style={{
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: m.role === 'visitor' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '86%',
              background: m.role === 'visitor' ? '#2d1b69' : '#1a1a26',
              borderRadius: m.role === 'visitor' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              padding: '8px 12px',
              fontSize: 13,
              color: m.role === 'visitor' ? '#c4b5fd' : '#c8c8e8',
              lineHeight: 1.5,
            }}>
              {m.content}
            </div>
            {m.role === 'luma' && (
              <span style={{ fontSize: 9, color: '#4b4b6a', marginTop: 2, marginLeft: 4 }}>
                Luma
              </span>
            )}
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', gap: 4, padding: '6px 2px' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: '#4b4b6a',
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #1e1e2a' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={sending}
            placeholder={available === false ? "Luma's voice is resting..." : "Say something..."}
            rows={2}
            style={{
              flex: 1,
              background: '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 8,
              color: '#c8c8e8',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.4,
            }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{
              background: input.trim() && !sending ? '#7c3aed' : '#1a1a26',
              border: '1px solid #2a2a3a',
              borderRadius: 8,
              color: input.trim() && !sending ? '#fff' : '#4b4b6a',
              fontSize: 13,
              width: 40,
              cursor: input.trim() && !sending ? 'pointer' : 'default',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >→</button>
        </div>
        <div style={{ fontSize: 10, color: '#3b3b55', marginTop: 4 }}>
          Enter to send · Shift+Enter for newline
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
