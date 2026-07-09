// STUB - look worker replaces this file.
// Contract: golden-hour rig per constitution - one warm directional sun (shadow
// map <= 2048, tight frustum following the car), hemisphere fill, fog matched
// to draw distance, sky. Sun angle derives from CONFIG.timeOfDay.
export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#7B90C4', '#C9A268', 0.6]} />
      <directionalLight position={[120, 60, -80]} intensity={2.2} color="#FFD9A8" castShadow />
      <fog attach="fog" args={['#d8b48c', 200, 1200]} />
      <color attach="background" args={['#c9a97e']} />
    </>
  )
}
