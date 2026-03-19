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
    schema?: string
    participantCount?: number
    relationCount?: number
    participants?: Array<Record<string, unknown>>
    relations?: Array<Record<string, unknown>>
    content?: string
    stars?: number
    tier?: string
    updatedAt?: string
}
