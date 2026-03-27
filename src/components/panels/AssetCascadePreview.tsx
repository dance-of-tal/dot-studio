import type { AssetPanelAsset, LibraryAsset } from './asset-panel-types'
import { useResolvedAssetDetail } from './useResolvedAssetDetail'
import {
    extractInlineAssetContent,
    getActCascadeParticipants,
    getActCascadeRelations,
    getActRules,
    getPerformerCascadeReferences,
    getPerformerSummary,
    summarizeMarkdown,
    type CascadeReference,
} from './asset-detail-cascade'

function CascadeReferenceNode({
    reference,
    subtitle,
    level = 0,
}: {
    reference: CascadeReference
    subtitle?: string | null
    level?: number
}) {
    const { resolvedAsset, loading } = useResolvedAssetDetail(reference.stub)
    const asset = (resolvedAsset || reference.stub) as LibraryAsset | null
    const title = asset?.name || reference.label
    const kind = asset?.kind || reference.kind
    const preview = summarizeMarkdown(extractInlineAssetContent(asset))
    const performerSummary = asset?.kind === 'performer' ? getPerformerSummary(asset) : null
    const children = asset?.kind === 'performer' ? getPerformerCascadeReferences(asset) : []

    return (
        <div className="asset-cascade__node" data-kind={kind} data-level={level}>
            <div className="asset-cascade__header">
                <span className={`asset-cascade__kind asset-cascade__kind--${kind}`}>{kind}</span>
                <span className="asset-cascade__title">{title}</span>
            </div>
            {subtitle ? <div className="asset-cascade__meta">{subtitle}</div> : null}
            {performerSummary ? <div className="asset-cascade__meta">{performerSummary}</div> : null}
            {preview ? <div className="asset-cascade__excerpt">{preview}</div> : null}
            {loading && !preview && !performerSummary ? (
                <div className="asset-cascade__meta">Loading details...</div>
            ) : null}
            {children.length > 0 ? (
                <div className="asset-cascade__children">
                    {children.map((child, index) => (
                        <CascadeReferenceNode
                            key={`${child.kind}:${child.stub?.urn || child.label}:${index}`}
                            reference={child}
                            level={level + 1}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    )
}

export function PerformerCascadePreview({ asset }: { asset: AssetPanelAsset }) {
    const references = getPerformerCascadeReferences(asset)

    if (references.length === 0) {
        return <div className="asset-cascade__empty">No linked Tal or Dance assets.</div>
    }

    return (
        <div className="asset-cascade">
            {references.map((reference, index) => (
                <CascadeReferenceNode
                    key={`${reference.kind}:${reference.stub?.urn || reference.label}:${index}`}
                    reference={reference}
                />
            ))}
        </div>
    )
}

export function ActCascadePreview({ asset }: { asset: AssetPanelAsset }) {
    const participants = getActCascadeParticipants(asset)
    const relations = getActCascadeRelations(asset)
    const actRules = getActRules(asset)

    return (
        <div className="asset-cascade asset-cascade--act">
            <div className="asset-cascade__group">
                <div className="asset-cascade__group-title">Participants</div>
                {participants.length > 0 ? (
                    participants.map((participant, index) => (
                        <CascadeReferenceNode
                            key={`${participant.key}:${participant.performer.stub?.urn || participant.performer.label}:${index}`}
                            reference={participant.performer}
                            subtitle={[
                                `key: ${participant.key}`,
                                ...participant.subscriptions,
                            ].join(' · ')}
                        />
                    ))
                ) : (
                    <div className="asset-cascade__empty">No participants defined.</div>
                )}
            </div>

            <div className="asset-cascade__group">
                <div className="asset-cascade__group-title">Relations</div>
                {relations.length > 0 ? (
                    <div className="asset-cascade__relations">
                        {relations.map((relation, index) => (
                            <div key={`${relation.name}:${relation.between.join(':')}:${index}`} className="asset-cascade__relation">
                                <div className="asset-cascade__relation-title">
                                    {relation.name}
                                    <span className="asset-cascade__relation-path">
                                        {relation.between[0]} {relation.direction === 'one-way' ? '->' : '<->'} {relation.between[1]}
                                    </span>
                                </div>
                                {relation.description ? (
                                    <div className="asset-cascade__relation-desc">{relation.description}</div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="asset-cascade__empty">No relations defined.</div>
                )}
            </div>

            {actRules.length > 0 ? (
                <div className="asset-cascade__group">
                    <div className="asset-cascade__group-title">Act Rules</div>
                    <div className="asset-cascade__rules">
                        {actRules.map((rule) => (
                            <div key={rule} className="asset-cascade__rule">{rule}</div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
