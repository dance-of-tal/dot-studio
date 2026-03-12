import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { showToast } from '../lib/toast'
import { useDotAuthUser, queryKeys } from './queries'

const LOGIN_POLL_INTERVAL_MS = 2_000
const LOGIN_POLL_TIMEOUT_MS = 180_000

export function useDotLogin() {
    const queryClient = useQueryClient()
    const { data: authUser, refetch: refetchAuthUser } = useDotAuthUser()
    const [startingLogin, setStartingLogin] = useState(false)
    const [awaitingLogin, setAwaitingLogin] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)
    const loginDeadlineRef = useRef<number | null>(null)

    useEffect(() => {
        if (!awaitingLogin || authUser?.authenticated) {
            return
        }

        const timer = window.setInterval(() => {
            if (loginDeadlineRef.current && Date.now() > loginDeadlineRef.current) {
                window.clearInterval(timer)
                loginDeadlineRef.current = null
                setAwaitingLogin(false)
                showToast('DOT login timed out before authentication completed.', 'error', {
                    title: 'DOT login timed out',
                    dedupeKey: 'dot-login:timeout',
                })
                return
            }
            void refetchAuthUser()
        }, LOGIN_POLL_INTERVAL_MS)

        return () => window.clearInterval(timer)
    }, [authUser?.authenticated, awaitingLogin, refetchAuthUser])

    useEffect(() => {
        if (!awaitingLogin || !authUser?.authenticated) {
            return
        }

        loginDeadlineRef.current = null
        setAwaitingLogin(false)
        queryClient.invalidateQueries({ queryKey: queryKeys.dotAuthUser })
        showToast(`Signed in as @${authUser.username || 'unknown'}.`, 'success', {
            title: 'DOT login complete',
            dedupeKey: 'dot-login:complete',
        })
    }, [authUser?.authenticated, authUser?.username, awaitingLogin, queryClient])

    const startLogin = async (acknowledgedTos = false) => {
        if (startingLogin || awaitingLogin) {
            return
        }

        const popup = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null

        try {
            setStartingLogin(true)
            const result = await api.dot.login(acknowledgedTos)

            if (result.alreadyAuthenticated) {
                popup?.close()
                await refetchAuthUser()
                return
            }

            if (result.started || result.alreadyRunning) {
                let openedInClient = false

                if (result.authUrl && !result.browserOpened) {
                    try {
                        if (popup && !popup.closed) {
                            popup.location.href = result.authUrl
                            openedInClient = true
                        } else {
                            const win = window.open(result.authUrl, '_blank')
                            openedInClient = !!win
                        }
                    } catch {
                        openedInClient = false
                    }
                } else {
                    popup?.close()
                }

                loginDeadlineRef.current = Date.now() + LOGIN_POLL_TIMEOUT_MS
                setAwaitingLogin(true)
                if (result.authUrl && !result.browserOpened && !openedInClient) {
                    showToast('Open the DOT login flow to continue authentication.', 'warning', {
                        title: 'DOT login started',
                        actionLabel: 'Open login',
                        onAction: () => {
                            window.open(result.authUrl, '_blank')
                        },
                        dedupeKey: 'dot-login:started',
                        durationMs: 8000,
                    })
                } else {
                    showToast('Complete DOT login in the browser to continue.', 'success', {
                        title: 'DOT login started',
                        dedupeKey: 'dot-login:started',
                    })
                }
                void refetchAuthUser()
                return
            }

            popup?.close()
        } catch (error: any) {
            popup?.close()
            showToast(error?.message || 'Failed to start DOT login.', 'error', {
                title: 'DOT login failed',
                dedupeKey: 'dot-login:failed',
            })
        } finally {
            setStartingLogin(false)
        }
    }

    const logout = async () => {
        if (loggingOut) {
            return
        }

        try {
            setLoggingOut(true)
            loginDeadlineRef.current = null
            setAwaitingLogin(false)
            await api.dot.logout()
            await queryClient.invalidateQueries({ queryKey: queryKeys.dotAuthUser })
            await refetchAuthUser()
            showToast('Signed out from DOT.', 'success', {
                title: 'DOT logout complete',
                dedupeKey: 'dot-login:logout',
            })
        } catch (error: any) {
            showToast(error?.message || 'Failed to sign out from DOT.', 'error', {
                title: 'DOT logout failed',
                dedupeKey: 'dot-login:logout-failed',
            })
        } finally {
            setLoggingOut(false)
        }
    }

    return {
        authUser,
        startLogin,
        logout,
        isAuthenticating: startingLogin || awaitingLogin,
        isLoggingOut: loggingOut,
    }
}
