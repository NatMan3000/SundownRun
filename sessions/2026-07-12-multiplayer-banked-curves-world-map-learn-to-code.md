---
type: auto
session_id: 523808db-2843-4605-af0d-6cd2c513c804
project: SundownRun
date: 2026-07-12
topic: LAN multiplayer, banked curves, world map, Josh's Learn-to-Code doc
duration: 5.3 hours
events: 542
---

# LAN multiplayer, banked curves, world map, Josh's Learn-to-Code doc

**Session Restart ID:** `claude -r 523808db-2843-4605-af0d-6cd2c513c804`

**Duration:** 5.3 hours

**Participants:** Nathan, Kai

## Summary

The single biggest feature day since ship. Nathan asked whether the game could go multiplayer for Josh; Kai scoped split-screen vs LAN-network options (voice-briefed via `/say`), then built real LAN multiplayer end-to-end - a Bun WebSocket relay, kinematic remote-car rendering so crashes genuinely push cars, and synced races - live-verified across two browser clients. The session then chained through a long run of direct playtest feedback: banked hairpin/final-corner curves, a from-code world map for Josh, ghost-car fps, random shard scatter with a hunt timer, a brake-induced-drift physics bug, and finally a full interactive coding workshop built for Josh by name.

## What We Did

1. Scoped multiplayer options (split-screen vs LAN) via voice brief, then built it: `src/net/` (protocol, netStore, net.ts, NetSystem, RemoteCars) + `server/relay.ts` (Bun WS, port 5200, sender-id-tagged fan-out) + `server/mp.ts` (`bun run mp` - starts relay + vite `--host`, prints join links)
2. Made remote cars real physics objects - each peer renders others as interpolated (80ms-delayed, arrival-timestamped ring buffer) kinematic rapier bodies, so local dynamic cars are genuinely shoved on collision; `CONFIG.multiplayerRam` toggles it
3. Added synced races (`raceSignal` in `vehicleSignals.ts`): deterministic grid teleport, 3-2-1-GO with throttle lock, first-valid-lap-wins with raceId-guarded winner claim; and crash-prop world sync (`propsSignal.ts`) so both screens see the same scattered obstacles and score only local pops
4. Debugged Josh's real-world connection failures live: his machine's inbound firewall blocking the host, and PowerShell execution-policy blocking the `.bat`'s `npm run mp` shim - fixed with a proper one-time-admin firewall rule and Bun-first invocation in `Multiplayer.bat`
5. Removed duplicate car colour/name-over-car clutter once both players were visibly on screen (both had blue cars, name label above own car was redundant)
6. Added banked curves at the hairpin and the final corner (physics-terrain-tucked to avoid poke-through) after two rounds of "still needs the other corner" feedback
7. Built `scripts/world-map.ts` -> `World Map.html`: an interactive top-down map generated from the actual game code (terrain export render + clickable markers with file:line vscode links), created `Sundown Run Map Gen.bat` to regenerate + auto-open it
8. Diagnosed a brake-induced-drift complaint down to car-turning physics (oversteer), not the brake itself, per Nathan's own correction mid-session; changed sun shards to re-scatter randomly every reset (crater shard kept permanent) with a separate hunt timer
9. Bumped ghost-car recording rate for smoother playback fps
10. Built `scripts/learn-to-code.ts` -> `Learn To Code.html`: a 10-chapter interactive workshop for Josh by name, with in-page runnable playgrounds, a TypeScript quiz, and real missions anchored to actual game files via file:line links; iterated scroll-spy TOC highlighting and playground code-example height across several rounds
11. Added run/update/multiplayer/map instructions to CLAUDE.md and the bottom of the Learn-to-Code doc after Nathan flagged the doc's run-instruction links only opened files in VS Code instead of being genuinely useful
12. Resolved two stale open threads (tree regrowth, parallax mountain layer - both dropped, not wanted) and added `reserved-ports.md` entry in the Dev workspace for port 5200

## Key Decisions

