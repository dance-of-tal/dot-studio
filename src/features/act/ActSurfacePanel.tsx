import ActActivityView from './ActActivityView'
import ActChatPanel from './ActChatPanel'

type ActSurfacePanelProps = {
    actId: string
    activeThreadId: string | null
    showActivity: boolean
}

export default function ActSurfacePanel({
    actId,
    activeThreadId,
    showActivity,
}: ActSurfacePanelProps) {
    if (showActivity) {
        return <ActActivityView actId={actId} threadId={activeThreadId} mode="activity" />
    }

    return <ActChatPanel actId={actId} />
}
