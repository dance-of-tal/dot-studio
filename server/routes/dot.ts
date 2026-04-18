import { Hono } from 'hono'
import dotCore from './dot-core.js'
import dotPerformer from './dot-performer.js'
import dotAssets from './dot-assets.js'
import dotDanceExport from './dot-dance-export.js'
import dotDanceUpdates from './dot-dance-updates.js'

const dot = new Hono()

dot.route('/', dotCore)
dot.route('/', dotPerformer)
dot.route('/', dotAssets)
dot.route('/', dotDanceExport)
dot.route('/', dotDanceUpdates)

export default dot
