import { useEffect, useMemo, useState } from 'react'
import { useStudioStore } from '../../store'
import { api } from '../../api'
import {
    BUILTIN_TOOL_DEFINITIONS,
    createToolPermissionDraft,
    mergeToolPermissionConfig,
    type ToolPermissionMode,
} from './tool-settings-utils'

type SettingsToolsProps = {
    refreshToken: number
}

type OpenCodeHealthMeta = {
    connected?: boolean
    mode?: 'managed' | 'external'
}

const PERMISSION_OPTIONS: ToolPermissionMode[] = ['allow', 'ask', 'deny']

function sortToolIds(toolIds: string[]) {
    return [...toolIds].sort((left, right) => left.localeCompare(right))
}

export default function SettingsTools({ refreshToken }: SettingsToolsProps) {
    const workingDir = useStudioStore((state) => state.workingDir)
    const runtimeReloadPending = useStudioStore((state) => state.runtimeReloadPending)

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [configSnapshot, setConfigSnapshot] = useState<Record<string, unknown>>({})
    const [savedPermissions, setSavedPermissions] = useState<Record<string, ToolPermissionMode>>(
        () => createToolPermissionDraft({}),
    )
    const [draftPermissions, setDraftPermissions] = useState<Record<string, ToolPermissionMode>>(
        () => createToolPermissionDraft({}),
    )
    const [liveToolIds, setLiveToolIds] = useState<string[]>([])
    const [healthMeta, setHealthMeta] = useState<OpenCodeHealthMeta | null>(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            setError(null)
            setStatusMessage(null)
            try {
                const [config, toolIds, health] = await Promise.all([
                    api.config.getGlobal().catch(() => ({})),
                    api.tools.list().catch(() => []),
                    api.opencodeHealth().catch(() => null),
                ])
                if (cancelled) {
                    return
                }

                const permissionConfig = config && typeof config === 'object'
                    ? (config as Record<string, unknown>).permission
                    : undefined
                const nextDraft = createToolPermissionDraft(permissionConfig)
                setConfigSnapshot(config)
                setSavedPermissions(nextDraft)
                setDraftPermissions(nextDraft)
                setLiveToolIds(sortToolIds(toolIds))
                setHealthMeta(health)
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : 'Failed to load tool settings.')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [refreshToken, workingDir])

    const dirty = useMemo(
        () => JSON.stringify(savedPermissions) !== JSON.stringify(draftPermissions),
        [draftPermissions, savedPermissions],
    )

    const websearchAvailable = liveToolIds.includes('websearch')

    const availabilityNote = useMemo(() => {
        if (websearchAvailable) {
            return null
        }
        if (healthMeta?.mode === 'managed') {
            return 'websearch is not advertised by the current managed OpenCode runtime yet. Refresh or restart the sidecar if you just enabled it.'
        }
        if (healthMeta?.mode === 'external') {
            return 'External OpenCode instances need OPENCODE_ENABLE_EXA=1 to expose websearch.'
        }
        return 'websearch availability could not be confirmed from the current OpenCode runtime.'
    }, [healthMeta?.mode, websearchAvailable])

    async function handleSave() {
        setSaving(true)
        setError(null)
        setStatusMessage(null)
        try {
            const permission = mergeToolPermissionConfig(configSnapshot.permission, draftPermissions)
            await api.config.updateGlobal({ permission })
            useStudioStore.getState().recordStudioChange({ kind: 'runtime_config' })
            setConfigSnapshot((current) => ({ ...current, permission }))
            setSavedPermissions({ ...draftPermissions })
            setStatusMessage('Saved tool permissions. The change is queued for the next runtime reload boundary.')
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save tool permissions.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="stg-panel">
            <div className="stg-panel__header stg-panel__header--split">
                <div>
                    <h2 className="stg-panel__title">Tools</h2>
                    <div className="alert alert--muted">
                        Tool permissions and auto-accept behavior live in OpenCode runtime config, not performer projection, so changes are queued and adopted at the next execution boundary.
                    </div>
                </div>
                <button className="btn btn--primary" onClick={() => { void handleSave() }} disabled={!dirty || saving || loading}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>

            {statusMessage && <div className="alert alert--success">{statusMessage}</div>}
            {error && <div className="alert alert--error">{error}</div>}
            {runtimeReloadPending ? (
                <div className="alert">
                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>Runtime reload pending</div>
                    <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>Changes will take effect the next time OpenCode processes a turn or session boundary.</div>
                </div>
            ) : null}

            {loading ? (
                <div className="empty-state">Loading tool settings…</div>
            ) : (
                <>
                    <div className="stg-section">
                        <h3 className="stg-section__title">Built-in Permissions</h3>
                        <div className="stg-group">
                            {BUILTIN_TOOL_DEFINITIONS.map((tool) => {
                                const available = liveToolIds.includes(tool.id) || (tool.aliases || []).some((alias) => liveToolIds.includes(alias))

                                return (
                                    <div key={tool.id} className="stg-row stg-row--top">
                                        <div className="stg-row__text">
                                            <span className="stg-row__title">
                                                {tool.label}
                                                {available ? <span className="badge badge--subtle stg-row__inline-tag">Live</span> : null}
                                            </span>
                                            <span className="stg-row__desc">{tool.description}</span>
                                            {tool.aliases && tool.aliases.length > 0 ? (
                                                <div className="stg-tool-chip-list" style={{ marginTop: '4px' }}>
                                                    {tool.aliases.map((alias) => (
                                                        <span key={alias} className="badge badge--subtle">{alias}</span>
                                                    ))}
                                                </div>
                                            ) : null}
                                            {!available && availabilityNote ? (
                                                <div className="alert">
                                                    <div style={{ fontWeight: 600, marginBottom: '2px' }}>Requires Action</div>
                                                    <div style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>{availabilityNote}</div>
                                                </div>
                                            ) : null}
                                            {tool.note ? <div className="alert alert--muted">{tool.note}</div> : null}
                                        </div>
                                        <select
                                            className="select stg-select"
                                            value={draftPermissions[tool.permissionKey]}
                                            onChange={(event) => {
                                                const nextValue = event.target.value as ToolPermissionMode
                                                setDraftPermissions((current) => ({
                                                    ...current,
                                                    [tool.permissionKey]: nextValue,
                                                }))
                                            }}
                                        >
                                            {PERMISSION_OPTIONS.map((option) => (
                                                <option key={option} value={option}>
                                                    {option}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="stg-section">
                        <h3 className="stg-section__title">Web Search</h3>
                        <div className="alert">
                            `webfetch` retrieves a known URL. `websearch` is discovery and depends on OpenCode advertising the tool.
                        </div>
                        {availabilityNote ? <div className="alert alert--muted">{availabilityNote}</div> : null}
                    </div>

                    <div className="stg-section">
                        <h3 className="stg-section__title">Detected Runtime Tools</h3>
                        {liveToolIds.length === 0 ? (
                            <div className="empty-state">No runtime tools reported by OpenCode.</div>
                        ) : (
                            <div className="stg-tool-chip-list">
                                {liveToolIds.map((toolId) => (
                                    <span key={toolId} className="badge badge--subtle">{toolId}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
