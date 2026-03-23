/**
 * board-persistence.ts — Board file persistence
 *
 * PRD §6.2: Board is durable — persisted to file and survives shutdown.
 * Path: ~/.dot-studio/act-runtime/<actId>/<threadId>/board.json
 */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import type { BoardEntry } from '../../../shared/act-types.js'
import { STUDIO_DIR } from '../../lib/config.js'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error
}

function boardFilePath(actId: string, threadId: string): string {
    return join(STUDIO_DIR, 'act-runtime', actId, threadId, 'board.json')
}

/**
 * Save board entries to file.
 */
export async function saveBoardToFile(
    _workingDir: string,
    actId: string,
    threadId: string,
    entries: BoardEntry[],
): Promise<void> {
    const filePath = boardFilePath(actId, threadId)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8')
}

/**
 * Load board entries from file.
 */
export async function loadBoardFromFile(
    _workingDir: string,
    actId: string,
    threadId: string,
): Promise<BoardEntry[]> {
    const filePath = boardFilePath(actId, threadId)
    try {
        const content = await fs.readFile(filePath, 'utf-8')
        return JSON.parse(content) as BoardEntry[]
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') return []
        throw error
    }
}
