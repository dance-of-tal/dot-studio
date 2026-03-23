// DOT Studio — Hono API Server (Entry Point)

import { serve } from '@hono/node-server'
import { setupTerminalWs } from './terminal.js'
import { createServerApp } from './app.js'

// Config
import { PORT, OPENCODE_URL, STUDIO_DIR, IS_PRODUCTION, getActiveProjectDir } from './lib/config.js'
import { ensureOpencodeSidecar, isManagedOpencode } from './lib/opencode-sidecar.js'

const app = createServerApp()

// ── Start Server ────────────────────────────────────────
await ensureOpencodeSidecar().catch((err) => {
    console.warn(`OpenCode sidecar is not ready yet: ${err instanceof Error ? err.message : String(err)}`)
})

console.log(`\n🎪 DOT Studio Server${IS_PRODUCTION ? ' (production)' : ' (dev)'}`)
console.log(`   API:      http://localhost:${PORT}`)
console.log(`   OpenCode: ${OPENCODE_URL} (${isManagedOpencode() ? 'managed sidecar' : 'external'})`)
console.log(`   Project:  ${getActiveProjectDir()}`)
console.log(`   Data:     ${STUDIO_DIR}\n`)

const server = serve({ fetch: app.fetch, port: PORT })
setupTerminalWs(server as unknown as Parameters<typeof setupTerminalWs>[0], () => getActiveProjectDir())
