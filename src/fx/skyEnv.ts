import * as THREE from 'three'
import { getSunDirection } from '../world/sun'

// ============================================================
//  PROCEDURAL ENVIRONMENT MAP
// ------------------------------------------------------------
//  The sky dome (world/SkyDome.tsx) paints the sky the player
//  SEES. PBR materials also need to know what the sky looks
//  like in order to reflect it. Rather than ship an HDRI, this
//  paints the same analytic gradient into a 256x128 equirect
//  canvas and runs it through three's PMREM generator once.
//
//  Same sun direction, same palette -> the teal paint on the car
//  reflects the same warm sky the camera is looking at, and the
//  chrome on the wheels picks up a hot spot exactly where the
//  sun disc actually is.
//
//  Built once on mount. Costs nothing per frame.
// ============================================================

const W = 256
const H = 128

// Palette, mirroring SkyDome's uniforms so the two never disagree.
const ZENITH = [0x5b, 0x7f, 0xb4]
const HORIZON = [0xff, 0xc9, 0x8a]
const HORIZON_HOT = [0xff, 0x9e, 0x5e]
const ANTI_SUN = [0xb8, 0xa0, 0xc8]
const GROUND = [0xc0, 0xa1, 0x83]
const SUN_GLOW = [0xff, 0xc0, 0x8a]

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Paints the sky into an equirectangular canvas. Uses three's own equirect
 * convention: u wraps atan2(z, x), v runs asin(y) from the bottom of the image.
 */
function paintSky(sun: THREE.Vector3): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  const data = img.data

  const sunAzX = sun.x
  const sunAzZ = sun.z
  const azLen = Math.hypot(sunAzX, sunAzZ) || 1

  for (let py = 0; py < H; py++) {
    // image row 0 is the top; flipY (canvas texture default) makes it v = 1
    const v = 1 - (py + 0.5) / H
    const y = Math.sin((v - 0.5) * Math.PI)
    const r = Math.sqrt(Math.max(0, 1 - y * y))

    for (let px = 0; px < W; px++) {
      const a = ((px + 0.5) / W - 0.5) * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r

      const up = Math.max(0, y)
      const grad = Math.pow(up, 0.42)
      let cr = mix(HORIZON[0], ZENITH[0], grad)
      let cg = mix(HORIZON[1], ZENITH[1], grad)
      let cb = mix(HORIZON[2], ZENITH[2], grad)

      // how far around the compass we are from the sun, ignoring elevation
      const hLen = Math.hypot(x, z) || 1
      const az = (x * sunAzX + z * sunAzZ) / (hLen * azLen)

      const lowBand = 1 - smoothstep(0, 0.4, up)
      const hot = smoothstep(-0.15, 1, az) * lowBand * 0.8
      cr = mix(cr, HORIZON_HOT[0], hot)
      cg = mix(cg, HORIZON_HOT[1], hot)
      cb = mix(cb, HORIZON_HOT[2], hot)

      const antiBand = 1 - smoothstep(0, 0.55, up)
      const anti = smoothstep(-0.1, -1, az) * antiBand * 0.5
      cr = mix(cr, ANTI_SUN[0], anti)
      cg = mix(cg, ANTI_SUN[1], anti)
      cb = mix(cb, ANTI_SUN[2], anti)

      // sun glow, then the disc itself. Deliberately blown out: this is the
      // hot spot every specular highlight on the car is a reflection of.
      const cosA = Math.max(0, x * sun.x + y * sun.y + z * sun.z)
      const glow = Math.pow(cosA, 26) * 0.65 + Math.pow(cosA, 5) * 0.16
      cr += SUN_GLOW[0] * glow
      cg += SUN_GLOW[1] * glow
      cb += SUN_GLOW[2] * glow

      // Small and only just short of white. A full-strength disc here becomes a
      // blown headlamp-sized blob on the bonnet once bloom gets hold of it; what
      // we want is a glint that says "there is a sun over there".
      const disc = 1 - smoothstep(0.022, 0.042, Math.acos(Math.min(1, cosA)))
      cr = mix(cr, 246, disc)
      cg = mix(cg, 240, disc)
      cb = mix(cb, 226, disc)

      // below the horizon: warm dusty bounce, which is what lifts the car's
      // underside and the insides of the wheel arches.
      const below = smoothstep(-0.14, 0.01, y)
      cr = mix(GROUND[0] * 0.72, cr, below)
      cg = mix(GROUND[1] * 0.72, cg, below)
      cb = mix(GROUND[2] * 0.72, cb, below)

      const i = (py * W + px) * 4
      data[i] = Math.min(255, cr)
      data[i + 1] = Math.min(255, cg)
      data[i + 2] = Math.min(255, cb)
      data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas
}

export interface SkyEnvironment {
  texture: THREE.Texture
  dispose(): void
}

/** Build the PMREM-filtered environment. Call once, on mount. */
export function buildSkyEnvironment(renderer: THREE.WebGLRenderer): SkyEnvironment {
  const source = new THREE.CanvasTexture(paintSky(getSunDirection()))
  source.mapping = THREE.EquirectangularReflectionMapping
  source.colorSpace = THREE.SRGBColorSpace
  source.needsUpdate = true

  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const target = pmrem.fromEquirectangular(source)

  source.dispose()
  pmrem.dispose()

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  }
}
