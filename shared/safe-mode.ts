export type ExecutionMode = 'direct' | 'safe'

export type SafeOwnerKind = 'performer' | 'act'

export type SafeOwnerFileStatus = 'added' | 'modified' | 'deleted'

export type SafeOwnerFile = {
    path: string
    status: SafeOwnerFileStatus
    conflict: boolean
    diff: string
}

export type SafeOwnerSummary = {
    ownerKind: SafeOwnerKind
    ownerId: string
    mode: ExecutionMode
    pendingCount: number
    conflictCount: number
    files: SafeOwnerFile[]
    canUndoLastApply: boolean
}

export type SafeOwnerFileRequest = {
    filePath: string
}
