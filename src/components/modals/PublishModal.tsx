import { X, Upload, Save, ChevronLeft } from 'lucide-react'
import './PublishModal.css'
import PublishPickerStep from './PublishPickerStep'
import PublishFormStep from './PublishFormStep'
import { usePublishModalController } from './usePublishModalController'

export default function PublishModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const controller = usePublishModalController(open)

    if (!open) {
        return null
    }

    return (
        <div className="publish-modal__backdrop" onClick={onClose}>
            <div className="publish-modal" onClick={(event) => event.stopPropagation()}>
                <div className="publish-modal__header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {controller.step === 'form' ? (
                            <button className="icon-btn" onClick={controller.handleBack} title="Back to asset list">
                                <ChevronLeft size={14} />
                            </button>
                        ) : null}
                        <div>
                            <strong>Publish</strong>
                            <p>
                                {controller.step === 'picker'
                                    ? 'Select a Tal, Performer, or Act to save or publish.'
                                    : controller.target ? `${controller.target.kind} · ${controller.target.name}` : ''}
                            </p>
                        </div>
                    </div>
                    <button className="icon-btn" onClick={onClose} title="Close publish menu">
                        <X size={12} />
                    </button>
                </div>

                {controller.step === 'picker' ? (
                    <PublishPickerStep
                        pickerItems={controller.pickerItems}
                        authUser={controller.authUser}
                        isAuthenticating={controller.isAuthenticating}
                        onPick={controller.handlePickItem}
                        onStartLogin={() => {
                            void controller.startLogin(true)
                        }}
                    />
                ) : (
                    <PublishFormStep
                        slug={controller.slug}
                        stage={controller.stage}
                        description={controller.description}
                        tagsText={controller.tagsText}
                        setSlug={controller.setSlug}
                        setStage={controller.setStage}
                        setDescription={controller.setDescription}
                        setTagsText={controller.setTagsText}
                        performerPreflight={controller.performerPreflight}
                        markdownEditor={controller.markdownEditor}
                        markdownDirty={controller.markdownDirty}
                        draft={controller.draft}
                        authUser={controller.authUser}
                        isAuthenticating={controller.isAuthenticating}
                        onStartLogin={() => {
                            void controller.startLogin(true)
                        }}
                        status={controller.status}
                        publishBlockedReason={controller.publishBlockedReason}
                    />
                )}

                {controller.step === 'form' ? (
                    <div className="publish-modal__footer">
                        <button className="publish-modal__action" onClick={controller.handleSaveLocal} disabled={!controller.canSaveLocal || !!controller.isLocalAsset}>
                            <Save size={11} /> {controller.action === 'save-local' ? 'Saving…' : 'Save Local'}
                        </button>
                        <button className="publish-modal__action publish-modal__action--primary" onClick={controller.handlePublish} disabled={!controller.canPublish}>
                            <Upload size={11} /> {controller.action === 'publish' ? 'Publishing…' : 'Publish'}
                        </button>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
