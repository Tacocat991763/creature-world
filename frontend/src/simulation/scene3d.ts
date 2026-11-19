/**
 * Pinos-style 3D scene.
 *
 * The USER has a first-person body they walk around with WASD + mouse-drag.
 * LUMA is the AI creature that moves autonomously (driven by backend CTRNN).
 * World is a tiled plaza with low-poly voxel buildings. Pastel palette.
 *
 * World coords (x, y ∈ [0,100])  →  Three.js (x-50, 0, y-50).  Y = up.
 */
import * as THREE from 'three'
import type { WorldStateMsg } from '../hooks/useWorldState'

// ─── palette ──────────────────────────────────────────────────────────────────
const C = {
  sky_top:    0x9bb8e8,
  sky_bot:    0xd4c8f0,
  ground:     0xdde4f0,
  grid:       0xc4ccdf,
  building_a: 0xc9d4f5,
  building_b: 0xf5d4e8,
  building_c: 0xd4f0e8,
  window_lit: 0xffeeaa,
  window_dim: 0xaabbd4,
  luma:       0xa78bfa,
  luma_glow:  0x7c3aed,
  dot:        0xf9a8d4,
  tree_trunk: 0xb49a7a,
  tree_leaf:  0x9fd4b2,
  path:       0xe8e0d8,
  lamp_post:  0xc0bcd0,
  lamp_glow:  0xfff4c2,
}

const WORLD = 100

function wp(wx: number, wy: number, h = 0): THREE.Vector3 {
  return new THREE.Vector3(wx - WORLD / 2, h, wy - WORLD / 2)
}

// ─── ground + plaza ───────────────────────────────────────────────────────────
function makeGround(): THREE.Group {
  const g = new THREE.Group()

  // base tile plane
  const tiles = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD, WORLD),
    new THREE.MeshLambertMaterial({ color: C.ground }),
  )
  tiles.rotation.x = -Math.PI / 2
  tiles.receiveShadow = true
  g.add(tiles)

  // grid lines via LineSegments
  const gridGeo = new THREE.BufferGeometry()
  const pts: number[] = []
  const half = WORLD / 2
  const step = 5
  for (let i = -half; i <= half; i += step) {
    pts.push(i, 0.01, -half,  i, 0.01, half)
    pts.push(-half, 0.01, i,  half, 0.01, i)
  }
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const gridLines = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: C.grid, transparent: true, opacity: 0.5 }),
  )
  g.add(gridLines)

  // central circular path
  const pathGeo = new THREE.RingGeometry(8, 12, 48)
  const pathMesh = new THREE.Mesh(
    pathGeo,
    new THREE.MeshLambertMaterial({ color: C.path, side: THREE.DoubleSide }),
  )
  pathMesh.rotation.x = -Math.PI / 2
  pathMesh.position.y = 0.01
  g.add(pathMesh)

  return g
}

// ─── buildings ────────────────────────────────────────────────────────────────
function makeBuilding(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  )
  body.position.y = h / 2
  body.castShadow = true
  g.add(body)

  // roof overhang
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4),
    new THREE.MeshLambertMaterial({ color: mixColor(color, 0x000000, 0.15) }),
  )
  roof.position.y = h + 0.15
  g.add(roof)

  // windows (3×2 grid)
  const winMat = new THREE.MeshBasicMaterial({
    color: Math.random() > 0.4 ? C.window_lit : C.window_dim,
  })
  const rows = Math.max(1, Math.floor(h / 2))
  const cols = Math.max(1, Math.floor(w / 2))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), winMat)
      win.position.set(
        (c - (cols - 1) / 2) * (w / cols),
        1 + r * 2.0,
        d / 2 + 0.01,
      )
      g.add(win)
    }
  }
  return g
}

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const gg = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (gg << 8) | bl
}

