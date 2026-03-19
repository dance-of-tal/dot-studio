import { useEffect, useState, type RefObject } from 'react'
import { loadMaterialFileIconForPath } from '../../lib/material-file-icons'
import type { DanceSearchItem } from './agent-frame-utils'

function MentionFileIcon({ path }: { path: string }) {
    const [iconUrl, setIconUrl] = useState('')

    useEffect(() => {
        let active = true
        void loadMaterialFileIconForPath(path).then((url) => {
            if (active) setIconUrl(url)
        })
        return () => { active = false }
    }, [path])

    return (
        <span
            className="mention-result__icon"
            style={{
                ['--mention-icon' as string]: iconUrl ? `url(${iconUrl})` : 'none',
                background: iconUrl ? 'var(--text-secondary)' : 'transparent',
            }}
            aria-hidden="true"
        />
    )
}

interface ComposerMentionMenusProps {
    input: string
    setInput: (value: string) => void
    inputRef: RefObject<HTMLTextAreaElement | null>
    // Performer mention
    isPerformerMentioning: boolean
    performerMentionResults: any[]
    performerMentionIndex: number
    extractPerformerMentionText: () => string | null
    setMentionedPerformers: React.Dispatch<React.SetStateAction<any[]>>
    // File mention
    isFileMentioning: boolean
    fileMentionResults: any[]
    fileMentionIndex: number
    extractFileMentionText: () => string | null
    setAttachments: React.Dispatch<React.SetStateAction<any[]>>
    // Dance slash
    danceSlashMatch: string | null
    danceSearchSections: Array<{ key: string; title: string; items: DanceSearchItem[] }>
    danceSearchResults: DanceSearchItem[]
    danceSearchIndex: number
    addTurnDanceSelection: (item: DanceSearchItem) => void
    // Slash commands
    showSlashMenu: boolean
    setShowSlashMenu: (value: boolean) => void
    slashIndex: number
    filteredCommands: Array<{ cmd: string; desc: string; mode: 'compose' | 'execute' }>
    performerId: string
    executeSlashCommand: (performerId: string, command: string) => void
}

export default function ComposerMentionMenus(props: ComposerMentionMenusProps) {
    const {
        setInput,
        inputRef,
        isPerformerMentioning,
        performerMentionResults,
        performerMentionIndex,
        extractPerformerMentionText,
        setMentionedPerformers,
        isFileMentioning,
        fileMentionResults,
        fileMentionIndex,
        extractFileMentionText,
        setAttachments,
        danceSlashMatch,
        danceSearchSections,
        danceSearchResults,
        danceSearchIndex,
        addTurnDanceSelection,
        showSlashMenu,
        setShowSlashMenu,
        slashIndex,
        filteredCommands,
        performerId,
        executeSlashCommand,
    } = props

    return (
        <>
            {isPerformerMentioning && performerMentionResults.length > 0 ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {performerMentionResults.map((performerMention, i) => (
                        <div
                            key={performerMention.performerId}
                            className={`slash-menu-item mention-menu-item ${i === performerMentionIndex ? 'active' : ''}`}
                            onClick={() => {
                                const newText = extractPerformerMentionText()
                                if (newText !== null) {
                                    setInput(newText)
                                    setMentionedPerformers((current) => (
                                        current.some((item: any) => item.performerId === performerMention.performerId) ? current : [...current, performerMention]
                                    ))
                                }
                                inputRef.current?.focus()
                            }}
                        >
                            <span className="mention-result__content">
                                <span className="mention-result__name">{performerMention.name}</span>
                                <span className="mention-result__path">Runs in this workspace</span>
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {isFileMentioning && fileMentionResults.length > 0 ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {fileMentionResults.map((file, i) => (
                        <div
                            key={file.absolute}
                            className={`slash-menu-item mention-menu-item ${i === fileMentionIndex ? 'active' : ''}`}
                            onClick={() => {
                                const newText = extractFileMentionText()
                                if (newText !== null) {
                                    setInput(newText)
                                    setAttachments((current) => [...current, file])
                                }
                                inputRef.current?.focus()
                            }}
                        >
                            <MentionFileIcon path={file.path} />
                            <span className="mention-result__content">
                                <span className="mention-result__name">{file.name}</span>
                                <span className="mention-result__path">{file.path}</span>
                            </span>
                        </div>
                    ))}
                </div>
            ) : null}

            {danceSlashMatch !== null ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {danceSearchSections.length > 0 ? danceSearchSections.map((section) => (
                        <div key={section.key} className="slash-menu__section">
                            <div className="slash-menu__section-title">{section.title}</div>
                            {section.items.map((item) => {
                                const resultIndex = danceSearchResults.findIndex((candidate) => candidate.key === item.key)
                                return (
                                    <div
                                        key={item.key}
                                        className={`slash-menu-item dance-menu-item ${resultIndex === danceSearchIndex ? 'active' : ''}`}
                                        onClick={() => addTurnDanceSelection(item)}
                                    >
                                        <span className={`dance-result__scope dance-result__scope--${item.scope}`}>{item.scope}</span>
                                        <span className="mention-result__content">
                                            <span className="mention-result__name">{item.label}</span>
                                            <span className="mention-result__path">{item.subtitle}</span>
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    )) : (
                        <div className="slash-menu__section">
                            <div className="slash-menu__section-title">Dance</div>
                            <div className="slash-menu-item">
                                <span className="slash-desc">No matching dances found.</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : null}

            {danceSlashMatch === null && showSlashMenu && filteredCommands.length > 0 ? (
                <div className="slash-menu" style={{ bottom: '100%', marginBottom: '4px' }}>
                    {filteredCommands.map((command, i) => (
                        <div
                            key={command.cmd}
                            className={`slash-menu-item ${i === slashIndex ? 'active' : ''}`}
                            onClick={() => {
                                if (command.mode === 'compose') {
                                    setInput(`${command.cmd} `)
                                } else {
                                    executeSlashCommand(performerId, command.cmd)
                                    setInput('')
                                }
                                setShowSlashMenu(false)
                            }}
                        >
                            <span className="slash-cmd">{command.cmd}</span>
                            <span className="slash-desc">{command.desc}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </>
    )
}
