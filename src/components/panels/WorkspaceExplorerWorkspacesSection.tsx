import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { stageLabel } from './workspace-explorer-utils'

type Props = {
    stagesHeight: number
    stageRows: ReactNode[]
    workingDir: string
    onNewStage: () => void
}

export default function WorkspaceExplorerWorkspacesSection({
    stagesHeight,
    stageRows,
    workingDir,
    onNewStage,
}: Props) {
    return (
        <section className="explorer-section explorer-section--stages" style={{ flex: `0 0 ${stagesHeight}px` }}>
            <div className="explorer__subheader">
                <span className="explorer__title">Stages</span>
                <button className="icon-btn" onClick={onNewStage} title="Open working directory">
                    <Plus size={12} />
                </button>
            </div>
            <div className="explorer__context">
                <span className="explorer__context-label">Current</span>
                <strong>{workingDir ? stageLabel(workingDir) : 'No working directory'}</strong>
                {workingDir ? (
                    <span className="explorer__context-path" title={workingDir}>
                        {workingDir}
                    </span>
                ) : null}
            </div>
            <div className="explorer__tree scroll-area">
                {stageRows.length > 0 ? stageRows : <div className="empty-state">No saved working directories</div>}
            </div>
        </section>
    )
}
