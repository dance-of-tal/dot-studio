import fs from 'fs/promises'
import path from 'path'
import http from 'http'
import crypto from 'crypto'
import open from 'open'
import { getGlobalDotDir } from 'dance-of-tal/lib/registry'
import { readDotAuthUser } from './dot-authoring.js'

const SUPABASE_URL = process.env.DOT_SUPABASE_URL || 'https://qbildcrfjencoqkngyfw.supabase.co'
const SUPABASE_ANON_KEY = process.env.DOT_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiaWxkY3JmamVuY29xa25neWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNjE5MzYsImV4cCI6MjA4NzgzNzkzNn0.9aI9FU-j20w3UIG7BuVtmpAPh3qClz7xTNXjcq7ofNQ'
const DOT_LOGIN_REDIRECT_URI = 'http://localhost:4242/callback'
const LOGIN_SERVER_TIMEOUT_MS = 180_000

type LoginState = {
    server: http.Server
    authUrl: string
    timeout: NodeJS.Timeout
}

let loginState: LoginState | null = null

function getAuthFilePath() {
    return path.join(getGlobalDotDir(), 'auth.json')
}

async function saveAuthToken(token: string, username: string) {
    const authFile = getAuthFilePath()
    await fs.mkdir(path.dirname(authFile), { recursive: true })
    await fs.writeFile(authFile, JSON.stringify({ token, username }, null, 2), 'utf-8')
}

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string) {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function clearLoginState() {
    if (!loginState) {
        return
    }
    clearTimeout(loginState.timeout)
    loginState.server.close()
    loginState = null
}

async function releaseStaleLoginPort() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1_500)

    try {
        // Legacy dot login closes itself when /callback is hit without a code.
        await fetch(DOT_LOGIN_REDIRECT_URI, {
            method: 'GET',
            signal: controller.signal,
        }).catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 250))
    } finally {
        clearTimeout(timer)
    }
}

async function listenOnLoginPort(server: http.Server) {
    const tryListen = async () =>
        new Promise<void>((resolve, reject) => {
            const onError = (error: Error & { code?: string }) => {
                server.off('listening', onListening)
                reject(error)
            }
            const onListening = () => {
                server.off('error', onError)
                resolve()
            }

            server.once('error', onError)
            server.once('listening', onListening)
            server.listen(4242)
        })

    try {
        await tryListen()
    } catch (error: any) {
        if (error?.code !== 'EADDRINUSE') {
            throw error
        }

        await releaseStaleLoginPort()

        try {
            await tryListen()
        } catch (retryError: any) {
            if (retryError?.code === 'EADDRINUSE') {
                throw new Error('Port 4242 is already in use by another process. Finish or close the other DOT login flow, then try again.')
            }
            throw retryError
        }
    }
}

export async function startDotLogin() {
    const auth = await readDotAuthUser()
    if (auth) {
        return {
            started: false,
            alreadyAuthenticated: true,
            username: auth.username,
        }
    }

    if (loginState) {
        return {
            started: false,
            alreadyRunning: true,
            authUrl: loginState.authUrl,
            browserOpened: false,
        }
    }

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(DOT_LOGIN_REDIRECT_URI)}&code_challenge=${codeChallenge}&code_challenge_method=s256`

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url || '/', DOT_LOGIN_REDIRECT_URI)
            if (url.pathname !== '/callback') {
                res.writeHead(404).end('Not Found')
                return
            }

            const code = url.searchParams.get('code')
            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/html' })
                res.end("<h2 style='color: red; text-align: center; font-family: sans-serif; margin-top: 50px;'>Authentication failed: No code received. You can close this window.</h2>")
                clearLoginState()
                return
            }

            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.write("<h2 style='font-family: sans-serif; text-align: center; margin-top: 50px;'>Completing authentication... Please wait.</h2>")

            try {
                const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({
                        auth_code: code,
                        code_verifier: codeVerifier,
                    }),
                })

                const data = await tokenRes.json() as any
                if (!tokenRes.ok || !data.access_token) {
                    throw new Error(data.error_description || data.msg || 'Failed to exchange token')
                }

                const username = data.user?.user_metadata?.preferred_username || data.user?.user_metadata?.user_name
                if (!username) {
                    throw new Error('Could not determine GitHub username from token.')
                }

                await saveAuthToken(data.access_token, username)
                res.end(`
                    <script>
                        document.body.innerHTML = "<h2 style='color: green; font-family: sans-serif; text-align: center; margin-top: 50px;'>Authentication Successful! You can safely close this window.</h2>";
                        setTimeout(() => window.close(), 3000);
                    </script>
                `)
            } catch (error: any) {
                res.end(`
                    <script>
                        document.body.innerHTML = "<h2 style='color: red; font-family: sans-serif; text-align: center; margin-top: 50px;'>Authentication Failed. ${String(error?.message || 'Unknown error')}</h2>";
                    </script>
                `)
            } finally {
                clearLoginState()
            }
        } catch {
            try {
                res.writeHead(500).end('Server Error')
            } catch {
                // ignore
            }
            clearLoginState()
        }
    })

    await listenOnLoginPort(server)

    loginState = {
        server,
        authUrl,
        timeout: setTimeout(() => {
            clearLoginState()
        }, LOGIN_SERVER_TIMEOUT_MS),
    }

    let browserOpened = true
    try {
        await open(authUrl)
    } catch {
        browserOpened = false
    }

    return {
        started: true,
        alreadyRunning: false,
        alreadyAuthenticated: false,
        authUrl,
        browserOpened,
    }
}
