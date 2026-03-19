import type { CompilePromptRequest } from '../../shared/chat-contracts.js'
import { compileProjectionPreview } from './opencode-projection/preview-service.js'

export async function compileStudioPromptPreview(
    workingDir: string,
    request: CompilePromptRequest,
) {
    return compileProjectionPreview(workingDir, request)
}
