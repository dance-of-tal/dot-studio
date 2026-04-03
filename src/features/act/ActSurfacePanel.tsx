import { useStudioStore } from '../../store'
import ActChatPanel from './ActChatPanel'
import ActInspectorPanel from './ActInspectorPanel'

type ActSurfacePanelProps = {
    actId: string
}

export default function ActSurfacePanel({
    actId,
}: ActSurfacePanelProps) {
    const isEditing = useStudioStore((state) => state.actEditorState?.actId === actId)

    if (isEditing) {
        return (
            <div className="act-frame__edit-body">
                <ActInspectorPanel embedded />
            </div>
        )
    }

    return <ActChatPanel actId={actId} />
}
