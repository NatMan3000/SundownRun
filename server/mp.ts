// ============================================================
//  MULTIPLAYER LAUNCHER - `bun run mp` and you're racing
// ------------------------------------------------------------
//  One command on ONE machine: starts the relay (in-process) and the
//  vite dev server with --host so other machines on the LAN can load
//  the game straight from this one - no second clone, no config.
//  Prints the exact URLs to open on each machine.
// ============================================================

import { networkInterfaces } from 'node:os'
import { startRelay } from './relay'

function lanIPv4(): string | null {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      // 169.254.* is link-local noise (un-routable) - never hand that to a kid
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        return a.address
      }
    }
  }
  return null
}

startRelay()

const vite = Bun.spawn(['bun', 'run', 'dev', '--host'], {
  stdout: 'inherit',
  stderr: 'inherit',
})

const ip = lanIPv4()
// Classic Windows consoles print ANSI codes as garbage - colour only where safe.
const tty = process.platform !== 'win32' || !!process.env.WT_SESSION
const amber = tty ? '\x1b[33m' : ''
const bold = tty ? '\x1b[1m' : ''
const dim = tty ? '\x1b[2m' : ''
const reset = tty ? '\x1b[0m' : ''

setTimeout(() => {
  console.log(`
${bold}${amber}  SUNDOWN RUN - MULTIPLAYER${reset}

  This machine:   ${bold}http://localhost:5199/?mp=1&name=JOSH${reset}
  Other machines: ${bold}${ip ? `http://${ip}:5199/?mp=1&name=DAD&color=red` : '(no LAN address found - check wifi)'}${reset}

  ${dim}Change name=... to whatever you like, and color=... to any
  colour (green, orange, %23FF00FF...) so every car looks different.
  Everyone who opens a link joins the same world. Ctrl+C stops it all.

  Friends can't connect? This computer's firewall must allow ports
  5199-5200 in. On Windows, run Sundown Run Multiplayer.bat - it adds the rule.${reset}
`)
}, 900)

const shutdown = () => {
  vite.kill()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await vite.exited
process.exit(0)
