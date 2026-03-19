import { FileText, Wand2, Zap } from 'lucide-react'
import { DOT_TOS_URL } from '../../lib/dot-terms'
import { PickerSection } from './publish-modal-utils'
import type { PickerItem } from './publish-modal-utils'

type Props = {
    pickerItems: PickerItem[]
    authUser: { authenticated?: boolean } | null | undefined
    isAuthenticating: boolean
    onPick: (item: PickerItem) => void
    onStartLogin: () => void
}

export default function PublishPickerStep({
    pickerItems,
    authUser,
    isAuthenticating,
    onPick,
    onStartLogin,
}: Props) {
    const talItems = pickerItems.filter((item) => item.kind === 'tal')
    const danceItems = pickerItems.filter((item) => item.kind === 'dance')
    const performerItems = pickerItems.filter((item) => item.kind === 'performer')
    const actItems = pickerItems.filter((item) => item.kind === 'act')

    return (
        <div className="publish-modal__body">
            {pickerItems.length === 0 ? (
                <div className="publish-modal__empty">
                    No publishable assets. Create or customize a Tal, Dance, Performer, or Act on the canvas to get started.
                </div>
            ) : (
                <>
                    {talItems.length > 0 && (
                        <PickerSection title="Tal" items={talItems} onPick={onPick} icon={<FileText size={12} />} />
                    )}
                    {danceItems.length > 0 && (
                        <PickerSection title="Dance" items={danceItems} onPick={onPick} icon={<FileText size={12} />} />
                    )}
                    {performerItems.length > 0 && (
                        <PickerSection title="Performers" items={performerItems} onPick={onPick} icon={<Wand2 size={12} />} />
                    )}
                    {actItems.length > 0 && (
                        <PickerSection title="Acts" items={actItems} onPick={onPick} icon={<Zap size={12} />} />
                    )}
                </>
            )}

            {!authUser?.authenticated && (
                <div className="publish-modal__auth-callout">
                    <div>
                        <strong>DOT sign-in required</strong>
                        <p>
                            Save Local and Publish use your DOT namespace.
                            By signing in, you agree to the Dance of Tal Terms of Service:
                            {' '}
                            <a href={DOT_TOS_URL} target="_blank" rel="noreferrer">{DOT_TOS_URL}</a>
                        </p>
                    </div>
                    <button
                        className="publish-modal__action publish-modal__action--auth"
                        onClick={onStartLogin}
                        disabled={isAuthenticating}
                    >
                        {isAuthenticating ? 'Signing in…' : 'Sign in'}
                    </button>
                </div>
            )}
        </div>
    )
}
