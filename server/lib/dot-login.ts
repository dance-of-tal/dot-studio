/**
 * Studio server — thin re-export of dot lib login.
 * Auth logic lives in dance-of-tal/lib/auth; this file is kept for
 * backward-compatible imports within the studio server.
 */
export { startLogin, readAuthUser, saveAuthToken, clearAuthUser } from './dot-source.js'

// Backward-compatible alias used by dot-service.ts
export { startLogin as startDotLogin } from './dot-source.js'
