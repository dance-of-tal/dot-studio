import { Hexagon, Zap, Cpu, Server, Package } from 'lucide-react'
import { useStudioStore } from './store'
import type { StudioState } from './store'
import { api } from './api'
import { showToast } from './lib/toast'
import { normalizeAssetMcpForStudio, normalizeAssetModelForStudio } from './lib/performers'
import { mcpServerNamesFromConfig } from '../shared/mcp-catalog'
import { extractMcpServerNamesFromConfig } from '../shared/mcp-config'
import { resolvePerformerMcpPortability } from '../shared/performer-mcp-portability'
import {
    toDragPreview,
    isInstalledAsset,
    getAssetAuthor,
    getAssetSlug,
    applyAssetToPerformerTarget,
} from './lib/dnd-handlers'
import type { DragAsset, DropTargetData, PerformerAssetPayload } from './lib/dnd-handlers'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'

export { toDragPreview }
export type { DragAsset }

type McpConfigEntryLike = {
    command?: string | string[]
    url?: string
}

type DraftConfigLike = Record<string, unknown>

function markdownContentFromAssetDetail(detail: { content?: string }) {
    return typeof detail.content === 'string' ? detail.content : ''
}

export function getDragIcon(kind: string) {
    switch (kind) {
        case 'tal': return <Hexagon size={12} className="asset-icon tal" />
        case 'dance': return <Zap size={12} className="asset-icon dance" />
        case 'model': return <Cpu size={12} className="asset-icon model" />
        case 'mcp': return <Server size={12} className="asset-icon mcp" />
        case 'performer': return <Package size={12} className="asset-icon performer" />
        default: return <Package size={12} />
    }
}

export async function loadMarkdownTemplateIntoEditor(
    editorId: string,
    asset: DragAsset,
    store: StudioState,
) {
    const editor = store.markdownEditors.find((item) => item.id === editorId)
    if (!editor) {
        throw new Error('Editor not found.')
    }
    if (editor.kind !== asset.kind) {
        throw new Error(`${editor.kind === 'tal' ? 'Tal' : 'Dance'} editor only accepts ${editor.kind} assets.`)
    }

    const isLocalInstalled = isInstalledAsset(asset)
    const detail = !isLocalInstalled
        ? await api.assets.getRegistry(asset.kind as 'tal' | 'dance', getAssetAuthor(asset), getAssetSlug(asset))
        : await api.assets.get(asset.kind as 'tal' | 'dance', getAssetAuthor(asset), getAssetSlug(asset))

    const currentDraft = store.drafts[editor.draftId]
    if (!currentDraft) {
        throw new Error('Editor draft not found.')
    }

    store.upsertDraft({
        ...currentDraft,
        name: detail.name || asset.name || currentDraft.name,
        slug: detail.slug || asset.slug || asset.name,
        description: detail.description || detail.name || asset.name,
        tags: Array.isArray(detail.tags) ? detail.tags : [],
        content: markdownContentFromAssetDetail(detail),
        derivedFrom: detail.urn || asset.urn || undefined,
        updatedAt: Date.now(),
    })
    store.updateMarkdownEditorBaseline(editor.id, {
        name: detail.name || asset.name || currentDraft.name,
        slug: detail.slug || asset.slug || asset.name,
        description: detail.description || detail.name || asset.name,
        tags: Array.isArray(detail.tags) ? detail.tags : [],
        content: markdownContentFromAssetDetail(detail),
    })
    store.selectMarkdownEditor(editor.id)
    showToast(`Loaded ${asset.kind} template into the editor.`, 'success')
}

