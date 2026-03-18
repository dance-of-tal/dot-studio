import { useStudioStore } from '../../store'

export function handleAssistantToolCall(_callId: string, name: string, args: Record<string, any>) {
    const store = useStudioStore.getState()
    
    console.log(`[Assistant Tool] Executing ${name}`, args)
    
    try {
        switch (name) {
            // ── Canvas mutation tools ──
            case 'assistant_create_performer': {
                store.addPerformer(args.name)
                return { success: true, action: 'createPerformer' }
            }
            case 'assistant_create_act': {
                store.addAct(args.name)
                return { success: true, action: 'createAct' }
            }
            case 'assistant_add_performer_to_act': {
                // In the choreography model, we bind a performer ref to an act
                const performer = store.performers.find((p: any) => p.id === args.performerId)
                if (performer) {
                    const ref = performer.meta?.derivedFrom
                        ? { kind: 'registry' as const, urn: performer.meta.derivedFrom }
                        : { kind: 'draft' as const, draftId: args.performerId }
                    store.bindPerformerToAct(args.actId, ref)
                }
                return { success: true, action: 'addPerformerToAct' }
            }
            case 'assistant_connect_performers': {
                store.addRelation(args.actId, [args.sourcePerformerId, args.targetPerformerId], 'both')
                return { success: true, action: 'connectPerformers' }
            }
            case 'assistant_set_performer_model': {
                store.setPerformerModel(args.performerId, {
                    provider: args.providerId,
                    modelId: args.modelId
                })
                return { success: true, action: 'setPerformerModel' }
            }
            case 'assistant_set_performer_tal': {
                // Set Tal by URN — use AssetRef with kind='registry'
                store.setPerformerTalRef(args.performerId, 
                    args.talUrn ? { kind: 'registry', urn: args.talUrn } : null
                )
                return { success: true, action: 'setPerformerTal' }
            }
            case 'assistant_add_performer_dance': {
                // Add Dance by URN — use AssetRef with kind='registry'
                store.addPerformerDanceRef(args.performerId, { kind: 'registry', urn: args.danceUrn })
                return { success: true, action: 'addPerformerDance' }
            }
            case 'assistant_add_performer_mcp': {
                // Add MCP server by name
                store.addPerformerMcp(args.performerId, { name: args.mcpServerName } as any)
                return { success: true, action: 'addPerformerMcp' }
            }

            // ── Informational tools (no canvas mutation, just acknowledged) ──
            case 'assistant_explain_feature':
            case 'assistant_list_canvas_state':
            case 'assistant_suggest_setup': {
                // These tools return text/suggestions — no store mutation needed.
                // The LLM response text will contain the explanation/suggestion.
                return { success: true, action: name.replace('assistant_', ''), informational: true }
            }
            default:
                console.warn(`[Assistant Tool] Unknown tool call: ${name}`)
                return { success: false, error: 'Unknown tool' }
        }
    } catch (err) {
        console.error(`[Assistant Tool] Failed to execute ${name}:`, err)
        return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
}
