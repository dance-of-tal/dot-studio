import { useCallback, useEffect, useRef, useState } from 'react'
import { FileCode, Github, X } from 'lucide-react'
import { api } from '../../api'
import { useStudioStore } from '../../store'
import type { FileStatus } from '../../types'
import '../assistant/AssistantChat.css'
import './WorkspaceTrackingPanel.css'

export function WorkspaceTrackingPanel() {
    const isTrackingOpen = useStudioStore((state) => state.isTrackingOpen)
    const setTrackingOpen = useStudioStore((state) => state.setTrackingOpen)
    const workingDir = useStudioStore((state) => state.workingDir)
    const [files, setFiles] = useState<FileStatus[]>([])
    const [panelWidth, setPanelWidth] = useState(320)
    const dragging = useRef(false)

    const fetchFiles = useCallback(async () => {
        try {
            const res = await api.file.status()
            setFiles(res || [])
        } catch {
            setFiles([])
        }
    }, [])

    const onResizeMouseDown = useCallback((event: React.MouseEvent) => {
        event.preventDefault()
        dragging.current = true
        const startX = event.clientX
        const startW = panelWidth
        const onMove = (moveEvent: MouseEvent) => {
            if (!dragging.current) return
            setPanelWidth(Math.min(520, Math.max(260, startW + (startX - moveEvent.clientX))))
        }
        const onUp = () => {
            dragging.current = false
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [panelWidth])

    useEffect(() => {
        if (!isTrackingOpen) {
            return
        }

        void fetchFiles()
        const interval = window.setInterval(() => void fetchFiles(), 10000)
        return () => window.clearInterval(interval)
    }, [fetchFiles, isTrackingOpen])

    if (!isTrackingOpen) return null

    const isClean = files.length === 0
    const statusLabel = isClean ? 'Clean' : `${files.length} file${files.length === 1 ? '' : 's'}`

    return (
        <div className="assistant-panel workspace-tracking-panel" style={{ width: panelWidth }}>
            <div className="assistant-resize-handle" onMouseDown={onResizeMouseDown} />

            <div className="assistant-header">
                <div className="assistant-header__meta">
                    <div className="assistant-header__title">
                        <div className="assistant-header__icon">
                            <Github size={14} />
                        </div>
                        <span>Workspace Tracking</span>
                    </div>
                    <div className="assistant-header__subtitle">
                        <span title={workingDir || undefined}>{workingDir || 'Working tree status'}</span>
                        <span className={`assistant-status-pill workspace-tracking-panel__status-pill ${isClean ? '' : 'is-dirty'}`.trim()}>
                            {statusLabel}
                        </span>
                    </div>
                </div>
                <div className="assistant-header__actions">
                    <button
                        className="icon-btn assistant-header__close"
                        onClick={() => setTrackingOpen(false)}
                        title="Hide Workspace Tracking"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            <div className="assistant-content workspace-tracking-panel__content">
                {files.length === 0 ? (
                    <div className="assistant-empty workspace-tracking-panel__empty">
                        <Github size={40} className="assistant-empty__icon" />
                        <h3 className="assistant-empty__title">Working tree is clean</h3>
                        <p className="assistant-empty__desc">
                            No uncommitted files detected in this workspace.
                        </p>
                    </div>
                ) : (
                    <ul className="workspace-tracking-panel__list">
                        {files.map((file) => (
                            <li key={file.path} className="workspace-tracking-panel__item">
                                <FileCode size={12} className={`workspace-tracking-panel__icon workspace-tracking-panel__icon--${file.status}`} />
                                <div className="workspace-tracking-panel__info">
                                    <span className="workspace-tracking-panel__path" title={file.path}>
                                        {file.path.split('/').pop()}
                                    </span>
                                    {file.path.includes('/') ? (
                                        <span className="workspace-tracking-panel__dir">
                                            {file.path.slice(0, file.path.lastIndexOf('/'))}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="workspace-tracking-panel__stats">
                                    {file.added > 0 ? <span className="workspace-tracking-panel__added">+{file.added}</span> : null}
                                    {file.removed > 0 ? <span className="workspace-tracking-panel__removed">-{file.removed}</span> : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
