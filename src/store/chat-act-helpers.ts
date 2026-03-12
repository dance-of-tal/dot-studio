/**
 * Act Session helpers extracted from chatSlice.
 *
 * Contains all logic for act session CRUD, act-level messaging,
 * and act run state management. These are separated from the
 * performer 1:1 chat logic that remains in chatSlice.
 */

import type { StudioState } from './types'
import { api } from '../api'
import { resolvePerformerRuntimeConfig } from '../lib/performers'
import { formatStudioApiErrorMessage } from '../lib/api-errors'
import { makeId } from '../lib/acts'
import type { ActRunState, ActThreadResumeSummary } from '../types'

type SetFn = (
    partial: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>),
) => void

type GetFn = () => StudioState

// ── Pure helpers ────────────────────────────────────────

export function buildActResumeSummary(run: ActRunState): ActThreadResumeSummary {
    return {
        updatedAt: Date.now(),
        runId: run.runId || null,
        currentNodeId: run.currentNodeId,
        finalOutput: run.finalOutput,
        error: run.error,
        iterations: run.iterations,
        nodeOutputs: run.sharedState?.nodeOutputs && typeof run.sharedState.nodeOutputs === 'object'
            ? Object.fromEntries(
                Object.entries(run.sharedState.nodeOutputs as Record<string, unknown>)
                    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
            )
            : {},
        history: Array.isArray(run.history) ? run.history.slice(-24) : [],
        sessionHandles: Array.isArray(run.sessionHandles)
            ? run.sessionHandles.map((session) => ({
                handle: session.handle,
                nodeId: session.nodeId,
                nodeType: session.nodeType,
                performerId: session.performerId,
                status: session.status,
                turnCount: session.turnCount,
                lastUsedAt: session.lastUsedAt,
                summary: session.summary,
            }))
            : [],
    }
}

// ── Session lifecycle ───────────────────────────────────

