import { Hono } from 'hono'
import assetsCollection from './assets-collection.js'
import assetsDetail from './assets-detail.js'

const assets = new Hono()

assets.route('/', assetsCollection)
assets.route('/', assetsDetail)

export default assets