| Decision | Rationale |
|---|---|
| LAN-network multiplayer over split-screen | Nathan's stated preference once he confirmed the game runs from a cloned repo, not GitHub Pages - network play lets Josh use his own machine and controller |
| Remote cars are kinematic rapier bodies, not dumb sprites | Needed for the "cars could actually crash into each other" ask - only the pushed side needs to feel physics locally; the pusher's own screen already has it via their own stream |
| Shards re-scatter every reset except the crater shard | Nathan: keep the crater shard as the one permanent/fixed hunt target, everything else randomises for replayability |
| Brake-drift bug root-caused to oversteer physics, not brake logic | Nathan corrected his own initial diagnosis mid-session ("it might not be the brakes... might actually just be the physics of the car turning too much") - Kai followed the correction rather than the original framing |
| World map + Learn-to-Code doc both generated FROM the game code | Keeps them non-divergent from the real terrain/file structure as the game evolves, and doubles as literal teaching material pointing at real lines |

## Files Created

| File | Description |
|------|-------------|
| `src/net/protocol.ts` | Multiplayer wire protocol |
| `src/net/netStore.ts` | Client-side multiplayer state store |
| `src/net/net.ts` | WS client connection logic |
| `src/net/RemoteCars.tsx` | Remote car rendering (kinematic rapier bodies) |
| `src/net/NetSystem.tsx` | Multiplayer system mount |
| `server/relay.ts` | Bun WebSocket relay (port 5200) |
| `server/mp.ts` | Combined relay + vite --host launcher |
| `src/core/propsSignal.ts` | Shared/synced crash-prop round seeding |
| `Multiplayer.bat` | Windows multiplayer launcher (superseded later same-session by the renamed/firewall-fixed version) |
| `scripts/world-map.ts` | Generates `World Map.html` from real terrain/game code |
| `Sundown Run Map Gen.bat` | Windows launcher for world-map regeneration + auto-open |
| `scripts/learn-to-code.ts` | Generates `Learn To Code.html`, Josh's interactive workshop |
| `src/world/Geysers.tsx` | Geyser world content (volcano canon precursor) |

## Files Modified

| File | Description |
|------|-------------|
| `src/core/config.ts` | Multiplayer + gameplay tuning knobs |
| `src/App.tsx` | Multiplayer wiring |
| `src/ui/HUD.tsx`, `src/ui/hudStyles.ts` | Removed redundant name-over-car, HUD adjustments |
| `package.json` | `mp`, `map`, `learn` scripts |
| `src/vehicle/Vehicle.tsx`, `useVehiclePhysics.ts` | Handling/physics feed for banking + oversteer investigation |
| `src/vehicle/vehicleSignals.ts` | Race sync signal |
| `src/vehicle/ghost.ts`, `GhostCar.tsx` | Ghost recording rate bump |
| `src/core/input.ts` | Multiplayer input handling |
| `src/world/CrashProps.tsx` | Synced crash-prop scattering |
| `src/core/terrain.ts` | Banked-curve terrain-tuck fix |
| `src/world/Road.tsx` | Banked hairpin + final-corner geometry |
| `src/world/Terrain.tsx`, `World.tsx`, `Delights.tsx` | World integration for geysers/shard scatter |
| `src/vehicle/ChaseCamera.tsx` | Camera adjustment |
| `src/core/store.ts` | Shard hunt timer state |
| `README.md`, `CLAUDE.md` | Run/update/multiplayer/map instructions |
| `~/Dev/.claude/rules/reserved-ports.md` | Registered port 5200 for the relay |

## Next Steps

- Playtest verdict on handling-feel knobs (`CONFIG.stability`, footbrake EBD) - tracked as open thread "Handling feel tuning"
- SSH access to Josh's machine for remote debugging - waiting on Nathan (open thread)
- Confirm the renamed `Sundown Run Update.bat` / `Sundown Run Multiplayer.bat` fully replace the earlier `Multiplayer.bat` created mid-session

## Open Questions

- Does a second player need their own clone, or can they always just join off the host's running instance? (Answered in-session: they just open the printed URL, nothing installed - documented in CLAUDE.md.)

## Related Sessions

- [2026-07-11 Playground phase - trick scoring, moved start line, mountain runs, crash-prop family](2026-07-11-playground-phase-tricks-scoring-crash-props.md)
- [2026-07-13 NPC banter (CALDERA FM) spike scaffold](2026-07-13-npc-banter-caldera-fm-spike.md)
