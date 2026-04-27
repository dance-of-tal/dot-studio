import { DOT_TOS_URL } from '../../lib/dot-terms'
import type { DraftAsset, MarkdownEditorNode } from '../../types'
import type { PerformerPreflightEntry } from './publish-modal-utils'

type MarkdownDraft = Pick<DraftAsset, 'derivedFrom'>

type Props = {
    slug: string
    stage: string
    description: string
    tagsText: string
    setSlug: (value: string) => void
    setStage: (value: string) => void
    setDescription: (value: string) => void
    setTagsText: (value: string) => void
    performerPreflight: PerformerPreflightEntry[]
    markdownEditor: MarkdownEditorNode | null
    markdownDirty: boolean
    draft: MarkdownDraft | null
    authUser: { authenticated?: boolean } | null | undefined
    isAuthenticating: boolean
    onStartLogin: () => void
    status: null | { tone: 'success' | 'error'; message: string }
    publishBlockedReason: string | null
}

export default function PublishFormStep({
    slug,
    stage,
    description,
    tagsText,
    setSlug,
    setStage,
    setDescription,
    setTagsText,
    performerPreflight,
    markdownEditor,
    markdownDirty,
    draft,
    authUser,
    isAuthenticating,
    onStartLogin,
    status,
    publishBlockedReason,
}: Props) {
    return (
        <div className="publish-modal__body">
            <div className="publish-modal__grid">
                <label className="publish-modal__field">
                    <span>Stage</span>
                    <input className="text-input" value={stage} onChange={(event) => setStage(event.target.value)} />
                </label>
                <label className="publish-modal__field">
                    <span>Slug</span>
                    <input className="text-input" value={slug} onChange={(event) => setSlug(event.target.value)} />
                </label>
                <label className="publish-modal__field">
                    <span>Description</span>
                    <input className="text-input" value={description} onChange={(event) => setDescription(event.target.value)} />
                </label>
            </div>

            <label className="publish-modal__field">
                <span>Tags</span>
                <input className="text-input" value={tagsText} onChange={(event) => setTagsText(event.target.value)} placeholder="tag, tag" />
            </label>

            {performerPreflight.length > 0 ? (
                <div className="publish-modal__preflight">
                    <strong>Performer dependencies</strong>
                    {performerPreflight.map((entry) => (
                        <div key={`${entry.label}-${entry.detail}`} className={`publish-modal__preflight-row is-${entry.status}`}>
                            <span>{entry.label}</span>
                            <span>{entry.detail}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {markdownEditor ? (
                <div className="publish-modal__preflight">
                    <strong>Markdown editor</strong>
                    <div className={`publish-modal__preflight-row ${markdownDirty ? 'is-ready' : 'is-missing'}`}>
                        <span>Change state</span>
                        <span>{markdownDirty ? 'Modified' : 'No changes since baseline'}</span>
                    </div>
                    {draft?.derivedFrom ? (
                        <div className="publish-modal__preflight-row is-ready">
                            <span>Derived from</span>
                            <span>{draft.derivedFrom}</span>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {!authUser?.authenticated ? (
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
            ) : null}

            {status ? (
                <div className={`publish-modal__status publish-modal__status--${status.tone}`}>
                    {status.message}
                </div>
            ) : null}

            {publishBlockedReason ? (
                <div className="publish-modal__status publish-modal__status--error">
                    {publishBlockedReason}
                </div>
            ) : null}
        </div>
    )
}
