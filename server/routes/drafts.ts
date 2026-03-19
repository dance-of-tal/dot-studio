import { Hono } from 'hono'
import draftsCollection from './drafts-collection.js'
import draftsItem from './drafts-item.js'

const drafts = new Hono()

drafts.route('/', draftsCollection)
drafts.route('/', draftsItem)

export default drafts