// ─── street lamp ──────────────────────────────────────────────────────────────
function makeLamp(): THREE.Group {
  const g = new THREE.Group()
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 3.5, 7),
    new THREE.MeshLambertMaterial({ color: C.lamp_post }),
  )
  post.position.y = 1.75
  g.add(post)
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 7),
    new THREE.MeshBasicMaterial({ color: C.lamp_glow }),
  )
  head.position.y = 3.6
  g.add(head)
  // actual point light — small radius
  const light = new THREE.PointLight(C.lamp_glow, 0.6, 12)
  light.position.y = 3.6
  g.add(light)
  return g
}

// ─── low-poly tree ────────────────────────────────────────────────────────────
function makeTree(): THREE.Group {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6),
    new THREE.MeshLambertMaterial({ color: C.tree_trunk }),
  )
  trunk.position.y = 0.6
  g.add(trunk)
  // stacked cone tiers
  for (let i = 0; i < 3; i++) {
    const tier = new THREE.Mesh(
      new THREE.ConeGeometry(1.4 - i * 0.3, 1.0, 7),
      new THREE.MeshLambertMaterial({ color: mixColor(C.tree_leaf, 0x000000, i * 0.08) }),
    )
    tier.position.y = 1.2 + i * 0.7
    tier.castShadow = true
    g.add(tier)
  }
  return g
}

// ─── Luma — the AI creature ───────────────────────────────────────────────────
function makeLuma(): THREE.Group {
  const g = new THREE.Group()

  // rounded body — slightly flattened sphere
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 14, 11),
    new THREE.MeshLambertMaterial({
      color: C.luma,
      emissive: C.luma_glow,
      emissiveIntensity: 0.12,
    }),
  )
  body.scale.y = 0.9
  body.position.y = 0.52
  body.castShadow = true
  g.add(body)

  // ears (two rounded cones)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.38, 7),
      new THREE.MeshLambertMaterial({ color: C.luma }),
    )
    ear.position.set(side * 0.33, 1.02, -0.08)
    ear.rotation.z = -side * 0.35
    g.add(ear)
    // inner ear
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.22, 7),
      new THREE.MeshLambertMaterial({ color: C.dot }),
    )
    inner.position.set(side * 0.33, 1.02, -0.07)
    inner.rotation.z = -side * 0.35
    g.add(inner)
  }

  // eyes
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    )
    white.position.set(side * 0.22, 0.65, 0.46)
    g.add(white)
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 7, 6),
      new THREE.MeshBasicMaterial({ color: 0x1a1030 }),
    )
    pupil.position.set(side * 0.23, 0.65, 0.52)
    g.add(pupil)
    // highlight
    const hi = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    )
    hi.position.set(side * 0.26, 0.68, 0.545)
    g.add(hi)
  }

  // nose
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xd946a8 }),
  )
  nose.position.set(0, 0.6, 0.53)
  g.add(nose)

  // tail (small curved bump behind)
  const tail = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 7),
    new THREE.MeshLambertMaterial({ color: C.luma }),
  )
  tail.scale.set(0.7, 0.7, 1.1)
  tail.position.set(0, 0.42, -0.56)
  g.add(tail)

  // drop shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x3010a0, opacity: 0.13, transparent: true }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.005
  g.add(shadow)

  return g
}

