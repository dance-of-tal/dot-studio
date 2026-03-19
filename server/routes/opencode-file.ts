import { Hono } from 'hono'
import { resolveRequestWorkingDir } from '../lib/request-context.js'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    findFilesInProject,
    findSymbolsInProject,
    findTextInProject,
    getFileStatus,
    listFiles,
    readFile,
} from '../services/opencode-service.js'

const opencodeFile = new Hono()

opencodeFile.get('/api/file/list', async (c) => {
    const dirPath = c.req.query('path') || '.'
    try {
        return c.json(await listFiles(resolveRequestWorkingDir(c), dirPath))
    } catch {
        return c.json([])
    }
})

opencodeFile.get('/api/file/read', async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return c.json({ error: 'path required' }, 400)
    try {
        return c.json(await readFile(resolveRequestWorkingDir(c), filePath))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/file/status', async (c) => {
    try {
        return c.json(await getFileStatus(resolveRequestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

opencodeFile.get('/api/find/text', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        return c.json(await findTextInProject(resolveRequestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/find/files', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        return c.json(await findFilesInProject(resolveRequestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/find/symbols', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return c.json({ error: 'pattern required' }, 400)
    try {
        return c.json(await findSymbolsInProject(resolveRequestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencodeFile
