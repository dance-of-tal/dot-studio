import type { GitHubDanceSyncStatus } from './asset-contracts.js'

export type DotStatusResponse = {
    initialized: boolean
    stageInitialized: boolean
    globalInitialized: boolean
    dotDir: string
    globalDotDir: string
    projectDir: string
}

export type DotInitResponse = {
    ok: boolean
    dotDir: string
    scope: string
}

export type DotAuthUserResponse = {
    authenticated: boolean
    username: string | null
    error?: string
}

export type DotLoginResponse = {
    ok: boolean
    started: boolean
    alreadyRunning?: boolean
    alreadyAuthenticated?: boolean
    username?: string | null
    authUrl?: string
    browserOpened?: boolean
}

export type DotInstallRequest = {
    urn: string
    localName?: string
    force?: boolean
    scope?: 'global' | 'stage'
}

export type DotSaveLocalRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    slug: string
    stage?: string
    author?: string
    payload: unknown
}

export type DotPublishRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    slug: string
    stage?: string
    payload?: unknown
    tags?: string[]
    providedAssets?: Array<{
        kind: 'tal' | 'performer' | 'act'
        urn: string
        payload: Record<string, unknown>
        tags?: string[]
    }>
    acknowledgedTos?: boolean
}

export type DotUninstallRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    urn: string
}

export type DanceExportRequest = {
    draftId: string
    slug: string
    destinationParentPath: string
    overwrite?: boolean
}

export type DanceExportResponse = {
    ok: boolean
    draftId: string
    slug: string
    exportPath: string
    exportRelativeName: string
}

export type InstalledDanceLocator = {
    urn: string
    scope: 'global' | 'stage'
}

export type DotDanceUpdateCheckRequest = {
    assets: InstalledDanceLocator[]
    includeRepoDrift?: boolean
}

export type DotDanceUpdateCheckResponse = {
    results: Array<InstalledDanceLocator & {
        sync: GitHubDanceSyncStatus
    }>
}

export type DotDanceUpdateApplyRequest = {
    assets: InstalledDanceLocator[]
}

export type DotDanceUpdateApplyResponse = {
    updated: Array<InstalledDanceLocator & {
        sync: GitHubDanceSyncStatus
    }>
    skipped: Array<InstalledDanceLocator & {
        reason: string
        sync?: GitHubDanceSyncStatus
    }>
}

export type DotDanceReimportSourceRequest = InstalledDanceLocator

export type DotDanceReimportSourceResponse = {
    sourceUrl: string
    installed: Array<{ urn: string; name: string; description: string }>
    skippedExistingUrns: string[]
}
