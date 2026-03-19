import { AlertCircle, CheckCircle } from 'lucide-react'
import type { OpenCodeInfo } from './settings-utils'

export default function SettingsOpenCode({
    opencodeInfo,
    onRestart,
    setError,
}: {
    opencodeInfo: OpenCodeInfo | null
    onRestart: () => Promise<void>
    setError: (value: string | null) => void
}) {
    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">OpenCode</h2>
            </div>

            <section className="settings-section">
                <div className="settings-section-head">
                    <h4>Connection</h4>
                    {opencodeInfo?.mode === 'managed' && opencodeInfo.restartAvailable && (
                        <button
                            className="btn"
                            onClick={async () => {
                                setError(null)
                                try {
                                    await onRestart()
                                } catch (error) {
                                    setError(error instanceof Error ? error.message : String(error))
                                }
                            }}
                        >
                            Restart OpenCode
                        </button>
                    )}
                </div>
                <div className="settings-row">
                    <span className="settings-label">Status</span>
                    <span className="settings-value">
                        {opencodeInfo?.connected
                            ? <><CheckCircle size={12} color="#14AE5C" /> Connected</>
                            : <><AlertCircle size={12} color="#F24822" /> Disconnected</>}
                    </span>
                </div>
                <div className="settings-row">
                    <span className="settings-label">Mode</span>
                    <span className="settings-value">
                        {opencodeInfo?.mode === 'external' ? 'External OpenCode' : 'Managed by Studio'}
                    </span>
                </div>
                {opencodeInfo?.url && (
                    <div className="settings-row settings-row--stacked">
                        <span className="settings-label">URL</span>
                        <span className="settings-value mono">{opencodeInfo.url}</span>
                    </div>
                )}
                {opencodeInfo?.project?.worktree && (
                    <div className="settings-row settings-row--stacked">
                        <span className="settings-label">Project</span>
                        <span className="settings-value mono">{opencodeInfo.project.worktree}</span>
                    </div>
                )}
                {opencodeInfo?.error && (
                    <div className="settings-note settings-note--error">{opencodeInfo.error}</div>
                )}
            </section>

            <section className="settings-section">
                <h4>About</h4>
                <div className="settings-row">
                    <span className="settings-label">Studio API</span>
                    <span className="settings-value mono">
                        {typeof window === 'undefined' ? '/api' : `${window.location.origin}/api`}
                    </span>
                </div>
                <div className="settings-row">
                    <span className="settings-label">Frontend</span>
                    <span className="settings-value mono">
                        {typeof window === 'undefined' ? 'Unavailable' : window.location.origin}
                    </span>
                </div>
            </section>
        </div>
    )
}
