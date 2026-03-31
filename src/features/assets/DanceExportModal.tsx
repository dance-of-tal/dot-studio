import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FolderOpen, Upload, X } from 'lucide-react'
import { api } from '../../api'
import { coerceStudioApiError, formatStudioApiErrorMessage } from '../../lib/api-errors'
import { nameToSlug } from './markdown-authoring'
import type { DraftAsset } from '../../types'

const EXPORT_EXISTS_PREFIX = 'Export destination already exists: '

type ExportResponse = Awaited<ReturnType<typeof api.dot.exportDanceBundle>>

type Props = {
    open: boolean
    draft: DraftAsset
    onClose: () => void
}

function previewExportPath(destinationParentPath: string | null, slug: string) {
    if (!destinationParentPath) return `${slug}/`
    const trimmedParent = destinationParentPath.replace(/\/+$/, '')
    return trimmedParent ? `${trimmedParent}/${slug}` : `/${slug}`
}

export default function DanceExportModal({ open, draft, onClose }: Props) {
    const [destinationParentPath, setDestinationParentPath] = useState<string | null>(null)
    const [exportInfo, setExportInfo] = useState<ExportResponse | null>(null)
    const [status, setStatus] = useState<null | { tone: 'success' | 'error'; message: string }>(null)
    const [overwriteTargetPath, setOverwriteTargetPath] = useState<string | null>(null)
    const [loading, setLoading] = useState<null | 'pick' | 'export'>(null)

    const slug = useMemo(() => {
        const current = typeof draft.slug === 'string' && draft.slug.trim() ? draft.slug : nameToSlug(draft.name)
        return current
    }, [draft.name, draft.slug])

    useEffect(() => {
        if (!open) {
            setDestinationParentPath(null)
            setExportInfo(null)
            setStatus(null)
            setOverwriteTargetPath(null)
            setLoading(null)
        }
    }, [open])

    if (!open) return null

    const resolvedExportPath = previewExportPath(destinationParentPath, slug)

    const chooseDestination = async () => {
        try {
            setLoading('pick')
            const result = await api.studio.pickDirectory('Select Parent Folder for Dance Export')
            if (!result.path) return
            setDestinationParentPath(result.path)
            setExportInfo(null)
            setStatus(null)
            setOverwriteTargetPath(null)
        } catch (error) {
            const normalized = coerceStudioApiError(error)
            if (normalized.message === 'Selection cancelled or failed') {
                return
            }
            setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
        } finally {
            setLoading(null)
        }
    }

    const handleExport = async (overwrite = false) => {
        if (!destinationParentPath) return
        try {
            setLoading('export')
            setStatus(null)
            const result = await api.dot.exportDanceBundle(draft.id, slug, destinationParentPath, overwrite)
            setExportInfo(result)
            setOverwriteTargetPath(null)
            setStatus({ tone: 'success', message: `Exported Dance bundle to ${result.exportPath}.` })
        } catch (error) {
            const normalized = coerceStudioApiError(error)
            if (normalized.message.startsWith(EXPORT_EXISTS_PREFIX)) {
                setOverwriteTargetPath(normalized.message.slice(EXPORT_EXISTS_PREFIX.length))
                setStatus({
                    tone: 'error',
                    message: 'A folder with this Dance slug already exists. Review the path, then confirm overwrite to replace it.',
                })
            } else {
                setStatus({ tone: 'error', message: formatStudioApiErrorMessage(error, false) })
            }
        } finally {
            setLoading(null)
        }
    }

    return (
        <div className="dance-export-modal__backdrop" onClick={onClose}>
            <div className="dance-export-modal" onClick={(event) => event.stopPropagation()}>
                <div className="dance-export-modal__header">
                    <div>
                        <strong>Export Dance</strong>
                        <p>Export a spec-aligned skill bundle to a folder you choose. Push it to GitHub yourself, then import it from Asset Library as Dance.</p>
                    </div>
                    <button className="icon-btn" onClick={onClose} title="Close export dialog">
                        <X size={12} />
                    </button>
                </div>

                <div className="dance-export-modal__body">
                    <section className="dance-export-modal__section">
                        <div className="dance-export-modal__section-title">Bundle Details</div>
                        <div className="dance-export-modal__meta">
                            <div><span>Dance</span><strong>{draft.name || 'Untitled Dance'}</strong></div>
                            <div><span>Slug</span><strong>{slug}</strong></div>
                            <div><span>Destination Folder</span><strong>{destinationParentPath || 'Choose a parent folder'}</strong></div>
                            <div><span>Export Path</span><strong>{resolvedExportPath}</strong></div>
                        </div>
                    </section>

                    <section className="dance-export-modal__section">
                        <div className="dance-export-modal__section-title">Export</div>
                        <p>Studio will export this draft to a new <code>{slug}</code> folder under the parent directory you choose. The exported bundle excludes Studio-only draft metadata.</p>
                        <div className="dance-export-modal__actions">
                            <button className="btn btn--sm dance-export-modal__action-btn" onClick={() => void chooseDestination()} disabled={loading === 'pick'}>
                                <FolderOpen size={12} /> {loading === 'pick' ? 'Choosing…' : destinationParentPath ? 'Change Folder' : 'Choose Folder'}
                            </button>
                            <button
                                className="btn btn--primary btn--sm dance-export-modal__action-btn"
                                onClick={() => void handleExport(!!overwriteTargetPath)}
                                disabled={!destinationParentPath || loading === 'export'}
                            >
                                <Upload size={12} /> {loading === 'export' ? 'Exporting…' : overwriteTargetPath ? 'Overwrite Export' : 'Export Dance'}
                            </button>
                            {exportInfo?.exportPath ? (
                                <button className="btn btn--sm dance-export-modal__action-btn" onClick={() => void api.studio.openPath(exportInfo.exportPath)}>
                                    <ExternalLink size={12} /> Open Folder
                                </button>
                            ) : null}
                        </div>
                        {overwriteTargetPath ? (
                            <div className="dance-export-modal__warning">
                                Existing folder: <code>{overwriteTargetPath}</code>
                            </div>
                        ) : null}
                    </section>

                    <section className="dance-export-modal__section">
                        <div className="dance-export-modal__section-title">Next Steps</div>
                        <p>After export, commit and push this folder to GitHub yourself. Then use Asset Library’s GitHub import row to install the Dance, and re-apply that installed Dance where needed.</p>
                    </section>

                    {status ? (
                        <div className={`dance-export-modal__status dance-export-modal__status--${status.tone}`}>
                            {status.message}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
