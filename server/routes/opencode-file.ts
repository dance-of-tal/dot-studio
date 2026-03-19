import { Hono } from 'hono'
import { jsonOpencodeError } from '../lib/opencode-errors.js'
import {
    findFilesInProject,
    findSymbolsInProject,
    findTextInProject,
    getFileStatus,
    listFiles,
    readFile,
} from '../services/opencode-service.js'
import { jsonError, requestWorkingDir } from './route-errors.js'

const opencodeFile = new Hono()

opencodeFile.get('/api/file/list', async (c) => {
    const dirPath = c.req.query('path') || '.'
    try {
        return c.json(await listFiles(requestWorkingDir(c), dirPath))
    } catch {
        return c.json([])
    }
})

opencodeFile.get('/api/file/read', async (c) => {
    const filePath = c.req.query('path')
    if (!filePath) return jsonError(c, 'path required', 400)
    try {
        return c.json(await readFile(requestWorkingDir(c), filePath))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/file/status', async (c) => {
    try {
        return c.json(await getFileStatus(requestWorkingDir(c)))
    } catch {
        return c.json([])
    }
})

opencodeFile.get('/api/find/text', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return jsonError(c, 'pattern required', 400)
    try {
        return c.json(await findTextInProject(requestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/find/files', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return jsonError(c, 'pattern required', 400)
    try {
        return c.json(await findFilesInProject(requestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

opencodeFile.get('/api/find/symbols', async (c) => {
    const pattern = c.req.query('pattern')
    if (!pattern) return jsonError(c, 'pattern required', 400)
    try {
        return c.json(await findSymbolsInProject(requestWorkingDir(c), pattern))
    } catch (err) {
        return jsonOpencodeError(c, err)
    }
})

export default opencodeFile
