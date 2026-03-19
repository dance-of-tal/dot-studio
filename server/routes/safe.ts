import { Hono } from 'hono'
import safeSummary from './safe-summary.js'
import safeActions from './safe-actions.js'

const safe = new Hono()

safe.route('/', safeSummary)
safe.route('/', safeActions)

export default safe
