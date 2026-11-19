import type { WorldStateMsg, EntityState, CreatureState } from '../hooks/useWorldState'

const WORLD_W = 100
const WORLD_H = 100

const ENTITY_COLORS: Record<string, string> = {
  tree: '#2d6a2d',
  bench: '#8B6914',
  flower: '#c850c0',
  rock: '#6b7280',
  stream: '#3b82f6',
  bridge: '#a16207',
  food: '#ef4444',
  person: '#f59e0b',
  custom: '#8b5cf6',
}

function worldToCanvas(wx: number, wy: number, cw: number, ch: number): [number, number] {
  return [(wx / WORLD_W) * cw, (wy / WORLD_H) * ch]
}

function radiusToCanvas(r: number, cw: number): number {
  return (r / WORLD_W) * cw
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  state: WorldStateMsg,
  hoveredId: string | null,
) {
  const { width: cw, height: ch } = ctx.canvas

  // Background — sky tint by time of day
  const light = state.environment.ambient_light
  const skyR = Math.round(13 + light * 30)
  const skyG = Math.round(17 + light * 60)
  const skyB = Math.round(23 + light * 80)
  ctx.fillStyle = `rgb(${skyR},${skyG},${skyB})`
  ctx.fillRect(0, 0, cw, ch)

  // Ground
  const groundG = Math.round(30 + light * 50)
  ctx.fillStyle = `rgb(20,${groundG},20)`
  ctx.fillRect(0, 0, cw, ch)

  // Grid (subtle)
  ctx.strokeStyle = `rgba(255,255,255,0.03)`
  ctx.lineWidth = 0.5
  for (let gx = 0; gx <= WORLD_W; gx += 10) {
    const [x] = worldToCanvas(gx, 0, cw, ch)
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke()
  }
  for (let gy = 0; gy <= WORLD_H; gy += 10) {
    const [, y] = worldToCanvas(0, gy, cw, ch)
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke()
  }

  // Entities
  for (const e of state.entities) {
    renderEntity(ctx, e, cw, ch, light, hoveredId === e.id)
  }

  // Creature
  renderCreature(ctx, state.creature, cw, ch, light)
}

function renderEntity(
  ctx: CanvasRenderingContext2D, e: EntityState,
  cw: number, ch: number, light: number, hovered: boolean,
) {
  const [ex, ey] = worldToCanvas(e.x, e.y, cw, ch)
  const er = radiusToCanvas(e.radius, cw)
  const col = e.color || ENTITY_COLORS[e.type] || '#666'

  ctx.save()
  if (hovered) {
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 12
  }
  ctx.globalAlpha = 0.5 + light * 0.5

  if (e.type === 'tree') {
    // Trunk
    ctx.fillStyle = '#5c3d1a'
    ctx.fillRect(ex - er * 0.2, ey, er * 0.4, er * 0.6)
    // Canopy
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, Math.PI * 2)
    ctx.fill()
  } else if (e.type === 'stream') {
    ctx.fillStyle = `rgba(59,130,246,0.6)`
    ctx.beginPath()
    ctx.ellipse(ex, ey, er * 1.8, er * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, Math.PI * 2)
    ctx.fill()
  }

  // Label
  ctx.globalAlpha = 0.7 * light + 0.1
  ctx.fillStyle = '#e5e7eb'
  ctx.font = `${Math.max(9, er * 0.9)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(e.name || e.type, ex, ey + er + 11)

  ctx.restore()
}

function renderCreature(
  ctx: CanvasRenderingContext2D, c: CreatureState,
  cw: number, ch: number, light: number,
) {
  const [cx, cy] = worldToCanvas(c.x, c.y, cw, ch)
  const cr = radiusToCanvas(1.0, cw)

  ctx.save()
  ctx.shadowColor = '#a78bfa'
  ctx.shadowBlur = 14

  // Body
  ctx.fillStyle = '#a78bfa'
  ctx.beginPath()
  ctx.arc(cx, cy, cr, 0, Math.PI * 2)
  ctx.fill()

  // Direction indicator
  const angle = (c.orientation * Math.PI) / 180
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = Math.max(1, cr * 0.3)
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(angle) * cr * 1.3, cy + Math.sin(angle) * cr * 1.3)
  ctx.stroke()

  // Energy ring
  ctx.strokeStyle = `rgba(167,139,250,${c.energy})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, cr * 1.5, -Math.PI / 2, -Math.PI / 2 + c.energy * Math.PI * 2)
  ctx.stroke()

  // Name
  ctx.fillStyle = '#e9d5ff'
  ctx.font = `bold ${Math.max(10, cr)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(c.name, cx, cy - cr * 2)

  ctx.restore()
}