export async function resolvePerformerAssetForStudio(
    asset: DragAsset,
    showDropWarning: (message: string) => void,
): Promise<PerformerAssetPayload> {
    const globalConfig = await api.config.getGlobal().catch(() => ({}))
    const availableMcpServerNames = mcpServerNamesFromConfig(globalConfig)
    const runtimeModels = await api.models.list()
    const normalized = normalizeAssetMcpForStudio(
        normalizeAssetModelForStudio(asset, runtimeModels),
        availableMcpServerNames,
    )
    if (!normalized.model && normalized.modelPlaceholder) {
        showDropWarning(`Model ${normalized.modelPlaceholder.provider}/${normalized.modelPlaceholder.modelId} is not available in this Studio runtime. A placeholder was kept so you can pick a replacement.`)
    }
    const portability = (
        Array.isArray(asset.declaredMcpServerNames)
        && Array.isArray(asset.matchedMcpServerNames)
        && Array.isArray(asset.missingMcpServerNames)
    )
        ? {
            declaredMcpServerNames: asset.declaredMcpServerNames,
            matchedMcpServerNames: asset.matchedMcpServerNames,
            missingMcpServerNames: asset.missingMcpServerNames,
        }
        : resolvePerformerMcpPortability(asset.mcpConfig, availableMcpServerNames)

    const declaredMcpNames = portability.declaredMcpServerNames.length > 0
        ? portability.declaredMcpServerNames
        : extractMcpServerNamesFromConfig(asset.mcpConfig)
    const unresolvedMcpNames = declaredMcpNames.filter((name) => !(normalized.mcpBindingMap?.[name] || '').trim())

    if (portability.matchedMcpServerNames.length > 0) {
        showToast(
            `Imported performer found matching Studio MCP names: ${portability.matchedMcpServerNames.join(', ')}. Review the performer binding after import.`,
            'info',
            {
                title: 'Matching MCP names found',
                dedupeKey: `performer-import-mcp-match:${asset.urn || asset.name}:${portability.matchedMcpServerNames.join(',')}`,
                durationMs: 5000,
            },
        )
    }
    if (unresolvedMcpNames.length > 0) {
        const mcpConfig = (asset.mcpConfig && typeof asset.mcpConfig === 'object')
            ? asset.mcpConfig as Record<string, McpConfigEntryLike>
            : {}
        const details = unresolvedMcpNames.map((name) => {
            const cfg = mcpConfig[name]
            if (cfg && cfg.command) {
                const cmd = Array.isArray(cfg.command) ? cfg.command.join(' ') : String(cfg.command)
                return `• ${name} (local: ${cmd})`
            }
            if (cfg && cfg.url) {
                return `• ${name} (remote: ${cfg.url})`
            }
            return `• ${name}`
        }).join('\n')
        showToast(
            `This performer requires MCP servers that are not yet in the Studio MCP library:\n${details}\n\nAdd them in Asset Library → MCP.`,
            'warning',
            {
                title: 'MCP servers required',
                dedupeKey: `performer-import-mcp-missing:${asset.urn || asset.name}`,
                durationMs: 8000,
            },
        )
    }
    return normalized as PerformerAssetPayload
}

export function createDragStartHandler(
    setActiveDrag: (drag: { kind: string; label: string } | null) => void,
) {
    return (event: DragStartEvent) => {
        setActiveDrag(toDragPreview((event.active.data.current as DragAsset | undefined) || {}))
    }
}

export function createDragEndHandler(
    setActiveDrag: (drag: null) => void,
    showDropWarning: (message: string) => void,
) {
    return async (event: DragEndEvent) => {
        setActiveDrag(null)
        const { active, over } = event
        if (!over) return

        const asset = active.data.current as DragAsset
        const dropData = over.data.current as DropTargetData

        if (!asset || !dropData) {
            return
        }

        const store = useStudioStore.getState()

        const handleCanvasRootDrop = async () => {
            if (dropData.type !== 'canvas-root') {
                return false
            }

            if (asset.kind === 'performer') {
                // Draft performer: create from draft content
                if (asset.source === 'draft' && asset.draftContent) {
                    const cfg = asset.draftContent as DraftConfigLike
                    store.addPerformerFromDraft(asset.name || 'Draft Performer', cfg, asset.description || undefined)
                    return true
                }
                store.addPerformerFromAsset(await resolvePerformerAssetForStudio(asset, showDropWarning))
                return true
            }

            if (asset.kind === 'act') {
                // Draft act: create from draft content
                if (asset.source === 'draft' && asset.draftContent) {
                    const cfg = asset.draftContent as DraftConfigLike
                    store.importActFromDraft(asset.name || 'Draft Act', cfg)
                    return true
                }
                store.importActFromAsset(asset as import('./types').AssetCard)
                return true
            }

            return false
        }

        const handleMarkdownEditorDrop = async () => {
            if (dropData.type !== 'markdown-editor' || (asset.kind !== 'tal' && asset.kind !== 'dance') || !dropData.editorId) {
                return false
            }

            try {
                await loadMarkdownTemplateIntoEditor(dropData.editorId, asset, store)
            } catch (error) {
                console.error('Failed to load markdown template', error)
                showToast('Failed to load asset template into the editor.', 'error', {
                    title: 'Template import failed',
                    dedupeKey: `markdown-template-import:${dropData.editorId}:${asset.kind}:${asset.slug || asset.name}`,
                    actionLabel: 'Retry',
                    onAction: () => {
                        void loadMarkdownTemplateIntoEditor(dropData.editorId as string, asset, useStudioStore.getState()).catch((retryError) => {
                            console.error('Failed to retry markdown template load', retryError)
                        })
                    },
                })
            }
            return true
        }

        if (await handleCanvasRootDrop()) {
            return
        }

        if (await handleMarkdownEditorDrop()) {
            return
        }

        // Standalone performer drops
        if (dropData.performerId) {
            await applyAssetToPerformerTarget(
                store,
                dropData.performerId,
                dropData.type,
                asset,
                showDropWarning,
                (a) => resolvePerformerAssetForStudio(a, showDropWarning),
            )
        }
    }
}
