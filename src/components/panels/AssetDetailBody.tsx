import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'
import { displayUrn, getAssetUrn, normalizeAuthor } from './asset-library-utils'

export default function AssetDetailBody({
    asset,
    loading,
    installed,
}: {
    asset: any
    loading: boolean
    installed?: boolean
}) {
    if (!asset) {
        return null
    }

    const author = normalizeAuthor(asset.author)
    const urn = getAssetUrn(asset)
    const tags = Array.isArray(asset.tags) ? asset.tags : []
    const inlineContent = asset.body || asset.instructions || asset.content
    const participantCount = asset.participantCount || (Array.isArray(asset.participants) ? asset.participants.length : 0)
    const relationCount = Array.isArray(asset.relations) ? asset.relations.length : 0
    const hasStructuredDetail = !!inlineContent
        || !!asset.talUrn
        || (Array.isArray(asset.danceUrns) && asset.danceUrns.length > 0)
        || !!asset.model
        || participantCount > 0
        || relationCount > 0
    const summaryOnly = asset.source === 'registry' && !loading && !hasStructuredDetail

    return (
        <>
            <div className="asset-popover__meta">
                {author || asset.providerName || asset.status || 'Local'}
                {asset.kind && ` · ${asset.kind}`}
                {asset.source && (
                    <span className={`source-badge ${asset.source}`} style={{ marginLeft: 6 }}>
                        {asset.source}
                    </span>
                )}
                {installed && asset.source !== 'stage' && asset.source !== 'global' && (
                    <span className="asset-detail-panel__badge">Installed</span>
                )}
            </div>

            {urn && <div className="asset-popover__urn">{urn}</div>}

            <div className="asset-popover__desc">
                {asset.description || asset.desc || 'No description available.'}
            </div>

            {loading && <div className="asset-popover__section-item">Loading details...</div>}

            {summaryOnly && !loading && (
                <div className="asset-detail-panel__note">
                    Registry preview shows summary metadata only. Install the asset to inspect full content.
                </div>
            )}

            {inlineContent && (
                <div className="asset-popover__section">
                    <div className="section-title">
                        {asset.kind === 'tal' ? 'Instructions' : asset.kind === 'dance' ? 'Skills' : 'Content'}
                    </div>
                    <div className="asset-popover__content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {inlineContent}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            {tags.length > 0 && (
                <div className="asset-popover__tags">
                    {tags.map((tag: string) => (
                        <span key={tag} className="asset-popover__tag">{tag}</span>
                    ))}
                </div>
            )}

            {asset.kind === 'performer' && (
                <>
                    {asset.talUrn && (
                        <div className="asset-popover__section">
                            <div className="section-title">Tal</div>
                            <div className="asset-popover__section-item">{displayUrn(asset.talUrn)}</div>
                        </div>
                    )}
                    {Array.isArray(asset.danceUrns) && asset.danceUrns.length > 0 && (
                        <div className="asset-popover__section">
                            <div className="section-title">Dances ({asset.danceUrns.length})</div>
                            {asset.danceUrns.map((danceUrn: string) => (
                                <div key={danceUrn} className="asset-popover__section-item">{displayUrn(danceUrn)}</div>
                            ))}
                        </div>
                    )}
                    {asset.model && (
                        <div className="asset-popover__section">
                            <div className="section-title">Model</div>
                            <div className="asset-popover__section-item">
                                {typeof asset.model === 'string' ? asset.model : asset.model.modelId}
                            </div>
                        </div>
                    )}
                </>
            )}

            {asset.kind === 'act' && (
                <div className="asset-popover__section">
                    <div className="section-title">Act Summary</div>
                    <div className="asset-popover__section-item">Participants: {participantCount}</div>
                    <div className="asset-popover__section-item">Relations: {relationCount}</div>
                </div>
            )}

            {asset.kind === 'model' && (
                <div className="asset-popover__section">
                    <div className="section-title">Details</div>
                    {asset.context && <div className="asset-popover__section-item">Context: {Math.round(asset.context / 1000)}k tokens</div>}
                    <div className="asset-popover__section-item">Status: {asset.connected ? 'Ready' : 'Not Configured'}</div>
                    <div className="asset-popover__section-item">Tools: {asset.toolCall ? 'Yes' : 'No'}</div>
                    <div className="asset-popover__section-item">Attachments: {asset.attachment ? 'Yes' : 'No'}</div>
                    {asset.modalities && (
                        <div className="asset-popover__section-item">
                            I/O: {(asset.modalities.input || []).join(', ') || 'text'} / {(asset.modalities.output || []).join(', ') || 'text'}
                        </div>
                    )}
                </div>
            )}

            {asset.kind === 'mcp' && (
                <>
                    <div className="asset-popover__section">
                        <div className="section-title">Capabilities</div>
                        <div className="asset-popover__section-item">Status: {asset.status || 'unknown'}</div>
                        <div className="asset-popover__section-item">{asset.tools?.length || 0} Tools</div>
                        <div className="asset-popover__section-item">{asset.resources?.length || 0} Resources</div>
                        {asset.authStatus === 'needs_auth' && <div className="asset-popover__section-item">Authentication required</div>}
                        {asset.clientRegistrationRequired && <div className="asset-popover__section-item">OAuth client registration required</div>}
                        {asset.error && <div className="asset-popover__section-item">{asset.error}</div>}
                    </div>
                    {Array.isArray(asset.tools) && asset.tools.length > 0 && (
                        <div className="asset-popover__section">
                            <div className="section-title">Tools</div>
                            {asset.tools.slice(0, 8).map((tool: any) => (
                                <div key={tool.name} className="asset-popover__section-item">
                                    {tool.name}{tool.description ? ` · ${tool.description}` : ''}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </>
    )
}
