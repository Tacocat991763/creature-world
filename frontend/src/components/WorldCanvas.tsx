import { useRef, useEffect, useCallback } from 'react'
import type { WorldStateMsg } from '../hooks/useWorldState'
import { Scene3D } from '../simulation/scene3d'

interface Props {
  state: WorldStateMsg | null
  onPlace: (x: number, y: number) => void
}

export function WorldCanvas({ state, onPlace }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef  = useRef<Scene3D | null>(null)

  // Init scene once
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const scene = new Scene3D(canvas)
    sceneRef.current = scene

    const ro = new ResizeObserver(() => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      scene.resize(w, h)
    })
    ro.observe(canvas)

    return () => {
      ro.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  // Push state updates into scene
  useEffect(() => {
    if (state) sceneRef.current?.update(state)
  }, [state])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const scene = sceneRef.current
    const canvas = canvasRef.current
    if (!scene || !canvas) return
    const rect = canvas.getBoundingClientRect()
    const pos = scene.pickWorldPos(e.clientX, e.clientY, rect)
    if (pos) onPlace(pos.x, pos.y)
  }, [onPlace])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
      }}
    />
  )
}
