import { getOpencode } from '../lib/opencode.js'
import {
    listSessionExecutionContextsForWorkingDir,
    resolveSessionExecutionContext,
} from '../lib/session-execution.js'
import { sseEncode } from '../lib/sse.js'

export async function buildStudioChatEventStream(workingDir: string, abortSignal?: AbortSignal) {
    const oc = await getOpencode()
    const extraPerformerDirs = await listSessionExecutionContextsForWorkingDir(workingDir, 'performer')
    const extraActDirs = await listSessionExecutionContextsForWorkingDir(workingDir, 'act')
    const directories = Array.from(new Set([
        workingDir,
        ...extraPerformerDirs.map((context) => context.executionDir),
        ...extraActDirs.map((context) => context.executionDir),
    ]))
    const subscriptions = await Promise.all(
        directories.map((directory) => oc.event.subscribe({ directory })),
    )

    return new ReadableStream({
        async start(controller) {
            let active = true
            let completed = 0

            const close = () => {
                if (!active) {
                    return
                }
                active = false
                try {
                    controller.close()
                } catch {
                    // Stream may already be closed.
                }
            }

            abortSignal?.addEventListener('abort', close, { once: true })

            for (const events of subscriptions) {
                void (async () => {
                    try {
                        for await (const event of events.stream) {
                            if (!active) {
                                return
                            }

                            if (event.type === 'permission.asked') {
                                const context = await resolveSessionExecutionContext(event.properties.sessionID)
                                if (context?.ownerKind === 'act') {
                                    try {
                                        await oc.permission.respond({
                                            sessionID: event.properties.sessionID,
                                            permissionID: event.properties.id,
                                            response: 'always',
                                        })
                                    } catch (error) {
                                        console.error('Failed to auto-accept permission for Act session:', error)
                                    }
                                    continue
                                }
                            }

                            controller.enqueue(sseEncode(JSON.stringify(event)))
                        }
                    } catch {
                        // Ignore broken subscriptions and keep the stream alive for the rest.
                    } finally {
                        completed += 1
                        if (completed === subscriptions.length) {
                            close()
                        }
                    }
                })()
            }
        },
    })
}
