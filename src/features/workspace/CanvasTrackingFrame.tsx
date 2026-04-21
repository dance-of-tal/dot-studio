import { useEffect, useState } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Activity, FileCode, X } from 'lucide-react'
import { api } from '../../api'
import type { FileStatus } from '../../types'
import CanvasWindowFrame from '../../components/canvas/CanvasWindowFrame'
import './CanvasTrackingFrame.css'

type CanvasTrackingFrameData = {
    title: string
    width: number
    height: number
    onClose: () => void
    onResize: (width: number, height: number) => void
    transformActive?: boolean
    onActivateTransform?: () => void
    onDeactivateTransform?: () => void
}

export default function CanvasTrackingFrame({ data }: NodeProps<Node<CanvasTrackingFrameData, 'stageTracking'>>) {
    const { title, width, height, onClose } = data
    const transformActive = !!data.transformActive
    const onActivateTransform = data.onActivateTransform
    const onDeactivateTransform = data.onDeactivateTransform
    const [files, setFiles] = useState<FileStatus[]>([])
    const isClean = files.length === 0
    const statusLabel = isClean ? 'Clean' : `${files.length} file${files.length === 1 ? '' : 's'}`

    useEffect(() => {
        const fetchFiles = async () => {
            try {
                const res = await api.file.status()
                setFiles(res || [])
            } catch {
                setFiles([])
            }
        }
        fetchFiles()
        const interval = setInterval(fetchFiles, 10000)
        return () => clearInterval(interval)
    }, [])

    return (
        <CanvasWindowFrame
            className="canvas-tracking-frame"
            width={width}
            height={height}
            transformActive={transformActive}
            onActivateTransform={onActivateTransform}
            onDeactivateTransform={onDeactivateTransform}
            minWidth={360}
            minHeight={240}
            headerStart={(
                <>
                    <Activity size={12} />
                    <span className="canvas-frame__name">{title}</span>
                    <span
                        className={`badge badge--subtle canvas-tracking-frame__status ${isClean ? 'canvas-tracking-frame__status--clean' : ''}`.trim()}
                    >
                        {statusLabel}
                    </span>
                </>
            )}
            headerEnd={(
                <button
                    className="icon-btn"
                    onClick={(e) => { e.stopPropagation(); onClose() }}
                    title="Close stage tracking"
                >
                    <X size={12} />
                </button>
            )}
            bodyClassName="scroll-area"
        >
            {files.length === 0 ? (
                <div className="canvas-tracking-frame__empty">No uncommitted files detected.</div>
            ) : (
                <ul className="canvas-tracking-frame__list">
                    {files.map((file) => (
                        <li key={file.path} className="canvas-tracking-frame__item">
                            <FileCode size={12} className={`canvas-tracking-frame__icon canvas-tracking-frame__icon--${file.status}`} />
                            <div className="canvas-tracking-frame__info">
                                <span className="canvas-tracking-frame__path" title={file.path}>
                                    {file.path.split('/').pop()}
                                </span>
                                {file.path.includes('/') ? (
                                    <span className="canvas-tracking-frame__dir">
                                        {file.path.slice(0, file.path.lastIndexOf('/'))}
                                    </span>
                                ) : null}
                            </div>
                            <div className="canvas-tracking-frame__stats">
                                {file.added > 0 ? <span className="canvas-tracking-frame__added">+{file.added}</span> : null}
                                {file.removed > 0 ? <span className="canvas-tracking-frame__removed">-{file.removed}</span> : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </CanvasWindowFrame>
    )
}
