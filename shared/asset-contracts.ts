export type AssetSource = 'global' | 'stage' | 'registry' | 'draft'

export type AssetListItem = {
    kind: string
    urn: string
    slug: string
    name: string
    author: string
    source: AssetSource
    description: string
    tags?: string[]
    talUrn?: string | null
    danceUrns?: string[]
    actUrn?: string | null
    model?: string | null
    mcpConfig?: Record<string, unknown> | null
    entryNode?: string | null
    nodeCount?: number
    nodes?: Record<string, unknown>
    edges?: Array<Record<string, unknown>>
    maxIterations?: number
    content?: string
    stars?: number
    tier?: string
    updatedAt?: string
}
