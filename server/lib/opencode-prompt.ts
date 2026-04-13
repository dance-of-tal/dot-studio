import { isOpencodeAgentNotFoundError } from './opencode-errors.js'

type PromptRetryClient = {
    instance?: {
        dispose: (args: { directory: string }) => Promise<unknown>
    }
}

type PromptRetryOptions<T> = {
    oc: PromptRetryClient
    directory: string
    agentName?: string | null
    getRunningSessions?: (directory: string) => Promise<number>
    logLabel: string
    run: () => Promise<T>
}

export async function retryOnAgentRegistryMiss<T>({
    oc,
    directory,
    agentName,
    getRunningSessions,
    logLabel,
    run,
}: PromptRetryOptions<T>): Promise<T> {
    try {
        return await run()
    } catch (error) {
        if (!agentName || !isOpencodeAgentNotFoundError(error, agentName)) {
            throw error
        }

        const runningSessions = getRunningSessions
            ? await getRunningSessions(directory)
            : 0
        if (runningSessions > 0) {
            console.warn(
                `[${logLabel}] OpenCode agent "${agentName}" was missing from the runtime registry, but ${runningSessions} session(s) are still running in "${directory}". Skipping dispose-and-retry to avoid interrupting them.`,
            )
            throw error
        }

        console.warn(
            `[${logLabel}] OpenCode agent "${agentName}" was missing from the runtime registry; disposing the working-dir runtime and retrying once.`,
        )
        await oc.instance?.dispose({ directory }).catch(() => {})
        return run()
    }
}
