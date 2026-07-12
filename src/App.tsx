import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { CONFIG } from './core/config'
import { World } from './world/World'
import { Vehicle } from './vehicle/Vehicle'
import { GhostCar } from './vehicle/GhostCar'
import { mpEnabled } from './net/net'
import { NetSystem } from './net/NetSystem'
import { RemoteCars } from './net/RemoteCars'
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
            {/* Other players' cars are kinematic bodies - they need the physics
                world so ramming works. Mounted only in ?mp=1 sessions. */}
            {mpEnabled() && <RemoteCars />}
          </Physics>
          {/* Purely visual - no physics body, so it lives OUTSIDE <Physics>. */}
          <GhostCar />
          {mpEnabled() && <NetSystem />}
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
