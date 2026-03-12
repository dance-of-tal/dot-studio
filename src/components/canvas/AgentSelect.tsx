import { useEffect, useMemo } from 'react'
import { useAgents } from '../../hooks/queries'

type AgentSelectProps = {
    value: string | null | undefined
    onChange: (value: string | null) => void
    className?: string
    compact?: boolean
    titlePrefix?: string
    disabled?: boolean
}

function formatAgentLabel(name: string) {
    return name
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join(' ')
}

export default function AgentSelect({
    value,
    onChange,
    className,
    compact = false,
    titlePrefix = 'Agent',
    disabled = false,
}: AgentSelectProps) {
    const { data: agents = [] } = useAgents(true)
    const visibleAgents = useMemo(
        () => agents
            .filter((agent) => !agent.hidden && (agent.mode === 'primary' || agent.mode === 'all'))
            .sort((left, right) => {
                const order = (name: string) => {
                    if (name === 'build') return 0
                    if (name === 'plan') return 1
                    return 10
                }
                return order(left.name) - order(right.name) || left.name.localeCompare(right.name)
            }),
        [agents],
    )
    const selectedAgent = useMemo(
        () => visibleAgents.find((agent) => agent.name === value) || null,
        [visibleAgents, value],
    )

    useEffect(() => {
        if (value && !selectedAgent) {
            onChange(null)
        }
    }, [onChange, selectedAgent, value])

    if (visibleAgents.length === 0) {
        return null
    }

    return (
        <label className={className || 'model-variant-select'}>
            {!compact ? <span>Agent</span> : null}
            <select
                className="text-input"
                value={value || ''}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value || null)}
                title={selectedAgent
                    ? `${titlePrefix}: ${formatAgentLabel(selectedAgent.name)}${selectedAgent.description ? ` · ${selectedAgent.description}` : ''}`
                    : `${titlePrefix}: default`}
            >
                <option value="">Default</option>
                {visibleAgents.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                        {formatAgentLabel(agent.name)}
                    </option>
                ))}
            </select>
        </label>
    )
}
