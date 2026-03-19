import { Hono } from 'hono'
import opencodeCore from './opencode-core.js'
import opencodeProvider from './opencode-provider.js'
import opencodeMcp from './opencode-mcp.js'
import opencodeFile from './opencode-file.js'

const opencode = new Hono()

opencode.route('/', opencodeCore)
opencode.route('/', opencodeProvider)
opencode.route('/', opencodeMcp)
opencode.route('/', opencodeFile)

export default opencode
