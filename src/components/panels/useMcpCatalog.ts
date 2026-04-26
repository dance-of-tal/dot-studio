import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { queryKeys, useMcpServers } from '../../hooks/queries'
import { showToast } from '../../lib/toast'
import type { McpCatalog } from '../../../shared/mcp-catalog'
import type { McpCatalogImpact, McpEntryDraft } from './mcp-catalog-utils'
import {
    applyMcpCatalogImpactToPerformers,
    buildMcpCatalogImpact,
    buildMcpDrafts,
    cloneMcpDraftEntries,
    createMcpEntryDraft as createLocalMcpEntryDraft,
    getMcpEntryValidationError,
    hasMcpCatalogImpact,
    serializeMcpEntries,
} from './mcp-catalog-utils'
import { useStudioStore } from '../../store'

/**
 * useMcpCatalog – Studio-wide MCP library state for Asset Library.
 *
 * Manages saved Studio MCP entries, persistence, connection tests,
 * authentication lifecycle, and cache invalidation.
 */

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export interface McpCatalogState {
    mcpEntries: McpEntryDraft[]
    mcpCatalogLoaded: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    runtimeReloadPending: boolean
    pendingMcpAuthName: string | null
    mcpImpactDialog: McpCatalogImpact | null
    mcpImpactSaving: boolean
    mcpServers: ReturnType<typeof useMcpServers>['data']
    createMcpEntryDraft: () => McpEntryDraft
    saveMcpEntry: (entry: McpEntryDraft) => Promise<boolean>
    deleteMcpEntry: (key: string) => Promise<boolean>
    connectMcpServer: (name: string) => Promise<void>
    startMcpAuthFlow: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
    confirmMcpImpactSave: () => Promise<void>
    cancelMcpImpactSave: () => void
}

