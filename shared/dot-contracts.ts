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
    author?: string
    payload: unknown
}

export type DotPublishRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    slug: string
    payload?: unknown
    tags?: string[]
    acknowledgedTos?: boolean
}

export type DotUninstallRequest = {
    kind: 'tal' | 'dance' | 'performer' | 'act'
    urn: string
}
