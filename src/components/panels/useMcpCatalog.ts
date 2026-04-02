import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { queryKeys, useMcpServers } from '../../hooks/queries'
import { showToast } from '../../lib/toast'
import {
    extractMcpCatalog,
    mergeMcpToolOverrides,
} from '../../../shared/mcp-catalog'
import type { McpEntryDraft } from './mcp-catalog-utils'
import { buildMcpDrafts, getMcpEntryValidationError, serializeMcpEntries } from './mcp-catalog-utils'
import { useStudioStore } from '../../store'

/**
 * useMcpCatalog – Studio-wide MCP library state for Asset Library.
 *
 * Manages global MCP drafts, persistence, connection tests,
 * authentication lifecycle, and cache invalidation.
 */

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export interface McpCatalogState {
    mcpDraftEntries: McpEntryDraft[]
    mcpCatalogLoaded: boolean
    mcpCatalogDirty: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    mcpServers: ReturnType<typeof useMcpServers>['data']
    updateMcpEntry: (key: string, updater: (entry: McpEntryDraft) => McpEntryDraft) => void
    addMcpEntry: () => string
    removeMcpEntry: (key: string) => void
    saveMcpCatalog: () => Promise<boolean>
    connectMcpServer: (name: string) => Promise<void>
    authenticateMcpServer: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
}

