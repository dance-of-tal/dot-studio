import ActChatPanel from './ActChatPanel'

type ActSurfacePanelProps = {
    actId: string
}

export default function ActSurfacePanel({
    actId,
}: ActSurfacePanelProps) {
    return <ActChatPanel actId={actId} />
}
