export type RunActRequest = {
    actSessionId?: string
    actUrn?: string
    stageAct?: unknown
    performers?: unknown[]
    drafts?: Record<string, unknown>
    input: string
    maxIterations?: number
    resumeSummary?: unknown
}
