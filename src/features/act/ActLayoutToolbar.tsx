import { useMemo } from 'react'
import { useStudioStore } from '../../store'

export default function ActLayoutToolbar() {
    const { acts, layoutActId, exitActLayoutMode } = useStudioStore()

    const act = useMemo(
        () => acts.find((entry) => entry.id === layoutActId) || null,
        [acts, layoutActId],
    )

    if (!layoutActId || !act) return null

    const performerCount = Object.keys(act.performers).length
    const relationCount = act.relations?.length || 0

    return (
        <div className="act-layout-toolbar">
            <div className="act-layout-toolbar__left">
                <span className="act-layout-toolbar__icon">⚡</span>
                <span className="act-layout-toolbar__name">{act.name || 'Act Layout'}</span>
                <span className="act-layout-toolbar__badge">{performerCount}p · {relationCount}r</span>
                {performerCount === 0 && (
                    <span className="act-layout-toolbar__hint">
                        ← Drag performers from the Asset Library to add them to this act
                    </span>
                )}
                {performerCount > 0 && performerCount < 2 && (
                    <span className="act-layout-toolbar__hint">
                        Drag another performer to grow this act
                    </span>
                )}
                {performerCount >= 2 && relationCount === 0 && (
                    <span className="act-layout-toolbar__hint">
                        Connect participants by dragging from one handle to another
                    </span>
                )}
            </div>
            <div className="act-layout-toolbar__right">
                <button
                    className="act-layout-toolbar__btn act-layout-toolbar__btn--exit"
                    onClick={() => exitActLayoutMode()}
                >
                    Exit Advanced Layout
                </button>
            </div>
        </div>
    )
}