export function createFreshActSession(
    get: GetFn,
    set: SetFn,
    actId: string,
    actName: string,
    options?: {
        resetMessages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>
    },
): string {
    const currentCount = get().actSessions.filter((session) => session.actId === actId).length
    const sessionId = makeId('act-session')
    const nextSession = {
        id: sessionId,
        actId,
        actName,
        title: `Session ${currentCount + 1}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'idle' as const,
        lastRunId: null,
        resumeSummary: null,
    }

    set((state) => ({
        actSessions: [nextSession, ...state.actSessions],
        actSessionMap: {
            ...state.actSessionMap,
            [actId]: sessionId,
        },
        actChats: {
            ...state.actChats,
            [sessionId]: options?.resetMessages || [],
        },
        actPerformerChats: {
            ...state.actPerformerChats,
            [sessionId]: {},
        },
        actPerformerBindings: {
            ...state.actPerformerBindings,
            [sessionId]: [],
        },
        stageDirty: true,
    }))

    return sessionId
}

export function appendActChatMessage(
    set: SetFn,
    sessionId: string,
    message: { id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number },
) {
    set((state) => ({
        actChats: {
            ...state.actChats,
            [sessionId]: [...(state.actChats[sessionId] || []), message],
        },
        stageDirty: true,
    }))
}

export function updateActSessionMeta(
    set: SetFn,
    sessionId: string,
    patch: Partial<{
        updatedAt: number
        status: 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'
        lastRunId: string | null
        resumeSummary: ActThreadResumeSummary | null
    }>,
) {
    set((state) => ({
        actSessions: state.actSessions.map((session) => (
            session.id === sessionId
                ? { ...session, ...patch }
                : session
        )),
        stageDirty: true,
    }))
}

// ── Act message sending ─────────────────────────────────

export async function sendActMessage(
    get: GetFn,
    set: SetFn,
    actId: string,
    text: string,
) {
    const state = get()
    const act = state.acts.find((item: any) => item.id === actId) as any
    if (!act) {
        return
    }

    const selectedSession = state.selectedActSessionId
        ? state.actSessions.find((session) => session.id === state.selectedActSessionId && session.actId === actId) || null
        : null
    let sessionId = selectedSession?.id || state.actSessionMap[actId]
    if (!sessionId) {
        sessionId = createFreshActSession(get, set, actId, act.name, { resetMessages: [] })
        get().initRealtimeEvents()
    }
    if (state.actSessionMap[actId] !== sessionId || state.selectedActSessionId !== sessionId) {
        set((current) => ({
            actSessionMap: {
                ...current.actSessionMap,
                [actId]: sessionId,
            },
            selectedActSessionId: sessionId,
            stageDirty: true,
        }))
    }

    const currentSession = get().actSessions.find((session) => session.id === sessionId) || null

    const userMessage = {
        id: `act-user-${Date.now()}`,
        role: 'user' as const,
        content: text,
        timestamp: Date.now(),
    }
    appendActChatMessage(set, sessionId, userMessage)
    updateActSessionMeta(set, sessionId, {
        status: 'running',
        updatedAt: Date.now(),
    })
    set({ loadingActId: actId })

    try {
        const run = await api.act.run({
            actSessionId: sessionId,
            stageAct: act,
            performers: get().performers.map((performer) => ({
                ...performer,
                mcpServerNames: resolvePerformerRuntimeConfig(performer).mcpServerNames,
            })),
            drafts: get().drafts,
            input: text,
            maxIterations: act.maxIterations,
            resumeSummary: currentSession?.resumeSummary || undefined,
        })
        if (run.status !== 'interrupted') {
            const assistantContent = String(run.finalOutput || run.error || (run.status === 'completed' ? 'Act completed.' : 'Act failed.')).trim()
            appendActChatMessage(set, sessionId, {
                id: `act-assistant-${Date.now()}`,
                role: 'assistant',
                content: assistantContent,
                timestamp: Date.now(),
            })
        }
        updateActSessionMeta(set, sessionId, {
            status: run.status,
            updatedAt: Date.now(),
            lastRunId: run.runId || null,
            resumeSummary: buildActResumeSummary(run),
        })
    } catch (error) {
        appendActChatMessage(set, sessionId, {
            id: `act-system-${Date.now()}`,
            role: 'system',
            content: formatStudioApiErrorMessage(error),
            timestamp: Date.now(),
        })
        updateActSessionMeta(set, sessionId, {
            status: 'failed',
            updatedAt: Date.now(),
        })
    } finally {
        set({ loadingActId: null })
    }
}

// ── Abort / Start / Delete / Rename ─────────────────────

export async function abortAct(
    get: GetFn,
    set: SetFn,
    actId: string,
) {
    const state = get()
    const sessionId = state.actSessionMap[actId]
    if (!sessionId) {
        return
    }

    try {
        await api.act.abort(sessionId)
    } catch (err) {
        console.error('Failed to abort act run', err)
    }

    updateActSessionMeta(set, sessionId, {
        status: 'interrupted',
        updatedAt: Date.now(),
    })
    appendActChatMessage(set, sessionId, {
        id: `act-system-${Date.now()}`,
        role: 'system',
        content: 'Act run stopped.',
        timestamp: Date.now(),
    })
    set((current) => ({
        loadingActId: current.loadingActId === actId ? null : current.loadingActId,
    }))
}

export function startNewActSession(
    get: GetFn,
    set: SetFn,
    actId: string,
) {
    const act = get().acts.find((item: any) => item.id === actId) as any
    if (!act) {
        return
    }
    createFreshActSession(get, set, actId, act.name, { resetMessages: [] })
    set({ selectedActSessionId: null })
    get().initRealtimeEvents()
}

export function deleteActSession(
    get: GetFn,
    set: SetFn,
    sessionId: string,
) {
    const current = get()
    const nextChats = { ...current.actChats }
    delete nextChats[sessionId]
    const nextPerformerChats = { ...current.actPerformerChats }
    delete nextPerformerChats[sessionId]
    const nextPerformerBindings = { ...current.actPerformerBindings }
    delete nextPerformerBindings[sessionId]

    const nextActSessions = current.actSessions.filter((session) => session.id !== sessionId)
    const nextActSessionMap = { ...current.actSessionMap }
    for (const [actId, mappedSessionId] of Object.entries(nextActSessionMap)) {
        if (mappedSessionId === sessionId) {
            delete nextActSessionMap[actId]
        }
    }

    set({
        actChats: nextChats,
        actPerformerChats: nextPerformerChats,
        actPerformerBindings: nextPerformerBindings,
        actSessions: nextActSessions,
        actSessionMap: nextActSessionMap,
        selectedActSessionId: current.selectedActSessionId === sessionId ? null : current.selectedActSessionId,
        stageDirty: true,
    })
}

export function renameActSession(
    set: SetFn,
    sessionId: string,
    title: string,
) {
    set((state) => ({
        actSessions: state.actSessions.map((session) => (
            session.id === sessionId
                ? {
                    ...session,
                    title: title.trim() || session.title,
                    updatedAt: Date.now(),
                }
                : session
        )),
        stageDirty: true,
    }))
}
