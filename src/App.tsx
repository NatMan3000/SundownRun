import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { CONFIG } from './core/config'
import { World } from './world/World'
import { Vehicle } from './vehicle/Vehicle'
import { ChaseCamera } from './vehicle/ChaseCamera'
import { Lighting } from './fx/Lighting'
import { Effects } from './fx/Effects'
import { FxRoot } from './fx/FxRoot'
import { Delights } from './world/Delights'
import { AudioSystem } from './audio/AudioSystem'
import { HUD } from './ui/HUD'
import { DevTools } from './dev/DevTools'

export default function App() {
  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: CONFIG.fovBase, near: 0.3, far: CONFIG.drawDistanceM }}
      >
        <Suspense fallback={null}>
          <Physics timeStep={1 / 60} colliders={false}>
            <World />
            <Vehicle />
          </Physics>
          <FxRoot />
          <Delights />
          <Lighting />
          <Effects />
          <ChaseCamera />
          <AudioSystem />
          <DevTools />
        </Suspense>
      </Canvas>
      <HUD />
    </>
  )
}
