// ============================================================
//  CAR BODY - visual placeholder, built to be replaced
// ------------------------------------------------------------
//  THE SWAP CONTRACT (read this before re-skinning the car)
//
//  This component draws the car and NOTHING else. It runs no
//  physics, reads no input, and owns no state. It is handed the
//  car's pose by its parent and its articulation by `carVisual`
//  (src/vehicle/carVisual.ts). To replace the meshes with a real
//  model, keep the four rules below and touch nothing in
//  useVehiclePhysics.ts.
//
//  1. SPACE. Everything here is drawn in CHASSIS-LOCAL space.
//     The rigid body's world pose is already applied by the
//     parent group. The origin sits on the centre line, 0.54 m
//     above the road at rest (0.20 m above the wheel hubs).
//     So local y = -0.542 IS the road surface at rest.
//     +Z forward, +Y up, +X is the car's LEFT.
//
//  2. THE SPRUNG BODY vs THE WHEELS. `bodyRef` holds everything
//     that leans - shell, glass, lights, wings. The wheels hang
//     OUTSIDE it. carVisual.roll / .pitch / .bodyOffsetY move only
//     the body. That separation is what reads as suspension.
//       rotation.z = +roll   (positive = leaning right)
//       rotation.x = -pitch  (positive pitch = nose up)
//
//  3. THE WHEELS. carVisual.wheels is [FL, FR, RL, RR]. Each gives
//     a chassis-local `position` (suspension travel already baked
//     in), a `steer` yaw, a `spin` angle about the axle (+X), a
//     0..1 `compression`, and a `contact` flag. The node layout is
//     steer group -> spin group -> mesh, so a swapped-in wheel mesh
//     only has to sit at the origin with its axle along X.
//
//  4. SYNC. `sync()` is called by Vehicle ONCE per rendered frame,
//     after the physics has written carVisual and before three
//     renders. Do all mesh updates there. Do not add a useFrame -
//     a child's useFrame runs BEFORE its parent's, which would put
//     the wheels one frame behind the car.
//
//  Nothing here allocates per frame.
// ============================================================

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CONFIG } from '../core/config'
import { carVisual } from './carVisual'
import type { CarBodyHandle } from './carVisual'
import { WHEEL } from './tuning'

const WHEEL_WIDTH = 0.24
const TYRE_COLOUR = '#1B1A1A'
const RIM_COLOUR = '#C6C2B4'

