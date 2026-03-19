import { useCallback, useEffect, useState } from 'react'

type Args = {
    performerId: string
    performer: any
    isSelected: boolean
    isFocused: boolean
    isEditMode: boolean
    refreshSafeOwner: (ownerKind: 'performer', ownerId: string) => Promise<any>
    safeSummary: any
    setPerformerExecutionMode: (performerId: string, mode: 'direct' | 'safe') => void
    detachPerformerSession: (performerId: string, notice?: string) => void
    applySafeOwner: (ownerKind: 'performer', ownerId: string) => Promise<void>
    discardSafeOwnerFile: (ownerKind: 'performer', ownerId: string, filePath: string) => Promise<void>
    discardAllSafeOwner: (ownerKind: 'performer', ownerId: string) => Promise<void>
    undoLastSafeApply: (ownerKind: 'performer', ownerId: string) => Promise<void>
}

export function usePerformerSafeReview(args: Args) {
    const {
        performerId,
        performer,
        isSelected,
        isFocused,
        isEditMode,
        refreshSafeOwner,
        safeSummary,
        setPerformerExecutionMode,
        detachPerformerSession,
        applySafeOwner,
        discardSafeOwnerFile,
        discardAllSafeOwner,
        undoLastSafeApply,
    } = args

    const [showSafeReview, setShowSafeReview] = useState(false)
    const [safeBusy, setSafeBusy] = useState(false)
    const [pendingModeSwitch, setPendingModeSwitch] = useState<'direct' | null>(null)

    useEffect(() => {
        if (performer?.executionMode !== 'safe') return
        if (!(isSelected || isFocused || isEditMode || showSafeReview)) return
        void refreshSafeOwner('performer', performerId)
    }, [performerId, isEditMode, isFocused, isSelected, performer?.executionMode, refreshSafeOwner, showSafeReview])

    const handleToggleExecutionMode = useCallback(async () => {
        if (!performer) return
        if (performer.executionMode === 'safe') {
            const summary = safeSummary || await refreshSafeOwner('performer', performerId)
            if (summary && summary.pendingCount > 0) {
                setPendingModeSwitch('direct')
                setShowSafeReview(true)
                return
            }
            setPerformerExecutionMode(performerId, 'direct')
            return
        }
        setPerformerExecutionMode(performerId, 'safe')
        void refreshSafeOwner('performer', performerId)
    }, [performer, safeSummary, refreshSafeOwner, performerId, setPerformerExecutionMode])

    const runSafeAction = useCallback(async (
        task: () => Promise<void>,
        nextMode?: 'direct',
        notice = 'Updated the safe workspace and started a new thread lineage.',
    ) => {
        setSafeBusy(true)
        try {
            await task()
            if (nextMode) {
                setPerformerExecutionMode(performerId, nextMode)
            } else {
                detachPerformerSession(performerId, notice)
            }
            void refreshSafeOwner('performer', performerId)
            setShowSafeReview(false)
            setPendingModeSwitch(null)
        } finally {
            setSafeBusy(false)
        }
    }, [detachPerformerSession, performerId, refreshSafeOwner, setPerformerExecutionMode])

    return {
        showSafeReview,
        safeBusy,
        pendingModeSwitch,
        setShowSafeReview,
        setPendingModeSwitch,
        handleToggleExecutionMode,
        applySafeReview: () => runSafeAction(() => applySafeOwner('performer', performerId), pendingModeSwitch || undefined),
        discardSafeReviewAll: () => runSafeAction(() => discardAllSafeOwner('performer', performerId), pendingModeSwitch || undefined),
        discardSafeReviewFile: (filePath: string) => runSafeAction(
            () => discardSafeOwnerFile('performer', performerId, filePath),
            undefined,
            `Discarded ${filePath} from the safe workspace and started a new thread lineage.`,
        ),
        undoSafeReviewApply: () => runSafeAction(
            () => undoLastSafeApply('performer', performerId),
            undefined,
            'Undid the last apply and started a new thread lineage.',
        ),
    }
}