export function useMcpCatalog(workingDir: string, showMcps: boolean): McpCatalogState {
    const [mcpDraftEntries, setMcpDraftEntries] = useState<McpEntryDraft[]>([])
    const [mcpDraftSnapshot, setMcpDraftSnapshot] = useState<McpEntryDraft[]>([])
    const [mcpCatalogLoaded, setMcpCatalogLoaded] = useState(false)
    const [mcpCatalogStatus, setMcpCatalogStatus] = useState<string | null>(null)
    const [mcpCatalogSaving, setMcpCatalogSaving] = useState(false)
    const [pendingMcpAuthName, setPendingMcpAuthName] = useState<string | null>(null)
    const mcpAuthDeadlineRef = useRef<number | null>(null)
    const queryClient = useQueryClient()
    const recordStudioChange = useStudioStore((state) => state.recordStudioChange)

    const { data: mcpServers = [] } = useMcpServers(showMcps)

    // ── Load catalog when MCP tab is shown ──────────────
    useEffect(() => {
        if (!showMcps) {
            return
        }
        setMcpCatalogLoaded(false)
        api.config.getGlobal()
            .then((result) => {
                const drafts = buildMcpDrafts(extractMcpCatalog(result))
                setMcpDraftEntries(drafts)
                setMcpDraftSnapshot(drafts)
                setMcpCatalogStatus(null)
                setMcpCatalogLoaded(true)
            })
            .catch((error) => {
                console.error('Failed to load MCP catalog', error)
                setMcpCatalogStatus('Failed to load Studio MCP library.')
                setMcpCatalogLoaded(true)
            })
    }, [showMcps, workingDir])

    // ── Auth polling effect ─────────────────────────────
    useEffect(() => {
        if (!pendingMcpAuthName) {
            mcpAuthDeadlineRef.current = null
            return
        }

        const live = mcpServers.find((server) => server.name === pendingMcpAuthName)
        if (live?.status === 'connected') {
            mcpAuthDeadlineRef.current = null
            setPendingMcpAuthName(null)
            setMcpCatalogStatus(`Authenticated and connected ${pendingMcpAuthName}.`)
            recordStudioChange({ kind: 'runtime_config' })
            return
        }

        if (live?.status === 'failed' || live?.status === 'needs_client_registration') {
            mcpAuthDeadlineRef.current = null
            setPendingMcpAuthName(null)
            setMcpCatalogStatus(live.error || `Authentication did not complete for ${pendingMcpAuthName}.`)
            return
        }

        const timer = window.setInterval(() => {
            if (mcpAuthDeadlineRef.current && Date.now() > mcpAuthDeadlineRef.current) {
                window.clearInterval(timer)
                mcpAuthDeadlineRef.current = null
                setPendingMcpAuthName(null)
                setMcpCatalogStatus(`Timed out waiting for ${pendingMcpAuthName} authentication.`)
                return
            }
            void queryClient.invalidateQueries({ queryKey: [...queryKeys.mcpServers, workingDir] })
        }, 2_000)

        return () => window.clearInterval(timer)
    }, [mcpServers, pendingMcpAuthName, queryClient, workingDir])

    const mcpCatalogDirty = useMemo(
        () => JSON.stringify(mcpDraftEntries) !== JSON.stringify(mcpDraftSnapshot),
        [mcpDraftEntries, mcpDraftSnapshot],
    )

    // ── Entry CRUD ──────────────────────────────────────

    const updateMcpEntry = (key: string, updater: (entry: McpEntryDraft) => McpEntryDraft) => {
        setMcpDraftEntries((current) => current.map((entry) => entry.key === key ? updater(entry) : entry))
    }

    const addMcpEntry = () => {
        const key = makeId('asset-mcp')
        setMcpDraftEntries((current) => [
            ...current,
            {
                key,
                name: '',
                transport: 'stdio' as const,
                timeoutText: '',
                command: '',
                args: [],
                env: [],
                url: '',
                headers: [],
                oauthEnabled: true,
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScope: '',
            },
        ])
        return key
    }

    const removeMcpEntry = (key: string) => {
        setMcpDraftEntries((current) => current.filter((entry) => entry.key !== key))
    }

    // ── Catalog persistence ─────────────────────────────

    const invalidateMcpQueries = async (includeRuntimeTools = false) => {
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.mcpServers, workingDir] })
        if (includeRuntimeTools) {
            await queryClient.invalidateQueries({ queryKey: ['runtime-tools', workingDir] })
        }
    }

    const runMcpCatalogAction = async (
        request: () => Promise<unknown>,
        options: {
            successMessage: string
            failureMessage: string
            includeRuntimeTools?: boolean
            onSuccess?: () => void
        },
    ) => {
        setMcpCatalogStatus(null)
        try {
            await request()
            options.onSuccess?.()
            setMcpCatalogStatus(options.successMessage)
            await invalidateMcpQueries(!!options.includeRuntimeTools)
        } catch (error: unknown) {
            setMcpCatalogStatus(error instanceof Error ? error.message : options.failureMessage)
        }
    }

    const saveMcpCatalog = async () => {
        setMcpCatalogSaving(true)
        setMcpCatalogStatus(null)
        try {
            const validationError = getMcpEntryValidationError(mcpDraftEntries)
            if (validationError) {
                throw new Error(validationError)
            }

            const nextMcpCatalog = serializeMcpEntries(mcpDraftEntries)
            const globalConfig = await api.config.getGlobal().catch(() => ({} as Record<string, unknown>))
            const currentConfig = globalConfig && typeof globalConfig === 'object'
                ? globalConfig
                : {}
            const nextTools = mergeMcpToolOverrides(
                currentConfig.tools && typeof currentConfig.tools === 'object'
                    ? currentConfig.tools as Record<string, unknown>
                    : {},
                extractMcpCatalog(currentConfig),
                nextMcpCatalog,
            )

            await api.config.updateGlobal({
                mcp: nextMcpCatalog,
                tools: nextTools,
            })
            setMcpDraftSnapshot(mcpDraftEntries)
            setMcpCatalogStatus('Saved Studio MCP library. Performers enable servers individually.')
            recordStudioChange({ kind: 'runtime_config' })
            await queryClient.invalidateQueries({ queryKey: [...queryKeys.mcpServers, workingDir] })
            return true
        } catch (error: unknown) {
            setMcpCatalogStatus(error instanceof Error ? error.message : 'Failed to save Studio MCP library.')
            return false
        } finally {
            setMcpCatalogSaving(false)
        }
    }

    // ── Server operations ───────────────────────────────

    const connectMcpServer = async (name: string) => runMcpCatalogAction(
        () => api.mcp.connect(name),
        {
            successMessage: `Connection test passed for ${name}.`,
            failureMessage: `Connection test failed for ${name}.`,
            includeRuntimeTools: true,
        },
    )

    const authenticateMcpServer = async (name: string) => {
        const popup = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
        setMcpCatalogStatus(null)

        try {
            const result = await api.mcp.authStart(name)
            let opened = false
            try {
                if (popup && !popup.closed) {
                    popup.location.href = result.authorizationUrl
                    opened = true
                } else {
                    const next = window.open(result.authorizationUrl, '_blank')
                    opened = !!next
                }
            } catch {
                opened = false
            }

            if (!opened) {
                popup?.close()
                showToast(`Open the browser to finish authenticating ${name}.`, 'warning', {
                    title: 'MCP auth started',
                    actionLabel: 'Open auth',
                    onAction: () => {
                        window.open(result.authorizationUrl, '_blank')
                    },
                    dedupeKey: `mcp-auth:${name}`,
                    durationMs: 8000,
                })
            }

            mcpAuthDeadlineRef.current = Date.now() + 180_000
            setPendingMcpAuthName(name)
            setMcpCatalogStatus(`Complete authentication for ${name} in the browser.`)
            await queryClient.invalidateQueries({ queryKey: [...queryKeys.mcpServers, workingDir] })
        } catch (error: unknown) {
            popup?.close()
            setPendingMcpAuthName(null)
            setMcpCatalogStatus(error instanceof Error ? error.message : `Failed to start authentication for ${name}.`)
        }
    }

    const clearMcpAuth = async (name: string) => {
        await runMcpCatalogAction(
            () => api.mcp.clearAuth(name),
            {
                successMessage: `Cleared stored authentication for ${name}.`,
                failureMessage: `Failed to clear authentication for ${name}.`,
                onSuccess: () => {
                    recordStudioChange({ kind: 'runtime_config' })
                    if (pendingMcpAuthName === name) {
                        setPendingMcpAuthName(null)
                        mcpAuthDeadlineRef.current = null
                    }
                },
            },
        )
    }

    return {
        mcpDraftEntries,
        mcpCatalogLoaded,
        mcpCatalogDirty,
        mcpCatalogStatus,
        mcpCatalogSaving,
        pendingMcpAuthName,
        mcpServers,
        updateMcpEntry,
        addMcpEntry,
        removeMcpEntry,
        saveMcpCatalog,
        connectMcpServer,
        authenticateMcpServer,
        clearMcpAuth,
    }
}
