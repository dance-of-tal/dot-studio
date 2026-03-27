import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { workspaceLabel } from './workspace-explorer-utils'

type Props = {
    workspacesHeight: number
    workspaceRows: ReactNode[]
    workingDir: string
    onOpenWorkspace: () => void
}

export default function WorkspaceExplorerWorkspacesSection({
    workspacesHeight,
    workspaceRows,
    workingDir,
    onOpenWorkspace,
}: Props) {
    return (
        <section className="explorer-section explorer-section--stages explorer-section--workspaces" style={{ flex: `0 0 ${workspacesHeight}px` }}>
            <div className="explorer__subheader">
                <span className="explorer__title">Workspaces</span>
                <button className="icon-btn" onClick={onOpenWorkspace} title="Open workspace directory">
                    <Plus size={12} />
                </button>
            </div>
            <div className="explorer__context explorer__context--workspaces">
                <span className="explorer__context-label">Current</span>
                <strong>{workingDir ? workspaceLabel(workingDir) : 'No workspace open'}</strong>
                {workingDir ? (
                    <span className="explorer__context-path" title={workingDir}>
                        {workingDir}
                    </span>
                ) : null}
            </div>
            <div className="explorer__tree explorer__tree--workspaces scroll-area">
                {workspaceRows.length > 0 ? workspaceRows : <div className="empty-state">No saved workspaces</div>}
            </div>
        </section>
    )
}
