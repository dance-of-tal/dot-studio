/**
 * ActActivityView — Real-time event timeline for Act threads.
 * Shows callboard/runtime activity for the selected thread.
 *
 * PRD §17.2: Shows participant collaboration flow, callboard artifacts, and active participants.
 */
import { useState, useEffect, useCallback } from 'react'
import {
    Activity, MessageCircle, FileText, Clock, Bell,
    RefreshCw,
} from 'lucide-react'
import { api } from '../../api'
import './ActActivityView.css'

interface ActActivityViewProps {
    actId: string
    threadId?: string | null
    mode?: 'activity' | 'callboard'
}

interface ActivityEvent {
    id: string
    type: string
    source: string
    sourceType: string
    timestamp: number
    payload: Record<string, any>
}

export default function ActActivityView({ actId, threadId, mode = 'activity' }: ActActivityViewProps) {
    const [events, setEvents] = useState<ActivityEvent[]>([])
    const [loading, setLoading] = useState(false)

    const loadEvents = useCallback(async () => {
        if (!threadId) return
        setLoading(true)
        try {
            const result = await api.actRuntime.events(actId, threadId, 50)
            setEvents(result.events || [])
        } catch (err) {
            console.error('Failed to load act events', err)
        } finally {
            setLoading(false)
        }
    }, [actId, threadId])

    useEffect(() => {
        loadEvents()
    }, [loadEvents])

    // Auto-refresh every 5 seconds
    useEffect(() => {
        if (!threadId) return
        const interval = setInterval(loadEvents, 5000)
        return () => clearInterval(interval)
    }, [threadId, loadEvents])

    const getEventIcon = (type: string) => {
        switch (type) {
            case 'message.sent':
            case 'message.delivered':
                return <MessageCircle size={12} />
            case 'board.posted':
            case 'board.updated':
                return <FileText size={12} />
            case 'runtime.idle':
                return <Clock size={12} />
            default:
                return <Bell size={12} />
        }
    }

    const getEventDescription = (event: ActivityEvent) => {
        const { type, source, payload } = event
        switch (type) {
            case 'message.sent':
                return `${source} → send_message(to: ${payload.to}${payload.tag ? `, tag: ${payload.tag}` : ''})`
            case 'message.delivered':
                return `${payload.to} ← message delivered from ${source}`
            case 'board.posted':
                return `${source} → post_to_callboard("${payload.key}")`
            case 'board.updated':
                return `${source} → update_callboard("${payload.key}")`
            case 'runtime.idle':
                return 'Runtime idle'
            default:
                return `${source}: ${type}`
        }
    }

    const formatTime = (ts: number) => {
        const d = new Date(ts)
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    if (!threadId) {
        return (
            <div className="act-activity-view">
                <div className="act-activity-view__empty">
                    <Activity size={16} />
                    <span>{mode === 'callboard' ? 'Select a thread to view the callboard' : 'Select a thread to view activity'}</span>
                </div>
            </div>
        )
    }

    return (
        <div className="act-activity-view">
            <div className="act-activity-view__header">
                <Activity size={12} />
                <span>{mode === 'callboard' ? 'Callboard' : 'Activity'}</span>
                <button
                    className="icon-btn"
                    onClick={loadEvents}
                    disabled={loading}
                    title="Refresh"
                >
                    <RefreshCw size={10} className={loading ? 'spinning' : ''} />
                </button>
            </div>

            <div className="act-activity-view__timeline">
                {events.length === 0 ? (
                    <div className="act-activity-view__empty">
                        <span>{mode === 'callboard' ? 'No callboard activity yet' : 'No events yet'}</span>
                    </div>
                ) : (
                    events.map((event) => (
                        <div
                            key={event.id}
                            className={`act-activity-view__event act-activity-view__event--${event.type.split('.')[0]}`}
                        >
                            <div className="act-activity-view__event-icon">
                                {getEventIcon(event.type)}
                            </div>
                            <div className="act-activity-view__event-body">
                                <span className="act-activity-view__event-desc">
                                    {getEventDescription(event)}
                                </span>
                                <span className="act-activity-view__event-time">
                                    {formatTime(event.timestamp)}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
