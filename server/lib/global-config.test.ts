import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveGlobalConfigPath } from './global-config.js'

describe('resolveGlobalConfigPath', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('prefers OPENCODE_CONFIG_DIR when provided', () => {
        vi.stubEnv('OPENCODE_CONFIG_DIR', '/tmp/studio-opencode')
        vi.stubEnv('XDG_CONFIG_HOME', '/tmp/xdg-config')

        expect(resolveGlobalConfigPath()).toBe('/tmp/studio-opencode/opencode.json')
    })

    it('falls back to the standard XDG config path', () => {
        vi.stubEnv('OPENCODE_CONFIG_DIR', '')
        vi.stubEnv('XDG_CONFIG_HOME', '/tmp/xdg-config')

        expect(resolveGlobalConfigPath()).toBe(path.join('/tmp/xdg-config', 'opencode', 'opencode.json'))
    })

    it('uses the home config directory when XDG_CONFIG_HOME is unset', () => {
        vi.stubEnv('OPENCODE_CONFIG_DIR', '')
        vi.stubEnv('XDG_CONFIG_HOME', '')

        expect(resolveGlobalConfigPath()).toBe(path.join(os.homedir(), '.config', 'opencode', 'opencode.json'))
    })
})
