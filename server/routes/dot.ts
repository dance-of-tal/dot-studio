import { Hono } from 'hono'
import dotCore from './dot-core.js'
import dotPerformer from './dot-performer.js'
import dotAssets from './dot-assets.js'

const dot = new Hono()

dot.route('/', dotCore)
dot.route('/', dotPerformer)
dot.route('/', dotAssets)

export default dot