// ─── generic entity mesh ──────────────────────────────────────────────────────
function meshForEntity(type: string, name: string, radius: number): THREE.Group {
  const t = (type + ' ' + name).toLowerCase()
  if (t.includes('tree') || t.includes('oak') || t.includes('pine')) return makeTree()

  if (t.includes('flower') || t.includes('wildflower')) {
    const g = new THREE.Group()
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.55, 5),
      new THREE.MeshLambertMaterial({ color: 0x7ec88c }),
    )
    stem.position.y = 0.28
    g.add(stem)
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0xfda4af }),
    )
    bloom.position.y = 0.65
    g.add(bloom)
    return g
  }

  if (t.includes('rock') || t.includes('stone')) {
    const g = new THREE.Group()
    const geo = new THREE.DodecahedronGeometry(radius * 0.7, 0)
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) * (0.8 + Math.random() * 0.4))
      p.setY(i, p.getY(i) * (0.6 + Math.random() * 0.3))
      p.setZ(i, p.getZ(i) * (0.8 + Math.random() * 0.4))
    }
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xb8c0cc }))
    mesh.position.y = radius * 0.3
    g.add(mesh)
    return g
  }

  if (t.includes('bench')) {
    const g = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8b89a })
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), mat)
    seat.position.y = 0.5
    g.add(seat)
    for (const [lx, lz] of [[-0.55, -0.18], [-0.55, 0.18], [0.55, -0.18], [0.55, 0.18]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), mat)
      leg.position.set(lx, 0.25, lz)
      g.add(leg)
    }
    return g
  }

  if (t.includes('food') || t.includes('berry') || t.includes('fruit')) {
    const g = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 7),
      new THREE.MeshLambertMaterial({ color: 0xfb923c }),
    )
    mesh.position.y = 0.3
    g.add(mesh)
    return g
  }

  if (t.includes('person') || t.includes('human')) {
    const g = new THREE.Group()
    const mat = new THREE.MeshLambertMaterial({ color: C.dot })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8), mat)
    body.position.y = 0.6
    g.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), mat)
    head.position.y = 1.2
    g.add(head)
    return g
  }

  // fallback cube
  const g = new THREE.Group()
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.8, radius * 0.8, radius * 0.8),
    new THREE.MeshLambertMaterial({ color: 0xc4b5fd }),
  )
  mesh.position.y = radius * 0.4
  g.add(mesh)
  return g
}

// ─── scene class ──────────────────────────────────────────────────────────────

export class Scene3D {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private sun: THREE.DirectionalLight
  private ambient: THREE.AmbientLight
  private lumaGroup: THREE.Group
  private entityMeshes = new Map<string, THREE.Group>()
  private _raf = 0
  private _lastState: WorldStateMsg | null = null

  // user camera body — walks around the world with WASD + drag
  private _userPos = new THREE.Vector3(0, 1.5, 8)   // start near Luma's spawn, eye height
  private _yaw   = 0          // yaw=0 → camera looks toward -Z (into scene from z=8)
  private _pitch = -0.14      // slight downward tilt
  private _hasMoved = false   // auto-follow Luma until player moves

