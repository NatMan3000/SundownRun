import * as THREE from 'three'
import { hash2D } from '../core/random'

// ============================================================
// Every texture in the world is generated here at boot. Nothing
// is fetched. Nothing exceeds 1024px (constitution, section 2).
// ============================================================

// ---------- tiling noise ----------
// hash2D is not periodic, so wrap the integer lattice by hand. Without this the
// tiled ground texture shows a hard seam every repeat.

function pHash(xi: number, yi: number, period: number): number {
  const x = ((xi % period) + period) % period
  const y = ((yi % period) + period) % period
  return hash2D(x, y)
}

function pNoise(x: number, y: number, period: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = pHash(xi, yi, period)
  const b = pHash(xi + 1, yi, period)
  const c = pHash(xi, yi + 1, period)
  const d = pHash(xi + 1, yi + 1, period)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function pFbm(x: number, y: number, period: number, octaves: number): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * pNoise(x * freq, y * freq, period * freq)
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

function canvas(size: number): [HTMLCanvasElement, ImageData] {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  return [c, ctx.createImageData(size, size)]
}

function commit(c: HTMLCanvasElement, img: ImageData): THREE.CanvasTexture {
  c.getContext('2d')!.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

// ---------- ground detail ----------

/**
 * Low-contrast grain that multiplies the terrain's vertex colours, so the ground
 * is never a monotone wash. Centred near white; the colour comes from the mesh.
 */
export function makeTerrainDetailTexture(): THREE.CanvasTexture {
  const S = 512
  const [c, img] = canvas(S)
  const d = img.data
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * 8
      const v = (y / S) * 8
      const clumps = pFbm(u, v, 8, 4) //          tufts and bare patches
      const grain = pNoise(u * 22, v * 22, 176) // dry-grass speckle
      // mean ~0.94 sRGB: this multiplies the terrain's vertex colours, so a dark
      // mean would quietly drain 25% of the sun-bleached gold out of the ground
      const l = 0.86 + clumps * 0.16 + (grain - 0.5) * 0.08
      const i = (y * S + x) * 4
      d[i] = clamp255(l * 255 * 1.02) //  a touch warm
      d[i + 1] = clamp255(l * 255)
      d[i + 2] = clamp255(l * 255 * 0.93)
      d[i + 3] = 255
    }
  }
  const t = commit(c, img)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  return t
}

// ---------- road ----------

const ROAD_ASPHALT_U = 0.5625 // 4.5 m of asphalt inside an 8.0 m ribbon half-width

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The road ribbon, drawn across its full 16 m width.
 *   u: 0 = outer dust, 0.5 = centre line, 1 = outer dust
 *   v: repeats every 24 m of road, carrying three 3 m dashes (an 8 m period)
 */
export function makeRoadTexture(): THREE.CanvasTexture {
  const S = 1024
  const [c, img] = canvas(S)
  const d = img.data
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S
      const v = (y + 0.5) / S
      const lat = Math.abs((u - 0.5) * 2) // 0 at the centre line, 1 at the ribbon edge

      const coarse = pFbm(u * 5, v * 5, 5, 4)
      const grain = pNoise(u * 130, v * 130, 130)
      const patch = pFbm(u * 2 + 11, v * 2 + 7, 2, 3)

      let r: number
      let g: number
      let b: number

      if (lat < ROAD_ASPHALT_U) {
        // warm asphalt #4A4440, mottled with older/newer patches
        const t = coarse * 0.65 + patch * 0.35
        r = mix(0x3e, 0x5b, t)
        g = mix(0x39, 0x54, t)
        b = mix(0x36, 0x4d, t)
        // polished wheel tracks either side of the centre line
        const track = Math.exp(-((lat - 0.19) ** 2) / 0.0042)
        const polish = track * (0.55 + 0.45 * grain)
        r -= polish * 12
        g -= polish * 11
        b -= polish * 9
        // dust creeping in from the verges
        const creep = Math.max(0, (lat - 0.36) / (ROAD_ASPHALT_U - 0.36)) ** 2 * (0.35 + 0.5 * coarse)
        r = mix(r, 0x8a, creep * 0.55)
        g = mix(g, 0x7a, creep * 0.55)
        b = mix(b, 0x5e, creep * 0.55)
      } else {
        // dusty verge #8A7A5E, fading into the terrain's gold at the very edge
        const t = coarse * 0.6 + grain * 0.4
        r = mix(0x7c, 0x9c, t)
        g = mix(0x6e, 0x8c, t)
        b = mix(0x54, 0x6c, t)
        const edge = (lat - 0.86) / 0.14
        if (edge > 0) {
          const e = Math.min(1, edge) * (0.55 + 0.45 * patch)
          r = mix(r, 0xa6, e) //  meet the terrain's sun-bleached gold
          g = mix(g, 0x97, e)
          b = mix(b, 0x64, e)
        }
      }

      // faded cream centre line: 0.16 m wide, 3 m dashes on an 8 m period
      const dashV = (v * 3) % 1
      if (lat < 0.01 && dashV < 0.375) {
        const wear = 0.5 + 0.5 * pFbm(u * 30, v * 14 + 3, 30, 2)
        const soft = 1 - Math.min(1, lat / 0.01) ** 8 //     antialias the long edges
        const ends = Math.min(1, Math.min(dashV, 0.375 - dashV) / 0.012)
        const a = wear * soft * ends
        r = mix(r, 0xd8, a)
        g = mix(g, 0xc9, a)
        b = mix(b, 0xa8, a)
      }

      // hairline cracks - a narrow contour band of the noise field, kept faint so they
      // read as seal cracks and not as rivers drawn on the road
      const crack = pFbm(u * 9 + 31, v * 9 + 17, 9, 3)
      if (lat < ROAD_ASPHALT_U && crack > 0.624 && crack < 0.638) {
        const a = 0.32
        r = mix(r, 0x2a, a)
        g = mix(g, 0x27, a)
        b = mix(b, 0x25, a)
      }

      const i = (y * S + x) * 4
      d[i] = clamp255(r)
      d[i + 1] = clamp255(g)
      d[i + 2] = clamp255(b)
      d[i + 3] = 255
    }
  }
  const t = commit(c, img)
  t.wrapS = THREE.ClampToEdgeWrapping // u runs exactly 0..1 across the ribbon
  t.wrapT = THREE.RepeatWrapping //      v repeats along the loop, a whole number of times
  return t
}

// ---------- clouds ----------

/** Soft fbm field the sky shader domain-warps into golden-hour cloud streaks. */
export function makeCloudTexture(): THREE.DataTexture {
  const S = 256
  const data = new Uint8Array(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = pFbm((x / S) * 6, (y / S) * 6, 6, 5)
      const i = (y * S + x) * 4
      const v = clamp255(n * 255)
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}