export const CarBody = forwardRef<CarBodyHandle>(function CarBody(_props, ref) {
  const bodyRef = useRef<THREE.Group>(null)
  const steerRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const spinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null])
  const brakeRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([null, null])

  // Cylinder axis is +Y; lay it on its side so the axle runs along local X.
  const wheelGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL_WIDTH, 18, 1)
    g.rotateZ(Math.PI / 2)
    return g
  }, [])
  const rimGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(WHEEL.radius * 0.58, WHEEL.radius * 0.58, WHEEL_WIDTH + 0.02, 12, 1)
    g.rotateZ(Math.PI / 2)
    return g
  }, [])

  useImperativeHandle(
    ref,
    (): CarBodyHandle => ({
      sync() {
        const body = bodyRef.current
        if (body) {
          body.rotation.z = carVisual.roll
          body.rotation.x = -carVisual.pitch
          body.position.y = carVisual.bodyOffsetY
        }
        for (let i = 0; i < 4; i++) {
          const w = carVisual.wheels[i]
          const steer = steerRefs.current[i]
          const spin = spinRefs.current[i]
          if (steer) {
            steer.position.copy(w.position)
            steer.rotation.y = w.steer
          }
          if (spin) spin.rotation.x = w.spin
        }
        const glow = 0.25 + carVisual.brake * 2.6
        for (let i = 0; i < 2; i++) {
          const m = brakeRefs.current[i]
          if (m) m.emissiveIntensity = glow
        }
      },
    }),
    []
  )

  return (
    <group>
      {/* ---------- sprung body: leans, pitches, squats ----------
          Road surface is local y = -0.542. The sill box is narrow and the
          shoulder box above it is wide, so the wheels sit in a recess and
          read as wheels rather than as black stubs under a slab. */}
      <group ref={bodyRef}>
        {/* sill / underbody - narrow, 0.20m over the road */}
        <mesh position={[0, -0.19, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[1.62, 0.3, 4.05]} />
          <meshStandardMaterial color={CONFIG.carColor} roughness={0.34} metalness={0.32} />
        </mesh>

        {/* shoulder - the wide part, flared over the wheels */}
        <mesh position={[0, 0.09, -0.05]} castShadow receiveShadow>
          <boxGeometry args={[1.88, 0.34, 4.16]} />
          <meshStandardMaterial color={CONFIG.carColor} roughness={0.34} metalness={0.32} />
        </mesh>

        {/* nose wedge - drops the bonnet line forward */}
        <mesh position={[0, 0.02, 1.72]} rotation={[-0.1, 0, 0]} castShadow>
          <boxGeometry args={[1.8, 0.26, 0.92]} />
          <meshStandardMaterial color={CONFIG.carColor} roughness={0.34} metalness={0.32} />
        </mesh>

        {/* greenhouse - narrower and set back, coupe proportion */}
        <mesh position={[0, 0.47, -0.3]} castShadow>
          <boxGeometry args={[1.54, 0.44, 1.86]} />
          <meshStandardMaterial color={CONFIG.carColor} roughness={0.34} metalness={0.32} />
        </mesh>

        {/* glass band, one piece wrapping the cabin */}
        <mesh position={[0, 0.5, -0.3]} castShadow>
          <boxGeometry args={[1.56, 0.26, 1.74]} />
          <meshStandardMaterial color="#16202B" roughness={0.12} metalness={0.6} />
        </mesh>

        {/* raked windscreen */}
        <mesh position={[0, 0.42, 0.68]} rotation={[0.6, 0, 0]} castShadow>
          <boxGeometry args={[1.48, 0.05, 0.9]} />
          <meshStandardMaterial color="#16202B" roughness={0.12} metalness={0.6} />
        </mesh>

        {/* ducktail spoiler */}
        <mesh position={[0, 0.3, -2.0]} castShadow>
          <boxGeometry args={[1.66, 0.07, 0.3]} />
          <meshStandardMaterial color="#2A2A2C" roughness={0.6} />
        </mesh>

        {/* front splitter */}
        <mesh position={[0, -0.29, 2.0]} castShadow>
          <boxGeometry args={[1.7, 0.07, 0.42]} />
          <meshStandardMaterial color="#2A2A2C" roughness={0.6} />
        </mesh>

        {/* side skirts, between the wheels */}
        {[0.84, -0.84].map((x) => (
          <mesh key={x} position={[x, -0.3, -0.05]} castShadow>
            <boxGeometry args={[0.1, 0.12, 2.1]} />
            <meshStandardMaterial color="#2A2A2C" roughness={0.6} />
          </mesh>
        ))}

        {/* headlights */}
        {[0.6, -0.6].map((x) => (
          <mesh key={x} position={[x, 0.02, 2.11]} castShadow>
            <boxGeometry args={[0.46, 0.13, 0.08]} />
            <meshStandardMaterial
              color="#FFF3D6"
              emissive="#FFE0A0"
              emissiveIntensity={1.1}
              roughness={0.2}
            />
          </mesh>
        ))}

        {/* tail lights - emissive rides on carVisual.brake */}
        {[0.64, -0.64].map((x, i) => (
          <mesh key={x} position={[x, 0.06, -2.14]} castShadow>
            <boxGeometry args={[0.42, 0.11, 0.07]} />
            <meshStandardMaterial
              ref={(m) => {
                brakeRefs.current[i] = m
              }}
              color="#8E1B14"
              emissive="#FF2A16"
              emissiveIntensity={0.25}
              roughness={0.3}
            />
          </mesh>
        ))}

        {/* mirrors - tiny, but they read as "car" at a glance */}
        {[0.98, -0.98].map((x) => (
          <mesh key={x} position={[x, 0.36, 0.56]} castShadow>
            <boxGeometry args={[0.16, 0.08, 0.1]} />
            <meshStandardMaterial color="#2A2A2C" roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* ---------- unsprung: wheels ride the suspension ---------- */}
      {carVisual.wheels.map((w, i) => (
        <group
          key={i}
          ref={(g) => {
            steerRefs.current[i] = g
          }}
          position={w.position}
        >
          <group
            ref={(g) => {
              spinRefs.current[i] = g
            }}
          >
            <mesh geometry={wheelGeom} castShadow receiveShadow>
              <meshStandardMaterial color={TYRE_COLOUR} roughness={0.92} />
            </mesh>
            <mesh geometry={rimGeom} castShadow>
              <meshStandardMaterial color={RIM_COLOUR} roughness={0.35} metalness={0.75} />
            </mesh>
            {/* a spoke, so the spin is actually visible */}
            <mesh castShadow>
              <boxGeometry args={[WHEEL_WIDTH + 0.03, WHEEL.radius * 1.05, 0.05]} />
              <meshStandardMaterial color={RIM_COLOUR} roughness={0.35} metalness={0.75} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
})
