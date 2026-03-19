import type { ProjectConfigMeta, ProjectSettingsDraft, ProviderCard } from './settings-utils'

export default function SettingsProject({
    projectMeta,
    projectDraft,
    providers,
    projectDirty,
    savingProject,
    projectMessage,
    toggleProviderVisibility,
    setProjectDraft,
    resetProjectDraft,
    saveProjectSettings,
}: {
    projectMeta: ProjectConfigMeta | null
    projectDraft: ProjectSettingsDraft | null
    providers: ProviderCard[]
    projectDirty: boolean
    savingProject: boolean
    projectMessage: string | null
    toggleProviderVisibility: (providerId: string) => void
    setProjectDraft: React.Dispatch<React.SetStateAction<ProjectSettingsDraft | null>>
    resetProjectDraft: () => void
    saveProjectSettings: () => Promise<void>
}) {
    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">Project</h2>
            </div>

            <section className="settings-section">
                <div className="settings-section-head">
                    <h4>OpenCode Project Config</h4>
                    <span className="settings-caption">
                        Saved through OpenCode into the current working directory.
                    </span>
                </div>

                {projectMeta && (
                    <div className="settings-row settings-row--stacked">
                        <span className="settings-label">Config File</span>
                        <span className="settings-value mono">{projectMeta.path}</span>
                    </div>
                )}

                <div className="settings-form-grid">
                    <label className="settings-field">
                        <span className="settings-field__label">Share mode</span>
                        <select
                            className="select"
                            value={projectDraft?.share || 'manual'}
                            onChange={(e) => setProjectDraft((current) => current ? {
                                ...current, share: e.target.value as 'manual' | 'auto' | 'disabled',
                            } : current)}
                        >
                            <option value="manual">Manual</option>
                            <option value="auto">Auto</option>
                            <option value="disabled">Disabled</option>
                        </select>
                    </label>

                    <label className="settings-field">
                        <span className="settings-field__label">Username</span>
                        <input
                            className="input"
                            value={projectDraft?.username || ''}
                            onChange={(e) => setProjectDraft((current) => current ? {
                                ...current, username: e.target.value,
                            } : current)}
                            placeholder="Display name for OpenCode sessions"
                        />
                    </label>
                </div>

                <div className="settings-note">
                    <div className="settings-note__title">Provider visibility</div>
                    Hide providers you do not want surfaced in this project.
                </div>

                <div className="settings-checkbox-list">
                    {providers.map((provider) => (
                        <label key={provider.id} className="settings-checkbox">
                            <input
                                type="checkbox"
                                checked={projectDraft?.visibleProviders[provider.id] ?? true}
                                onChange={() => toggleProviderVisibility(provider.id)}
                            />
                            <span className="settings-checkbox__body">
                                <span className="settings-checkbox__title">{provider.name}</span>
                                <span className="settings-checkbox__meta">
                                    {provider.id} · {provider.modelCount} models · {provider.connected ? 'connected' : 'not connected'}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="settings-save-row">
                    <button className="btn" onClick={resetProjectDraft} disabled={!projectDirty || savingProject}>
                        Reset
                    </button>
                    <button className="btn btn--primary" onClick={() => void saveProjectSettings()} disabled={!projectDirty || savingProject}>
                        {savingProject ? 'Saving...' : projectMeta?.exists ? 'Update config' : 'Create config'}
                    </button>
                </div>

                {projectMessage && (
                    <div className="settings-note settings-note--success">{projectMessage}</div>
                )}
            </section>
        </div>
    )
}
