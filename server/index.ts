// DOT Studio — Hono API Server (Entry Point)

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setupTerminalWs } from './terminal.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

// Route Modules
import healthRoutes from './routes/health.js'
import assetRoutes from './routes/assets.js'
import stageRoutes from './routes/stages.js'
import chatRoutes from './routes/chat.js'
import opencodeRoutes from './routes/opencode.js'
import compileRoutes from './routes/compile.js'
import dotRoutes from './routes/dot.js'
import adapterRoutes from './routes/adapter.js'
import safeRoutes from './routes/safe.js'
import assistantRoutes from './routes/assistant.js'
import delegateRoutes from './routes/delegate.js'

// Config
import { PORT, OPENCODE_URL, STUDIO_DIR, IS_PRODUCTION, getActiveProjectDir } from './lib/config.js'
import { ensureOpencodeSidecar, isManagedOpencode } from './lib/opencode-sidecar.js'

const app = new Hono()

function resolveClientDir() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
        path.resolve(__dirname, '..', '..', 'client'),
        path.resolve(__dirname, '..', 'client'),
    ]

    return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || candidates[0]
}

if (IS_PRODUCTION) {
    // Production: Hono serves built frontend from client/ directory
    const clientDir = resolveClientDir()

    // API routes first, then static files
    app.route('/', healthRoutes)
    app.route('/', assetRoutes)
    app.route('/', stageRoutes)
    app.route('/', chatRoutes)
    app.route('/', opencodeRoutes)
    app.route('/', compileRoutes)
    app.route('/', dotRoutes)
    app.route('/', adapterRoutes)
    app.route('/', safeRoutes)
    app.route('/', assistantRoutes)
    app.route('/', delegateRoutes)

    // Serve static assets
    app.use('/assets/*', serveStatic({ root: clientDir }))

    // SPA fallback: serve index.html for all non-API, non-asset routes
    app.get('*', async (c) => {
        const indexPath = path.join(clientDir, 'index.html')
        if (fs.existsSync(indexPath)) {
            const html = fs.readFileSync(indexPath, 'utf-8')
            return c.html(html)
        }
        return c.text('Not found', 404)
    })
} else {
    // Dev: allow localhost Vite ports so API calls keep working when Vite auto-increments.
    app.use('*', cors({
        origin: (origin) => (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
                ? origin
                : null
        ),
    }))

    // ── Mount Route Modules ─────────────────────────────────
    app.route('/', healthRoutes)
    app.route('/', assetRoutes)
    app.route('/', stageRoutes)
    app.route('/', chatRoutes)
    app.route('/', opencodeRoutes)
    app.route('/', compileRoutes)
    app.route('/', dotRoutes)
    app.route('/', adapterRoutes)
    app.route('/', safeRoutes)
    app.route('/', assistantRoutes)
    app.route('/', delegateRoutes)
}

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
setupTerminalWs(server as any, () => getActiveProjectDir())
