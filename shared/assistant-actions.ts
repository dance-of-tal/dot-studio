export type AssistantActionDirection = 'both' | 'one-way'

// ── Blueprint sub-types ──────────────────────────────────────────────────────

export interface AssistantDraftBlueprint {
    ref?: string
    name: string
    content: string
    slug?: string
    description?: string
    tags?: string[]
    openEditor?: boolean
}

export interface AssistantModelBlueprint {
    provider: string
    modelId: string
}

// Fields shared by createPerformer (inline) and updatePerformer (patch)
export interface AssistantPerformerFields {
    model?: AssistantModelBlueprint | null
    // Tal — specify at most one
    talUrn?: string | null          // registry URN  (null = clear Tal)
    talDraftId?: string             // existing draft id
    talDraftRef?: string            // ref created in same block
    talDraft?: AssistantDraftBlueprint  // create + attach inline
    // Dances to add
    addDanceUrns?: string[]
    addDanceDraftIds?: string[]
    addDanceDraftRefs?: string[]
    addDanceDrafts?: AssistantDraftBlueprint[]
    // Dances to remove  (update only)
    removeDanceUrns?: string[]
    removeDanceDraftIds?: string[]
    // MCP
    addMcpServerNames?: string[]
    removeMcpServerNames?: string[]
}

export interface AssistantActRelationBlueprint {
    sourceParticipantKey?: string
    sourcePerformerId?: string
    sourcePerformerRef?: string
    sourcePerformerName?: string
    targetParticipantKey?: string
    targetPerformerId?: string
    targetPerformerRef?: string
    targetPerformerName?: string
    direction?: AssistantActionDirection
    name?: string
    description?: string
}

// ── Stage context ────────────────────────────────────────────────────────────

export interface AssistantDraftSummary {
    id: string
    kind: 'tal' | 'dance'
    name: string
    slug?: string
    description?: string
}

export interface AssistantAvailableModelSummary {
    provider: string
    providerName: string
    modelId: string
    name: string
}

export interface AssistantStagePerformerSummary {
    id: string
    name: string
    model: { provider: string; modelId: string } | null
    talUrn: string | null
    danceUrns: string[]
}

export interface AssistantStageActParticipantSummary {
    key: string
    performerName: string
    performerId: string | null
}

export interface AssistantStageActRelationSummary {
    id: string
    name: string
    description?: string
    between: [string, string]
    direction: AssistantActionDirection
}

export interface AssistantStageActSummary {
    id: string
    name: string
    participants: AssistantStageActParticipantSummary[]
    relations: AssistantStageActRelationSummary[]
}

export interface AssistantStageContext {
    workingDir: string
    performers: AssistantStagePerformerSummary[]
    acts: AssistantStageActSummary[]
    drafts: AssistantDraftSummary[]
    availableModels: AssistantAvailableModelSummary[]
}

// ── Action types ─────────────────────────────────────────────────────────────

export type AssistantAction =
    // ── Tal draft CRUD ─────────────────────────────────
    | {
        type: 'createTalDraft'
        ref?: string
        name: string
        content: string
        slug?: string
        description?: string
        tags?: string[]
        openEditor?: boolean
    }
    | {
        type: 'updateTalDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
        name?: string
        content?: string
        description?: string
        tags?: string[]
    }
    | {
        type: 'deleteTalDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
    }
    // ── Dance draft CRUD ───────────────────────────────
    | {
        type: 'createDanceDraft'
        ref?: string
        name: string
        content: string
        slug?: string
        description?: string
        tags?: string[]
        openEditor?: boolean
    }
    | {
        type: 'updateDanceDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
        name?: string
        content?: string
        description?: string
        tags?: string[]
    }
    | {
        type: 'deleteDanceDraft'
        draftId?: string
        draftRef?: string
        draftName?: string
    }
    // ── Performer CRUD ─────────────────────────────────
    | ({
        type: 'createPerformer'
        ref?: string
        name: string
    } & AssistantPerformerFields)
    | ({
        type: 'updatePerformer'
        performerId?: string
        performerRef?: string
        performerName?: string
        name?: string
    } & AssistantPerformerFields)
    | {
        type: 'deletePerformer'
        performerId?: string
        performerRef?: string
        performerName?: string
    }
    // ── Act CRUD ───────────────────────────────────────
    | {
        type: 'createAct'
        ref?: string
        name: string
        description?: string
        // Inline participants + relations
        participantPerformerIds?: string[]
        participantPerformerRefs?: string[]
        participantPerformerNames?: string[]
        relations?: AssistantActRelationBlueprint[]
    }
    | {
        type: 'updateAct'
        actId?: string
        actRef?: string
        actName?: string
        name?: string
        description?: string
    }
    | {
        type: 'deleteAct'
        actId?: string
        actRef?: string
        actName?: string
    }
    // ── Participant management ─────────────────────────
    | {
        type: 'attachPerformerToAct'
        actId?: string
        actRef?: string
        actName?: string
        performerId?: string
        performerRef?: string
        performerName?: string
    }
    | {
        type: 'detachParticipantFromAct'
        actId?: string
        actRef?: string
        actName?: string
        participantKey?: string
        performerId?: string
        performerRef?: string
        performerName?: string
    }
    // ── Relation management ────────────────────────────
    | {
        type: 'connectPerformers'
        actId?: string
        actRef?: string
        actName?: string
        sourceParticipantKey?: string
        sourcePerformerId?: string
        sourcePerformerRef?: string
        sourcePerformerName?: string
        targetParticipantKey?: string
        targetPerformerId?: string
        targetPerformerRef?: string
        targetPerformerName?: string
        direction?: AssistantActionDirection
        name?: string
        description?: string
    }
    | {
        type: 'updateRelation'
        actId?: string
        actRef?: string
        actName?: string
        relationId: string
        name?: string
        description?: string
        direction?: AssistantActionDirection
    }
    | {
        type: 'removeRelation'
        actId?: string
        actRef?: string
        actName?: string
        relationId: string
    }

export interface AssistantActionEnvelope {
    version: 1
    actions: AssistantAction[]
}
