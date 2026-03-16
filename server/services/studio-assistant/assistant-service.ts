import { getOpencode } from '../../lib/opencode.js'
import { unwrapOpencodeResult } from '../../lib/opencode-errors.js'
import { registerSessionExecutionContext } from '../../lib/session-execution.js'
import { ensurePerformerProjection } from '../opencode-projection/stage-projection-service.js'
import { ASSISTANT_TAL_URN, ASSISTANT_TAL_CONTENT, ALL_ASSISTANT_DANCES } from './assistant-builtin-assets.js'
import { BUILTIN_ASSISTANT_TOOLS } from './assistant-tools.js'

export const ASSISTANT_PERFORMER_ID = 'studio-assistant'

export async function createAssistantSession(cwd: string) {
    const oc = await getOpencode()
    const session = unwrapOpencodeResult<{ id: string; title: string }>(await oc.session.create({
        directory: cwd,
        title: 'Studio Assistant',
    }))
    
    await registerSessionExecutionContext({
        sessionId: session.id,
        ownerKind: 'performer',
        ownerId: ASSISTANT_PERFORMER_ID,
        mode: 'direct',
        workingDir: cwd,
        executionDir: cwd,
    })
    
    return {
        sessionId: session.id,
    }
}

export async function sendAssistantMessage(
    workingDir: string,
    sessionId: string,
    message: string,
    canvasContext: any,
    model?: any,
    modelVariant?: string | null,
) {
    const drafts: Record<string, any> = {
        [ASSISTANT_TAL_URN]: {
            id: ASSISTANT_TAL_URN,
            kind: 'tal',
            name: 'Studio Assistant Tal',
            content: ASSISTANT_TAL_CONTENT
        },
    }

    // Register all built-in Dance guides as drafts
    for (const dance of ALL_ASSISTANT_DANCES) {
        drafts[dance.urn] = {
            id: dance.urn,
            kind: 'dance',
            name: dance.name,
            content: dance.content,
        }
    }

    const defaultModel = model || 'claude-3-5-sonnet'

    const projection = await ensurePerformerProjection({
        performerId: ASSISTANT_PERFORMER_ID,
        performerName: 'Studio Assistant',
        talRef: { kind: 'draft', draftId: ASSISTANT_TAL_URN },
        danceRefs: ALL_ASSISTANT_DANCES.map(d => ({ kind: 'draft' as const, draftId: d.urn })),
        drafts,
        model: defaultModel,
        modelVariant: modelVariant || null,
        mcpServerNames: [],
        executionDir: workingDir,
        workingDir,
        extraTools: BUILTIN_ASSISTANT_TOOLS
    })

    const oc = await getOpencode()
    
    const promptMessage = `[Canvas Context]
\`\`\`json
${JSON.stringify(canvasContext, null, 2)}
\`\`\`

[User Message]
${message}`

    unwrapOpencodeResult(await oc.session.promptAsync({
        sessionID: sessionId,
        directory: workingDir,
        agent: projection.compiled.agentNames.build,
        parts: [{ type: 'text', text: promptMessage }],
    }))
    
    return { sessionId, ok: true }
}
