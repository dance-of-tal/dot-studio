/**
 * SettingsGeneral — General UI preferences panel.
 * Mirrors OpenCode's settings-general.tsx (reasoning, shell/edit parts, follow-up).
 */

import { useUISettings, type FollowupBehavior } from '../../store/settingsSlice'

const followupOptions: { value: FollowupBehavior; label: string; description: string }[] = [
    { value: 'steer', label: 'Steer', description: 'Immediately redirect the active conversation' },
    { value: 'queue', label: 'Queue', description: 'Add as the next message after the current turn finishes' },
]

interface ToggleRowProps {
    title: string
    description: string
    checked: boolean
    onChange: (value: boolean) => void
}

function ToggleRow({ title, description, checked, onChange }: ToggleRowProps) {
    return (
        <div className="stg-row">
            <div className="stg-row__text">
                <span className="stg-row__title">{title}</span>
                <span className="stg-row__desc">{description}</span>
            </div>
            <label className="stg-toggle">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span className="stg-toggle__track" />
            </label>
        </div>
    )
}

interface SelectRowProps {
    title: string
    description: string
    value: string
    options: { value: string; label: string; description?: string }[]
    onChange: (value: string) => void
}

function SelectRow({ title, description, value, options, onChange }: SelectRowProps) {
    return (
        <div className="stg-row">
            <div className="stg-row__text">
                <span className="stg-row__title">{title}</span>
                <span className="stg-row__desc">{description}</span>
            </div>
            <select
                className="stg-select"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    )
}

export default function SettingsGeneral() {
    const settings = useUISettings()

    return (
        <div className="stg-panel">
            <div className="stg-panel__header">
                <h2 className="stg-panel__title">General</h2>
            </div>

            <div className="stg-section">
                <div className="stg-group">
                    <ToggleRow
                        title="Show reasoning summaries"
                        description="Display collapsed reasoning summaries from model thinking blocks"
                        checked={settings.showReasoningSummaries}
                        onChange={settings.setShowReasoningSummaries}
                    />

                    <ToggleRow
                        title="Expand shell tool parts"
                        description="Auto-expand shell command output in the conversation feed"
                        checked={settings.shellToolPartsExpanded}
                        onChange={settings.setShellToolPartsExpanded}
                    />

                    <ToggleRow
                        title="Expand edit tool parts"
                        description="Auto-expand file edit diffs in the conversation feed"
                        checked={settings.editToolPartsExpanded}
                        onChange={settings.setEditToolPartsExpanded}
                    />

                    <SelectRow
                        title="Follow-up behavior"
                        description="How to handle messages you send while the AI is still responding"
                        value={settings.followup}
                        options={followupOptions}
                        onChange={(v) => settings.setFollowup(v as FollowupBehavior)}
                    />
                </div>
            </div>
        </div>
    )
}
