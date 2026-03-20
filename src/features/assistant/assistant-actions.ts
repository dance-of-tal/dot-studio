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
                store.attachPerformerToAct(args.actId, args.performerId)
                return { success: true, action: 'addPerformerToAct' }
            }
            case 'assistant_connect_performers': {
                if (args.actId) {
                    const sourceKey = store.attachPerformerToAct(args.actId, args.sourcePerformerId)
                    const targetKey = store.attachPerformerToAct(args.actId, args.targetPerformerId)
                    if (sourceKey && targetKey && sourceKey !== targetKey) {
                        store.addRelation(args.actId, [sourceKey, targetKey], 'both')
                    }
                    return { success: true, action: 'connectPerformers' }
                }
                return {
                    success: false,
                    action: 'connectPerformers',
                    error: 'An Act must be created explicitly before connecting performers.',
                }
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
