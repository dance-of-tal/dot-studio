import { useMemo } from 'react'
import {
    buildAssetCardMap,
    buildMcpServerMap,
    resolvePerformerPresentation,
    resolvePerformerRuntimeConfig,
} from '../lib/performers'
import { useRuntimeTools } from './queries'
import type { PerformerNode, DraftAsset, AssetCard, McpServer } from '../types'

const EMPTY_PRESENTATION = {
    talAsset: null,
    danceAssets: [] as ReturnType<typeof resolvePerformerPresentation>['danceAssets'],
    mcpServers: [] as ReturnType<typeof resolvePerformerPresentation>['mcpServers'],
    mcpPlaceholders: [] as string[],
    mappedMcpPlaceholders: [] as ReturnType<typeof resolvePerformerPresentation>['mappedMcpPlaceholders'],
    declaredMcpServerNames: [] as string[],
}

/**
 * Resolves a performer's presentation (attached assets, MCP servers)
 * and runtime config in one hook. Replaces duplicated useMemo blocks
 * in AgentFrame and ActAreaFrame.
 */
export function usePerformerPresentation(
    performer: PerformerNode | null,
    assets: AssetCard[],
    mcpServers: McpServer[],
    drafts: Record<string, DraftAsset>,
    opts?: { enableTools?: boolean },
) {
    const presentation = useMemo(() => (
        performer
            ? resolvePerformerPresentation(
                performer,
                buildAssetCardMap(assets),
                buildMcpServerMap(mcpServers),
                drafts,
            )
            : EMPTY_PRESENTATION
    ), [assets, drafts, mcpServers, performer])

    const runtimeConfig = useMemo(
        () => performer ? resolvePerformerRuntimeConfig(performer) : null,
        [performer],
    )

    const { data: runtimeTools } = useRuntimeTools(
        runtimeConfig?.model || null,
        runtimeConfig?.mcpServerNames || [],
        (opts?.enableTools ?? true) && !!runtimeConfig,
    )

    return { presentation, runtimeConfig, runtimeTools }
}
