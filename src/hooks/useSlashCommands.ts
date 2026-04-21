import { useCallback, useMemo, useState } from 'react'

const SLASH_COMMANDS = [
    { cmd: '/dance', desc: 'Add dance for this turn', mode: 'compose' as const },
]

export function getSlashMenuQuery(input: string) {
    const trimmed = input.trimStart()
    if (!trimmed.startsWith('/')) return null
    if (/\s/.test(trimmed)) return null
    return trimmed
}

export function resolveSelectedSlashCommand(input: string, activeCommand: string | null) {
    if (!activeCommand) return null
    const trimmed = input.trimStart()
    if (!trimmed.startsWith(activeCommand)) return null
    const nextChar = trimmed.charAt(activeCommand.length)
    if (nextChar && !/\s/.test(nextChar)) return null
    return activeCommand
}

export function useSlashCommands(input: string, setInput: (v: string) => void) {
    const [showSlashMenu, setShowSlashMenu] = useState(false)
    const [slashIndex, setSlashIndex] = useState(0)
    const [activeCommand, setActiveCommand] = useState<string | null>(null)

    const slashMenuQuery = getSlashMenuQuery(input)
    const filteredCommands = useMemo(
        () => (
            slashMenuQuery
                ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(slashMenuQuery))
                : []
        ),
        [slashMenuQuery],
    )

    const applySelectedCommand = useCallback((command: string) => {
        setActiveCommand(command)
        setInput(`${command} `)
        setShowSlashMenu(false)
    }, [setInput])

    const handleInputChange = useCallback((val: string) => {
        setInput(val)
        const nextActiveCommand = resolveSelectedSlashCommand(val, activeCommand)
        setActiveCommand(nextActiveCommand)
        const nextSlashMenuQuery = getSlashMenuQuery(val)
        if (nextSlashMenuQuery && nextActiveCommand === null) {
            setShowSlashMenu(true)
            setSlashIndex(0)
        } else {
            setShowSlashMenu(false)
        }
    }, [activeCommand, setInput])

    const handleKeyDown = useCallback((e: React.KeyboardEvent, onSendText?: (text: string) => void) => {
        if (showSlashMenu && filteredCommands.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSlashIndex((prev) => (prev + 1) % filteredCommands.length)
                return true
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
                return true
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                const selected = filteredCommands[slashIndex]
                if (selected) {
                    applySelectedCommand(selected.cmd)
                }
                return true
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                setShowSlashMenu(false)
                return true
            }
        }

        const text = input.trim()

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (activeCommand) {
                // in dance selection mode, do nothing on Enter
                return true
            }

            if (onSendText && text) {
                onSendText(text)
                setInput('')
                setShowSlashMenu(false)
            }
            return true
        }

        return false
    }, [activeCommand, applySelectedCommand, filteredCommands, input, setInput, showSlashMenu, slashIndex])

    return {
        activeCommand,
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        applySelectedCommand,
        handleInputChange,
        handleKeyDown,
    }
}
