/**
 * useMcpCatalog – MCP catalog state & operations extracted from AssetLibrary.
 *
 * Manages draft entries, save/reset, connect/disconnect,
 * authentication lifecycle, and query invalidation.
 */

function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { queryKeys, useMcpServers } from '../../hooks/queries'
import { showToast } from '../../lib/toast'
import type { ProjectMcpEntryDraft } from '../modals/settings-utils'
import { buildProjectMcpDrafts, serializeProjectMcpEntries } from '../modals/settings-utils'

export interface McpCatalogState {
    mcpDraftEntries: ProjectMcpEntryDraft[]
    mcpCatalogDirty: boolean
    mcpCatalogStatus: string | null
    mcpCatalogSaving: boolean
    pendingMcpAuthName: string | null
    mcpServers: ReturnType<typeof useMcpServers>['data']
    updateMcpEntry: (key: string, updater: (entry: ProjectMcpEntryDraft) => ProjectMcpEntryDraft) => void
    addMcpEntry: (type: 'local' | 'remote') => void
    removeMcpEntry: (key: string) => void
    saveMcpCatalog: () => Promise<void>
    resetMcpCatalog: () => void
    connectMcpServer: (name: string) => Promise<void>
    disconnectMcpServer: (name: string) => Promise<void>
    authenticateMcpServer: (name: string) => Promise<void>
    clearMcpAuth: (name: string) => Promise<void>
}

export function useMcpCatalog(workingDir: string, showMcps: boolean): McpCatalogState {
    const [mcpDraftEntries, setMcpDraftEntries] = useState<ProjectMcpEntryDraft[]>([])
    const [mcpDraftSnapshot, setMcpDraftSnapshot] = useState<ProjectMcpEntryDraft[]>([])
    const [mcpCatalogStatus, setMcpCatalogStatus] = useState<string | null>(null)
    const [mcpCatalogSaving, setMcpCatalogSaving] = useState(false)
    const [pendingMcpAuthName, setPendingMcpAuthName] = useState<string | null>(null)
    const mcpAuthDeadlineRef = useRef<number | null>(null)
    const queryClient = useQueryClient()

    const { data: mcpServers = [] } = useMcpServers(showMcps)

    // ── Load catalog when MCP tab is shown ──────────────
    useEffect(() => {
        if (!showMcps) {
            return
        }
        api.config.getProject()
            .then((result) => {
                const config = result?.config && typeof result.config === 'object' ? result.config : {}
                const drafts = buildProjectMcpDrafts((config as any).mcp || {})
                setMcpDraftEntries(drafts)
                setMcpDraftSnapshot(drafts)
                setMcpCatalogStatus(null)
            })
            .catch((error) => {
                console.error('Failed to load MCP catalog', error)
                setMcpCatalogStatus('Failed to load project MCP catalog.')
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

    const updateMcpEntry = (key: string, updater: (entry: ProjectMcpEntryDraft) => ProjectMcpEntryDraft) => {
        setMcpDraftEntries((current) => current.map((entry) => entry.key === key ? updater(entry) : entry))
    }

    const addMcpEntry = (type: 'local' | 'remote') => {
        const key = makeId('asset-mcp')
        setMcpDraftEntries((current) => [
            ...current,
            {
                key,
                name: '',
                type,
                enabled: true,
                commandText: '',
                environmentText: '',
                timeoutText: '',
                url: '',
                headersText: '',
                oauthEnabled: true,
                oauthClientId: '',
                oauthClientSecret: '',
                oauthScope: '',
            },
        ])
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
        } catch (error: any) {
            setMcpCatalogStatus(error?.message || options.failureMessage)
        }
    }

    const saveMcpCatalog = async () => {
        setMcpCatalogSaving(true)
        setMcpCatalogStatus(null)
        try {
            const invalidEntry = mcpDraftEntries.find((entry) => (
                entry.name.trim()
                && (
                    (entry.type === 'local' && !entry.commandText.trim())
                    || (entry.type === 'remote' && !entry.url.trim())
                )
            ))
            if (invalidEntry) {
                throw new Error(
                    invalidEntry.type === 'local'
                        ? `MCP '${invalidEntry.name}' needs a command before saving.`
                        : `MCP '${invalidEntry.name}' needs a URL before saving.`,
                )
            }

            await api.config.update({
                mcp: serializeProjectMcpEntries(mcpDraftEntries),
            })
            setMcpDraftSnapshot(mcpDraftEntries)
            setMcpCatalogStatus('Saved project MCP catalog.')
            await queryClient.invalidateQueries({ queryKey: [...queryKeys.mcpServers, workingDir] })
        } catch (error: any) {
            setMcpCatalogStatus(error?.message || 'Failed to save project MCP catalog.')
        } finally {
            setMcpCatalogSaving(false)
        }
    }

    const resetMcpCatalog = () => {
        setMcpDraftEntries(mcpDraftSnapshot)
        setMcpCatalogStatus(null)
    }

    // ── Server operations ───────────────────────────────

    const connectMcpServer = async (name: string) => runMcpCatalogAction(
        () => api.mcp.connect(name),
        {
            successMessage: `Connected MCP server ${name}.`,
            failureMessage: `Failed to connect ${name}.`,
            includeRuntimeTools: true,
        },
    )

    const disconnectMcpServer = async (name: string) => {
        await runMcpCatalogAction(
            () => api.mcp.disconnect(name),
            {
                successMessage: `Disconnected MCP server ${name}.`,
                failureMessage: `Failed to disconnect ${name}.`,
                includeRuntimeTools: true,
            },
        )
    }

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
        } catch (error: any) {
            popup?.close()
            setPendingMcpAuthName(null)
            setMcpCatalogStatus(error?.message || `Failed to start authentication for ${name}.`)
        }
    }

    const clearMcpAuth = async (name: string) => {
        await runMcpCatalogAction(
            () => api.mcp.clearAuth(name),
            {
                successMessage: `Cleared stored authentication for ${name}.`,
                failureMessage: `Failed to clear authentication for ${name}.`,
                onSuccess: () => {
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
        mcpCatalogDirty,
        mcpCatalogStatus,
        mcpCatalogSaving,
        pendingMcpAuthName,
        mcpServers,
        updateMcpEntry,
        addMcpEntry,
        removeMcpEntry,
        saveMcpCatalog,
        resetMcpCatalog,
        connectMcpServer,
        disconnectMcpServer,
        authenticateMcpServer,
        clearMcpAuth,
    }
}
