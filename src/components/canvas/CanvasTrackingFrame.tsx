import { useEffect, useState } from 'react'
import { Activity, FileCode, X } from 'lucide-react'
import { api } from '../../api'
import type { FileStatus } from '../../types'
import './CanvasTrackingFrame.css'

interface CanvasTrackingFrameProps {
    data: {
        title: string
        width: number
        height: number
        onClose: () => void
        onResize: (width: number, height: number) => void
    }
}

export default function CanvasTrackingFrame({ data }: CanvasTrackingFrameProps) {
    const { title, width, height, onClose, onResize } = data
    const [files, setFiles] = useState<FileStatus[]>([])

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

    const handleResizeStart = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const startX = e.clientX
        const startY = e.clientY
        const startW = width
        const startH = height

        const onMove = (me: MouseEvent) => {
            const newW = Math.max(360, startW + (me.clientX - startX))
            const newH = Math.max(240, startH + (me.clientY - startY))
            onResize(Math.round(newW), Math.round(newH))
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    return (
        <div className="canvas-tracking-frame" style={{ width, height }}>
            <div className="canvas-tracking-frame__header figma-frame__header canvas-drag-handle--interactive">
                <div className="canvas-tracking-frame__header-left">
                    <Activity size={12} />
                    <span className="canvas-tracking-frame__title">{title}</span>
                    <span className="canvas-tracking-frame__status">
                        {files.length === 0 ? 'Clean' : `${files.length} file${files.length === 1 ? '' : 's'}`}
                    </span>
                </div>
                <button
                    className="canvas-tracking-frame__close"
                    onClick={(e) => { e.stopPropagation(); onClose() }}
                    title="Close stage tracking"
                >
                    <X size={12} />
                </button>
            </div>
            <div className="canvas-tracking-frame__body figma-scroll">
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
            </div>
            <div className="canvas-tracking-frame__resize" onMouseDown={handleResizeStart} />
        </div>
    )
}