export function useMcpCatalog(workingDir: string, showMcps: boolean): McpCatalogState {
    const [mcpEntries, setMcpEntries] = useState<McpEntryDraft[]>([])
    const [mcpCatalogLoaded, setMcpCatalogLoaded] = useState(false)
    const [mcpCatalogStatus, setMcpCatalogStatus] = useState<string | null>(null)
    const [mcpCatalogSaving, setMcpCatalogSaving] = useState(false)
    const [pendingMcpAuthName, setPendingMcpAuthName] = useState<string | null>(null)
    const [mcpImpactDialog, setMcpImpactDialog] = useState<McpCatalogImpact | null>(null)
    const [mcpImpactSaving, setMcpImpactSaving] = useState(false)
    const mcpAuthDeadlineRef = useRef<number | null>(null)
    const pendingSaveRef = useRef<{
        entries: McpEntryDraft[]
        impact: McpCatalogImpact
        resolve: (saved: boolean) => void
    } | null>(null)
    const queryClient = useQueryClient()
    const recordStudioChange = useStudioStore((state) => state.recordStudioChange)
    const performers = useStudioStore((state) => state.performers)
    const runtimeReloadPending = useStudioStore((state) => state.runtimeReloadPending)

    const { data: mcpServers = [] } = useMcpServers(showMcps)

    const clearPendingSave = useCallback((saved: boolean) => {
        pendingSaveRef.current?.resolve(saved)
        pendingSaveRef.current = null
        setMcpImpactDialog(null)
        setMcpImpactSaving(false)
    }, [])

    // ── Load catalog when MCP tab is shown ──────────────
    useEffect(() => {
        if (!showMcps) {
            return
        }
        setMcpCatalogLoaded(false)
        api.mcp.getCatalog()
            .then((result) => {
                const drafts = buildMcpDrafts(result)
                setMcpEntries(drafts)
                setMcpCatalogStatus(null)
                setMcpCatalogLoaded(true)
            })
            .catch((error) => {
                console.error('Failed to load MCP catalog', error)
                setMcpCatalogStatus('Failed to load Studio MCP library.')
                setMcpCatalogLoaded(true)
            })
    }, [showMcps, workingDir])

    useEffect(() => () => {
        clearPendingSave(false)
    }, [clearPendingSave])

    const invalidateMcpQueries = useCallback(async (includeRuntimeTools = false) => {
        const queryKey = [...queryKeys.mcpServers, workingDir] as const
        const refreshed = await api.mcp.list({ refresh: true }).catch(() => null)
        if (refreshed) {
            queryClient.setQueryData(queryKey, refreshed)
        }
        await queryClient.invalidateQueries({ queryKey })
        if (includeRuntimeTools) {
            await queryClient.invalidateQueries({ queryKey: ['runtime-tools', workingDir] })
        }
    }, [queryClient, workingDir])

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
            void invalidateMcpQueries(true)
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
            void api.mcp.list({ refresh: true })
                .then((refreshed) => {
                    queryClient.setQueryData([...queryKeys.mcpServers, workingDir], refreshed)
                })
                .catch(() => {
                    void queryClient.invalidateQueries({ queryKey: [...queryKeys.mcpServers, workingDir] })
                })
        }, 2_000)

        return () => window.clearInterval(timer)
    }, [invalidateMcpQueries, mcpServers, pendingMcpAuthName, queryClient, recordStudioChange, workingDir])

    // ── Catalog persistence ─────────────────────────────

    const applyCatalogImpactToStudio = (impact: McpCatalogImpact) => {
        if (!hasMcpCatalogImpact(impact)) {
            return
        }

        let changed = false
        useStudioStore.setState((state) => {
            const nextPerformers = applyMcpCatalogImpactToPerformers(state.performers, impact)
            if (nextPerformers === state.performers) {
                return {}
            }
            changed = true
            return {
                performers: nextPerformers,
                workspaceDirty: true,
            }
        })
        if (changed) {
            recordStudioChange({
                kind: 'performer',
                performerIds: impact.affectedPerformerIds,
            })
        }
    }

    const persistMcpCatalog = async (
        entries: McpEntryDraft[],
        impact?: McpCatalogImpact | null,
    ) => {
        setMcpCatalogSaving(true)
        setMcpCatalogStatus(null)
        try {
            const nextMcpCatalog: McpCatalog = serializeMcpEntries(entries)
            await api.mcp.updateCatalog(nextMcpCatalog)
            setMcpEntries(cloneMcpDraftEntries(entries))
            if (impact && hasMcpCatalogImpact(impact)) {
                applyCatalogImpactToStudio(impact)
                setMcpCatalogStatus(`Saved Studio MCP library and updated ${impact.affectedPerformerIds.length} performer reference${impact.affectedPerformerIds.length === 1 ? '' : 's'}.`)
            } else {
                setMcpCatalogStatus('Saved Studio MCP library. Performers enable servers individually.')
            }
            recordStudioChange({ kind: 'runtime_config' })
            await invalidateMcpQueries(true)
            return true
        } catch (error: unknown) {
            setMcpCatalogStatus(error instanceof Error ? error.message : 'Failed to save Studio MCP library.')
            return false
        } finally {
            setMcpCatalogSaving(false)
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

    const saveMcpEntry = async (entry: McpEntryDraft) => {
        const existingIndex = mcpEntries.findIndex((current) => current.key === entry.key)
        const nextEntries = cloneMcpDraftEntries(
            existingIndex >= 0
                ? mcpEntries.map((current, index) => index === existingIndex ? entry : current)
                : [...mcpEntries, entry],
        )
        const validationError = getMcpEntryValidationError(nextEntries)
        if (validationError) {
            setMcpCatalogStatus(validationError)
            return false
        }

        const impact = buildMcpCatalogImpact(mcpEntries, nextEntries, performers)
        if (hasMcpCatalogImpact(impact)) {
            return new Promise<boolean>((resolve) => {
                pendingSaveRef.current = {
                    entries: nextEntries,
                    impact,
                    resolve,
                }
                setMcpImpactDialog(impact)
            })
        }

        return persistMcpCatalog(nextEntries, impact)
    }

    const deleteMcpEntry = async (key: string) => {
        const nextEntries = cloneMcpDraftEntries(mcpEntries.filter((entry) => entry.key !== key))
        if (nextEntries.length === mcpEntries.length) {
            return false
        }

        const validationError = getMcpEntryValidationError(nextEntries)
        if (validationError) {
            setMcpCatalogStatus(validationError)
            return false
        }

        const impact = buildMcpCatalogImpact(mcpEntries, nextEntries, performers)
        if (hasMcpCatalogImpact(impact)) {
            return new Promise<boolean>((resolve) => {
                pendingSaveRef.current = {
                    entries: nextEntries,
                    impact,
                    resolve,
                }
                setMcpImpactDialog(impact)
            })
        }

        return persistMcpCatalog(nextEntries, impact)
    }

    const createMcpEntryDraft = () => {
        const key = makeId('asset-mcp')
        return createLocalMcpEntryDraft(key)
    }

    const confirmMcpImpactSave = async () => {
        const pending = pendingSaveRef.current
        if (!pending) {
            return
        }

        setMcpImpactSaving(true)
        const saved = await persistMcpCatalog(pending.entries, pending.impact)
        clearPendingSave(saved)
    }

    const cancelMcpImpactSave = () => {
        clearPendingSave(false)
    }

    const prepareMcpRuntimeAction = async () => {
        const state = useStudioStore.getState()
        if (state.runtimeReloadPending) {
            const applied = await state.applyPendingRuntimeReload()
            if (!applied && useStudioStore.getState().runtimeReloadPending) {
                setMcpCatalogStatus('Finish the current run before testing, authenticating, or clearing auth for this MCP server.')
                return false
            }
        }
        return true
    }

    // ── Server operations ───────────────────────────────

    const runConnectMcpServer = async (name: string) => runMcpCatalogAction(
        () => api.mcp.connect(name),
        {
            successMessage: `Connection test passed for ${name}.`,
            failureMessage: `Connection test failed for ${name}.`,
            includeRuntimeTools: true,
        },
    )

    const runStartMcpAuthFlow = async (name: string) => {
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
            await invalidateMcpQueries(true)
        } catch (error: unknown) {
            popup?.close()
            setPendingMcpAuthName(null)
            setMcpCatalogStatus(error instanceof Error ? error.message : `Failed to start authentication for ${name}.`)
        }
    }

    const runClearMcpAuth = async (name: string) => {
        await runMcpCatalogAction(
            () => api.mcp.clearAuth(name),
            {
                successMessage: `Cleared stored authentication for ${name}.`,
                failureMessage: `Failed to clear authentication for ${name}.`,
                includeRuntimeTools: true,
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
        mcpEntries,
        mcpCatalogLoaded,
        mcpCatalogStatus,
        mcpCatalogSaving,
        runtimeReloadPending,
        pendingMcpAuthName,
        mcpImpactDialog,
        mcpImpactSaving,
        mcpServers,
        createMcpEntryDraft,
        saveMcpEntry,
        deleteMcpEntry,
        connectMcpServer: async (name: string) => {
            const ready = await prepareMcpRuntimeAction()
            if (!ready) {
                return
            }
            await runConnectMcpServer(name)
        },
        startMcpAuthFlow: async (name: string) => {
            const ready = await prepareMcpRuntimeAction()
            if (!ready) {
                return
            }
            await runStartMcpAuthFlow(name)
        },
        clearMcpAuth: async (name: string) => {
            const ready = await prepareMcpRuntimeAction()
            if (!ready) {
                return
            }
            await runClearMcpAuth(name)
        },
        confirmMcpImpactSave,
        cancelMcpImpactSave,
    }
}
