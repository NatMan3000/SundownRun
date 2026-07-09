// STUB - drive worker replaces this file.
// Contract: spring-damped chase camera reading core/telemetry pose. FOV
// CONFIG.fovBase -> CONFIG.fovMax with speed, subtle speed shake, collision
// kick from telemetry.impact. Never snaps (except on reset), never clips terrain.
import { useFrame } from '@react-three/fiber'
import { getSpawn } from '../core/terrain'

const spawn = getSpawn()

export function ChaseCamera() {
  useFrame(({ camera }) => {
    camera.position.set(spawn.position.x - 10, spawn.position.y + 6, spawn.position.z - 10)
    camera.lookAt(spawn.position)
  })
  return null
}