  private _keys: Record<string, boolean> = {}
  private _dragging = false
  private _lastMouse = { x: 0, y: 0 }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(C.sky_top)
    this.scene.fog = new THREE.Fog(C.sky_bot, 40, 95)

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 150)

    // Lighting
    this.ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(this.ambient)

    this.sun = new THREE.DirectionalLight(0xfff8f0, 1.0)
    this.sun.position.set(20, 50, 20)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.left = -60
    this.sun.shadow.camera.right = 60
    this.sun.shadow.camera.top = 60
    this.sun.shadow.camera.bottom = -60
    this.sun.shadow.camera.far = 150
    this.scene.add(this.sun)

    // Ground + plaza
    this.scene.add(makeGround())

    // Ring of lamps
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2
      const lamp = makeLamp()
      lamp.position.set(Math.cos(angle) * 18, 0, Math.sin(angle) * 18)
      this.scene.add(lamp)
    }

    // Voxel buildings around perimeter
    this._placeBuildings()

    // Trees dotted around
    const treePositions = [
      [-22, -15], [25, -18], [-28, 20], [30, 22], [-10, -30], [15, 32],
      [-32, 5], [35, -5], [5, -35], [-5, 36],
    ]
    for (const [tx, tz] of treePositions) {
      const tree = makeTree()
      tree.position.set(tx, 0, tz)
      this.scene.add(tree)
    }

    // Luma
    this.lumaGroup = makeLuma()
    this.scene.add(this.lumaGroup)

    this._bindInput(canvas)
    this._raf = requestAnimationFrame(this._animate)
  }

  // ── buildings ───────────────────────────────────────────────────────────────

  private _placeBuildings() {
    const configs: Array<[number, number, number, number, number, number]> = [
      // wx, wz,   w, h,  d,  color
      [-38, -38,   6, 8,  5,  C.building_a],
      [-38,  38,   5, 12, 4,  C.building_b],
      [ 38, -38,   7, 6,  6,  C.building_c],
      [ 38,  38,   6, 10, 5,  C.building_a],
      [-40,   0,   4, 7,  4,  C.building_b],
      [ 40,   0,   5, 9,  4,  C.building_c],
      [  0, -42,   8, 5,  5,  C.building_a],
      [  0,  42,   6, 8,  6,  C.building_b],
      [-20, -40,   4, 6,  4,  C.building_c],
      [ 22,  40,   5, 7,  4,  C.building_a],
    ]
    for (const [bx, bz, w, h, d, col] of configs) {
      const b = makeBuilding(w, h, d, col)
      b.position.set(bx, 0, bz)
      this.scene.add(b)
    }
  }

  // ── public API ──────────────────────────────────────────────────────────────

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  update(state: WorldStateMsg) {
    this._lastState = state

    // Move Luma
    const lx = state.creature.x - WORLD / 2
    const lz = state.creature.y - WORLD / 2
    this.lumaGroup.position.set(lx, 0, lz)
    const vx = state.creature.vx ?? 0
    const vz = state.creature.vy ?? 0
    if (Math.abs(vx) + Math.abs(vz) > 0.05) {
      this.lumaGroup.rotation.y = Math.atan2(vx, vz)
    }

    // Sync world entity meshes
    const seen = new Set<string>()
    for (const e of state.entities) {
      seen.add(e.id)
      if (!this.entityMeshes.has(e.id)) {
        const m = meshForEntity(e.type, e.name, e.radius)
        m.position.set(e.x - WORLD / 2, 0, e.y - WORLD / 2)
        this.scene.add(m)
        this.entityMeshes.set(e.id, m)
      }
    }
    for (const [id, mesh] of this.entityMeshes) {
      if (!seen.has(id)) { this.scene.remove(mesh); this.entityMeshes.delete(id) }
    }

    // Sky + lighting by time of day
    const hour = state.environment?.hour ?? 12
    const light = state.environment?.ambient_light ?? 1.0
    this._updateSky(hour, light)
  }

  pickWorldPos(clientX: number, clientY: number, rect: DOMRect) {
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    if (!ray.ray.intersectPlane(ground, hit)) return null
    return {
      x: Math.max(0, Math.min(WORLD, hit.x + WORLD / 2)),
      y: Math.max(0, Math.min(WORLD, hit.z + WORLD / 2)),
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf)
    this._unbindInput()
    this.renderer.dispose()
  }

  // ── input ───────────────────────────────────────────────────────────────────

  private _canvas!: HTMLCanvasElement
  private _onKey   = (e: KeyboardEvent) => { this._keys[e.key.toLowerCase()] = e.type === 'keydown' }
  private _onDown  = (e: MouseEvent)    => { this._dragging = true; this._lastMouse = { x: e.clientX, y: e.clientY } }
  private _onMove  = (e: MouseEvent)    => {
    if (!this._dragging) return
    const dx = e.clientX - this._lastMouse.x
    const dy = e.clientY - this._lastMouse.y
    if (Math.abs(dx) + Math.abs(dy) > 2) this._hasMoved = true
    this._yaw   -= dx * 0.004
    this._pitch -= dy * 0.004
    this._pitch  = Math.max(-1.0, Math.min(0.4, this._pitch))
    this._lastMouse = { x: e.clientX, y: e.clientY }
  }
  private _onUp    = ()                 => { this._dragging = false }

  private _bindInput(canvas: HTMLCanvasElement) {
    this._canvas = canvas
    window.addEventListener('keydown', this._onKey)
    window.addEventListener('keyup',   this._onKey)
    canvas.addEventListener('mousedown', this._onDown)
    window.addEventListener('mousemove', this._onMove)
    window.addEventListener('mouseup',   this._onUp)
  }
  private _unbindInput() {
    window.removeEventListener('keydown', this._onKey)
    window.removeEventListener('keyup',   this._onKey)
    this._canvas?.removeEventListener('mousedown', this._onDown)
    window.removeEventListener('mousemove', this._onMove)
    window.removeEventListener('mouseup',   this._onUp)
  }

  // ── sky ─────────────────────────────────────────────────────────────────────

  private _updateSky(hour: number, light: number) {
    const isNight = hour < 5 || hour >= 21
    const isDusk  = (hour >= 17 && hour < 21) || (hour >= 5 && hour < 7)
    let sky: THREE.Color
    if (isNight)      sky = new THREE.Color(0x0d0d2a)
    else if (isDusk)  sky = new THREE.Color(0xf0a884).lerp(new THREE.Color(C.sky_top), 0.4)
    else              sky = new THREE.Color(C.sky_top)
    this.scene.background = sky
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color = sky
    this.ambient.intensity = 0.15 + light * 0.65
    this.sun.intensity = light * 1.1
    const ang = ((hour - 6) / 12) * Math.PI
    this.sun.position.set(Math.cos(ang) * 40, Math.abs(Math.sin(ang)) * 60 + 5, 20)
  }

  // ── animate ─────────────────────────────────────────────────────────────────

  private _animate = () => {
    this._raf = requestAnimationFrame(this._animate)
    const t = performance.now() / 1000

    // Luma breathing/hop
    if (this.lumaGroup) {
      this.lumaGroup.position.y = Math.abs(Math.sin(t * 2.2)) * 0.12
      this.lumaGroup.children[0]?.scale.set(
        1 + Math.sin(t * 1.4) * 0.015,
        0.9 + Math.sin(t * 1.4) * 0.015,
        1 + Math.sin(t * 1.4) * 0.015,
      )
    }

    // WASD walk
    const SPEED = 0.08
    const forward = new THREE.Vector3(-Math.sin(this._yaw), 0, -Math.cos(this._yaw))
    const right   = new THREE.Vector3( Math.cos(this._yaw), 0, -Math.sin(this._yaw))
    const anyKey = this._keys['w'] || this._keys['s'] || this._keys['a'] || this._keys['d']
      || this._keys['arrowup'] || this._keys['arrowdown'] || this._keys['arrowleft'] || this._keys['arrowright']
    if (anyKey) this._hasMoved = true

    if (this._keys['w'] || this._keys['arrowup'])    this._userPos.addScaledVector(forward,  SPEED)
    if (this._keys['s'] || this._keys['arrowdown'])  this._userPos.addScaledVector(forward, -SPEED)
    if (this._keys['a'] || this._keys['arrowleft'])  this._userPos.addScaledVector(right,   -SPEED)
    if (this._keys['d'] || this._keys['arrowright']) this._userPos.addScaledVector(right,    SPEED)

    // Auto-follow Luma until player takes control
    if (!this._hasMoved && this._lastState) {
      const lx = this._lastState.creature.x - WORLD / 2
      const lz = this._lastState.creature.y - WORLD / 2
      const vx = this._lastState.creature.vx ?? 0
      const vz = this._lastState.creature.vy ?? 0
      // stand 7 units behind Luma's movement direction
      const moveAngle = Math.atan2(vx, vz)
      const followAngle = moveAngle + Math.PI
      const target = new THREE.Vector3(
        lx + Math.sin(followAngle) * 7,
        1.5,
        lz + Math.cos(followAngle) * 7,
      )
      this._userPos.lerp(target, 0.03)
      // face toward Luma — yaw convention: yaw=0 looks in -Z, so face = atan2(camX-lumaX, camZ-lumaZ)
      const towardLuma = Math.atan2(this._userPos.x - lx, this._userPos.z - lz)
      this._yaw += (towardLuma - this._yaw) * 0.03
    }
    // clamp to world
    this._userPos.x = Math.max(-48, Math.min(48, this._userPos.x))
    this._userPos.z = Math.max(-48, Math.min(48, this._userPos.z))
    this._userPos.y = 1.5

    // Apply camera from yaw + pitch
    this.camera.position.copy(this._userPos)
    const dir = new THREE.Vector3(
      Math.sin(this._yaw) * Math.cos(this._pitch),
      Math.sin(this._pitch),
      Math.cos(this._yaw) * Math.cos(this._pitch),
    ).negate()
    this.camera.lookAt(this._userPos.clone().add(dir))

    this.renderer.render(this.scene, this.camera)
  }
}
