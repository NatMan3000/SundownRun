import * as THREE from 'three'
import { CONFIG } from '../core/config'

// Shared shader uniforms. Wind and draw-distance fades are driven by uniforms, never
// by touching a matrix on the CPU (constitution, section 2). World.tsx advances uTime
// once per frame; every swaying material reads these same objects.

export const windUniforms = {
  uTime: { value: 0 },
  /** xz push applied to blade tips and canopies. */
  uWind: { value: new THREE.Vector2(0.34, 0.15) },
  /** Grass shrinks to nothing between these camera distances - degenerate tris are free. */
  uGrassFade: { value: new THREE.Vector2(92, 132) },
  /** Trees do the same, right at the fog wall, so nothing ever pops. */
  uTreeFade: {
    value: new THREE.Vector2(CONFIG.drawDistanceM * 0.84, CONFIG.drawDistanceM * 0.99),
  },
}
