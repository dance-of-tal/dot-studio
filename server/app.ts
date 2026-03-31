import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

import healthRoutes from './routes/health.js'
import assetRoutes from './routes/assets.js'
import stageRoutes from './routes/workspaces.js'
import chatRoutes from './routes/chat.js'
import opencodeRoutes from './routes/opencode.js'
import compileRoutes from './routes/compile.js'
import dotRoutes from './routes/dot.js'
import adapterRoutes from './routes/adapter.js'
import draftRoutes from './routes/drafts.js'
import actRuntimeRoutes from './routes/act-runtime.js'
import { IS_PRODUCTION } from './lib/config.js'

function resolveClientDir() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const candidates = [
        path.resolve(__dirname, '..', '..', 'client'),
        path.resolve(__dirname, '..', 'client'),
    ]

    return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) || candidates[0]
}

function mountApiRoutes(app: Hono) {
    app.route('/', healthRoutes)
    app.route('/', assetRoutes)
    app.route('/', stageRoutes)
    app.route('/', chatRoutes)
    app.route('/', opencodeRoutes)
    app.route('/', compileRoutes)
    app.route('/', dotRoutes)
    app.route('/', adapterRoutes)
    app.route('/', draftRoutes)
    app.route('/', actRuntimeRoutes)
}

function applyDevCors(app: Hono) {
    app.use('*', cors({
        origin: (origin) => (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
                ? origin
                : null
        ),
    }))
}

function mountProductionClient(app: Hono) {
    const clientDir = resolveClientDir()

    app.use('/assets/*', serveStatic({ root: clientDir }))

    app.get('*', async (c) => {
        const indexPath = path.join(clientDir, 'index.html')
        if (fs.existsSync(indexPath)) {
            const html = fs.readFileSync(indexPath, 'utf-8')
            return c.html(html)
        }
        return c.text('Not found', 404)
    })
}

export function createServerApp() {
    const app = new Hono()

    // HTTP request logger — prints method, path, status, duration
    app.use('*', logger())

    if (!IS_PRODUCTION) {
        applyDevCors(app)
    }

    mountApiRoutes(app)

    if (IS_PRODUCTION) {
        mountProductionClient(app)
    }

    return app
}
