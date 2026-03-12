// OpenCode SDK Client Singleton

import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import { OPENCODE_URL } from './config.js'
import { ensureOpencodeSidecar } from './opencode-sidecar.js'

let opencode: ReturnType<typeof createOpencodeClient> | null = null

export async function getOpencode() {
    await ensureOpencodeSidecar()
    if (!opencode) {
        opencode = createOpencodeClient({ baseUrl: OPENCODE_URL })
    }
    return opencode
}

