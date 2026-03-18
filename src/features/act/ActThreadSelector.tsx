/**
 * ActThreadSelector — Thread list and creation for Act.
 *
 * Shows threads for the current Act with status indicators.
 * Allows creating new threads and selecting active thread.
 */
import { useState, useCallback, useEffect } from 'react'
import { Plus, Workflow, Circle, CheckCircle, Pause } from 'lucide-react'
import { useStudioStore } from '../../store'
import './ActChatPanel.css'

interface ActThreadSelectorProps {
    actId: string
}

export default function ActThreadSelector({ actId }: ActThreadSelectorProps) {
    const {
        actThreads, activeThreadId,
        createThread, selectThread, loadThreads,
    } = useStudioStore()

    const threads = actThreads[actId] || []
    const [creating, setCreating] = useState(false)

    // Load threads on mount
    useEffect(() => {
        loadThreads(actId).catch(() => {})
    }, [actId, loadThreads])

    const handleCreate = useCallback(async () => {
        setCreating(true)
        try {
            await createThread(actId)
        } catch (err) {
            console.error('Failed to create thread', err)
        } finally {
            setCreating(false)
        }
    }, [actId, createThread])

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active':
                return <Circle size={8} className="act-thread-icon act-thread-icon--active" />
            case 'completed':
                return <CheckCircle size={8} className="act-thread-icon act-thread-icon--completed" />
            case 'interrupted':
                return <Pause size={8} className="act-thread-icon act-thread-icon--interrupted" />
            default:
                return <Circle size={8} className="act-thread-icon act-thread-icon--idle" />
        }
    }

    const formatDate = (ts: number) => {
        const d = new Date(ts)
        return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="act-threads">
            <div className="act-threads__header">
                <Workflow size={12} />
                <span>Threads</span>
                <button
                    className="act-threads__create-btn"
                    onClick={handleCreate}
                    disabled={creating}
                    title="New Thread"
                >
                    <Plus size={11} />
                </button>
            </div>

            <div className="act-threads__list">
                {threads.length === 0 ? (
                    <div className="act-threads__empty">
                        <span>No threads yet</span>
                        <button className="act-threads__first-btn" onClick={handleCreate} disabled={creating}>
                            <Plus size={10} /> Create first thread
                        </button>
                    </div>
                ) : (
                    threads.map((thread) => (
                        <button
                            key={thread.id}
                            className={`act-threads__item ${thread.id === activeThreadId ? 'act-threads__item--active' : ''}`}
                            onClick={() => selectThread(thread.id)}
                        >
                            {getStatusIcon(thread.status)}
                            <span className="act-threads__item-id">{thread.id.slice(0, 8)}</span>
                            <span className="act-threads__item-date">{formatDate(thread.createdAt)}</span>
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}
