import { getOpencode } from '../lib/opencode.js'
import { resolveSessionExecutionContext } from '../lib/session-execution.js'
import { sseEncode } from '../lib/sse.js'

const HEARTBEAT_INTERVAL_MS = 30_000
const EXECUTION_DIRECTORY_REFRESH_MS = 1_000

type StreamEvent = {
    type: string
    properties?: Record<string, unknown>
}

async function listEventDirectories(workingDir: string) {
    return [workingDir]
}

export async function buildStudioChatEventStream(workingDir: string, abortSignal?: AbortSignal) {
    const oc = await getOpencode()

    return new ReadableStream({
        async start(controller) {
            let active = true
            const subscribedDirectories = new Set<string>()
            const connectingDirectories = new Set<string>()
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null
            let refreshTimer: ReturnType<typeof setInterval> | null = null

            const close = () => {
                if (!active) {
                    return
                }
                active = false
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer)
                    heartbeatTimer = null
                }
                if (refreshTimer) {
                    clearInterval(refreshTimer)
                    refreshTimer = null
                }
                subscribedDirectories.clear()
                connectingDirectories.clear()
                abortSignal?.removeEventListener('abort', close)
                try {
                    controller.close()
                } catch {
                    // Stream may already be closed.
                }
            }

            const enqueueEvent = (event: unknown) => {
                if (!active) {
                    return
                }
                try {
                    controller.enqueue(sseEncode(JSON.stringify(event)))
                } catch {
                    close()
                }
            }

            const subscribeDirectory = async (directory: string) => {
                if (!active || subscribedDirectories.has(directory) || connectingDirectories.has(directory)) {
                    return
                }

                connectingDirectories.add(directory)
                try {
                    const subscription = abortSignal
                        ? await oc.event.subscribe({ directory }, { signal: abortSignal })
                        : await oc.event.subscribe({ directory })

                    if (!active) {
                        return
                    }

                    connectingDirectories.delete(directory)
                    subscribedDirectories.add(directory)

                    void (async () => {
                        try {
                            for await (const event of subscription.stream as AsyncIterable<StreamEvent>) {
                                if (!active) {
                                    return
                                }

                                if (event.type === 'permission.asked') {
                                    const sessionID = typeof event.properties?.sessionID === 'string'
                                        ? event.properties.sessionID
                                        : null
                                    const permissionID = typeof event.properties?.id === 'string'
                                        ? event.properties.id
                                        : null
                                    if (sessionID && permissionID) {
                                        const context = await resolveSessionExecutionContext(sessionID)
                                        if (context?.ownerKind === 'act') {
                                            try {
                                                await oc.permission.respond({
                                                    sessionID,
                                                    permissionID,
                                                    response: 'always',
                                                    directory: context.workingDir,
                                                })
                                            } catch (error) {
                                                console.error('Failed to auto-accept permission for Act session:', error)
                                            }
                                            continue
                                        }
                                    }
                                }

                                if (event.type?.startsWith('message.') || event.type?.startsWith('session.') || event.type === 'permission.asked' || event.type === 'permission.replied' || event.type === 'question.asked' || event.type === 'question.replied' || event.type === 'question.rejected' || event.type === 'todo.updated') {
                                    const rawProps = event.properties as {
                                        sessionID?: string
                                        info?: { sessionID?: string }
                                        part?: { sessionID?: string }
                                    } | undefined
                                    const sessionID = rawProps?.sessionID || rawProps?.info?.sessionID || rawProps?.part?.sessionID
                                    if (sessionID) {
                                        const context = await resolveSessionExecutionContext(sessionID)
                                        if (context) {
                                            enqueueEvent({
                                                ...event,
                                                properties: {
                                                    ...(event.properties || {}),
                                                    ownerId: context.ownerId,
                                                    ownerKind: context.ownerKind,
                                                },
                                            })
                                            continue
                                        }
                                    }
                                }

                                enqueueEvent(event)
                            }
                        } catch {
                            // Ignore broken subscription and keep stream alive.
                        } finally {
                            subscribedDirectories.delete(directory)
                            connectingDirectories.delete(directory)
                            if (active) {
                                void subscribeDirectory(directory)
                            }
                        }
                    })()
                } catch {
                    connectingDirectories.delete(directory)
                }
            }

            const refreshSubscriptions = async () => {
                if (!active) {
                    return
                }
                const directories = await listEventDirectories(workingDir)
                await Promise.all(directories.map((directory) => subscribeDirectory(directory)))
            }

            abortSignal?.addEventListener('abort', close, { once: true })

            heartbeatTimer = setInterval(() => {
                enqueueEvent({ type: 'server.heartbeat' })
            }, HEARTBEAT_INTERVAL_MS)

            refreshTimer = setInterval(() => {
                void refreshSubscriptions()
            }, EXECUTION_DIRECTORY_REFRESH_MS)

            await refreshSubscriptions()
        },
    })
}
