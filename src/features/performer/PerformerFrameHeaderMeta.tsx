type Props = {
    modelLabel: string | null
    modelTitle: string | null
    talLabel: string | null
    danceSummary: string | null
    executionMode: 'direct' | 'safe'
    pendingCount: number
    conflictCount: number
}

export default function PerformerFrameHeaderMeta({
    modelLabel,
    modelTitle,
    talLabel,
    danceSummary,
    executionMode,
    pendingCount,
    conflictCount,
}: Props) {
    return (
        <div className="canvas-frame__badges">
            <span className="canvas-frame__badge" title={executionMode === 'safe' ? 'Safe mode enabled' : 'Direct mode enabled'}>
                {executionMode === 'safe' ? 'Safe' : 'Direct'}
            </span>
            {conflictCount > 0 ? <span className="canvas-frame__badge" title={`${conflictCount} conflict${conflictCount === 1 ? '' : 's'} require review`}>Conflict</span> : null}
            {pendingCount > 0 ? <span className="canvas-frame__badge" title={`${pendingCount} pending change${pendingCount === 1 ? '' : 's'}`}>{pendingCount} change{pendingCount === 1 ? '' : 's'}</span> : null}
            {talLabel ? <span className="canvas-frame__badge" title={`Tal: ${talLabel}`}>{talLabel}</span> : null}
            {danceSummary ? <span className="canvas-frame__badge" title={`Dance: ${danceSummary}`}>{danceSummary}</span> : null}
            {modelLabel ? <span className="canvas-frame__badge" title={modelTitle || modelLabel}>{modelLabel}</span> : null}
        </div>
    )
}
