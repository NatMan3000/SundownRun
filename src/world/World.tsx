import { useFrame } from '@react-three/fiber'
import { SkyDome } from './SkyDome'
import { Mountains } from './Mountains'
import { Terrain } from './Terrain'
import { Road } from './Road'
import { Grass } from './Grass'
import { Trees } from './Trees'
import { Rocks } from './Rocks'
import { StartLine } from './StartLine'
import { RidgeArches } from './RidgeArches'
import { Colliders } from './Colliders'
import { windUniforms } from './wind'

// ============================================================
// Sundown Run - the world.
//
// A 3.87 km closed circuit through a golden valley: a 600 m south
// straight with a crest that throws the car above 144 km/h, a flat-out
// east sweeper climbing to a 30 m hairpin switchback, then a north
// straight with a second, sharper crest, and a long downhill left
// sweeper all the way home.
//
// The bowl is sealed: the rim climbs 200 m at up to 71 degrees, which is more
// climb than a 190 km/h car has energy for, and a buried collider ring backs it
// up (core/terrain.ts, world/boundary.ts).
//
// Draw calls: sky 1, mountains 1, terrain 1, road 1, start line 2, ridge arches 1,
// grass 1, trees 3, rocks 1 = 12, plus 6 shadow-caster passes.
// ============================================================

export function World() {
  // One writer for the wind clock. Every swaying material reads the same uniform.
  useFrame((state) => {
    windUniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <>
      <SkyDome />
      <Mountains />
      <Terrain />
      <Road />
      <StartLine />
      <RidgeArches />
      <Grass />
      <Trees />
      <Rocks />
      <Colliders />
    </>
  )
}
