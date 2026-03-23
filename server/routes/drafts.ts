import { Hono } from 'hono'
import draftsCollection from './drafts-collection.js'
import draftsItem from './drafts-item.js'
import draftsDanceBundle from './drafts-dance-bundle.js'

const drafts = new Hono()

drafts.route('/', draftsCollection)
drafts.route('/', draftsDanceBundle)
drafts.route('/', draftsItem)

export default drafts
