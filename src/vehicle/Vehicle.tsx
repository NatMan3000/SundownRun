// STUB - drive worker replaces this file.
// Contract: physics car (rapier raycast suspension on a dynamic rigid body),
// reads input from core/input, writes core/telemetry every frame, respects
// CONFIG handling knobs, listens to useGameStore.resetNonce for reset-to-road.
// The car's visual body lives in CarBody.tsx (look worker owns it later).
import { useMemo } from 'react'
import { getSpawn } from '../core/terrain'
import { CONFIG } from '../core/config'

export function Vehicle() {
  const spawn = useMemo(() => getSpawn(), [])
  return (
    <mesh position={spawn.position} rotation-y={spawn.rotationY} castShadow>
      <boxGeometry args={[1.9, 1.1, 4.2]} />
      <meshStandardMaterial color={CONFIG.carColor} />
    </mesh>
  )
}
