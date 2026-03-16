import { useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { SettingsModal } from '../../features/providers';
import PublishModal from '../modals/PublishModal';
import { GitBranch, CheckCircle, AlertCircle, Settings, Moon, Sun, Hexagon, Terminal as TerminalIcon, Github, FileText, ChevronDown, Upload, LogIn, UserRound, Sparkles } from 'lucide-react';
import { useStudioStore } from '../../store';
import { useServerHealth, useDotStatus, usePerformers } from '../../hooks/queries';
import { useDotLogin } from '../../hooks/useDotLogin';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries';

import './StageToolbar.css';

export default function StageToolbar() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [markdownMenuOpen, setMarkdownMenuOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
    const [authMenuOpen, setAuthMenuOpen] = useState(false);

    const theme = useStudioStore(s => s.theme);
    const toggleTheme = useStudioStore(s => s.toggleTheme);
    const workingDir = useStudioStore(s => s.workingDir);
    const isAssistantOpen = useStudioStore(s => s.isAssistantOpen);
    const toggleAssistant = useStudioStore(s => s.toggleAssistant);
    const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
    const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
    const isTrackingOpen = useStudioStore(s => s.isTrackingOpen);
    const setTrackingOpen = useStudioStore(s => s.setTrackingOpen);
    const createMarkdownEditor = useStudioStore(s => s.createMarkdownEditor);
    const addCanvasTerminal = useStudioStore(s => s.addCanvasTerminal);

    const { data: serverHealthy } = useServerHealth();
    const { data: dotStatus } = useDotStatus();
    const { data: performerData } = usePerformers();
    const { authUser, startLogin, logout, isAuthenticating, isLoggingOut } = useDotLogin();
    const queryClient = useQueryClient();

    const serverConnected = !!serverHealthy;
    const dotInitialized = dotStatus?.initialized ?? false;
    const performers = performerData?.names ?? [];
    const [gitBranch, setGitBranch] = useState<string | null>(null);

    // Git branch polling
    useEffect(() => {
        const fetchVcs = () => {
            if (serverConnected) {
                api.vcs.get()
                    .then(data => setGitBranch(data?.branch || null))
                    .catch(() => setGitBranch(null));
            } else {
                setGitBranch(null);
            }
        };
        fetchVcs();
        const timer = setInterval(fetchVcs, 15000);
        return () => clearInterval(timer);
    }, [serverConnected, workingDir]);

    const handleDotInit = async () => {
        if (dotInitialized) return;
        try {
            await api.dot.init();
            queryClient.invalidateQueries({ queryKey: queryKeys.dotStatus(workingDir) });
            queryClient.invalidateQueries({ queryKey: queryKeys.performers(workingDir) });
        } catch (err) {
            console.error('Failed to init DOT workspace:', err);
            showToast('Failed to initialize the DOT workspace for this project.', 'error', {
                title: 'DOT init failed',
                dedupeKey: `dot:init:${workingDir || 'unknown'}`,
                actionLabel: 'Retry',
                onAction: () => {
                    void handleDotInit()
                },
            });
        }
    };

    return (
        <>
            <div className="toolbar">
                <button
                    className={`toolbar__item dot-status ${dotInitialized ? 'dot-ok' : 'dot-missing'}`}
                    onClick={handleDotInit}
                    title={dotInitialized
                        ? `DOT: ${performers.length} performer${performers.length !== 1 ? 's' : ''} locked`
                        : 'DOT not initialized — click to init'
                    }
                    style={{ cursor: dotInitialized ? 'default' : 'pointer', border: 'none', background: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', fontSize: '11px', color: 'var(--text-secondary)' }}
                >
                    <Hexagon size={12} color={dotInitialized ? '#14AE5C' : '#F24822'} />
                    <span>DOT</span>
                    {dotInitialized && performers.length > 0 && (
                        <span style={{ opacity: 0.6 }}>({performers.length})</span>
                    )}
                </button>

                {gitBranch && (
                    <span className="toolbar__item" title={`Branch: ${gitBranch}`}>
                        <GitBranch size={12} className="icon-muted" /> {gitBranch}
                    </span>
                )}

                <div className="toolbar__dropdown">
                    <button
                        className={`toolbar__item dot-auth-status ${authUser?.authenticated ? 'dot-auth-status--ok' : 'dot-auth-status--warn'}`}
                        onClick={() => {
                            if (!authUser?.authenticated) {
                                void startLogin(true);
                                return;
                            }
                            setAuthMenuOpen((open) => !open);
                        }}
                        title={authUser?.authenticated
                            ? `Signed in as @${authUser.username}`
                            : isAuthenticating
                                ? 'Waiting for DOT login to complete in the browser'
                                : 'Review the DOT Terms of Service and sign in'
                        }
                        style={{
                            cursor: authUser?.authenticated ? 'pointer' : 'pointer',
                            border: 'none',
                            background: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '0 6px',
                            fontSize: '11px',
                        }}
                    >
                        {authUser?.authenticated ? <UserRound size={12} /> : <LogIn size={12} />}
                        <span>
                            {authUser?.authenticated
                                ? `@${authUser.username}`
                                : isAuthenticating
                                    ? 'Signing in…'
                                    : 'Sign in'}
                        </span>
                        {authUser?.authenticated ? <ChevronDown size={10} /> : null}
                    </button>
                    {authUser?.authenticated && authMenuOpen ? (
                        <div className="toolbar__menu toolbar__menu--right">
                            <button
                                className="toolbar__menu-item"
                                onClick={() => {
                                    setAuthMenuOpen(false);
                                    void logout();
                                }}
                                disabled={isLoggingOut}
                            >
                                {isLoggingOut ? 'Signing out…' : 'Log out'}
                            </button>
                        </div>
                    ) : null}
                </div>

                <span
                    className="toolbar__item"
                    title={serverConnected ? 'Local server connected' : 'Local server disconnected'}
                >
                    {serverConnected ? <CheckCircle size={12} color="#14AE5C" /> : <AlertCircle size={12} color="#F24822" />}
                </span>

                <div className="divider-v" />

                <div className="toolbar__dropdown">
                    <button className="icon-btn" onClick={() => setTerminalMenuOpen(o => !o)} title="Terminal">
                        <TerminalIcon size={12} className={isTerminalOpen ? 'icon-active' : ''} />
                        <ChevronDown size={10} />
                    </button>
                    {terminalMenuOpen ? (
                        <div className="toolbar__menu">
                            <button
                                className="toolbar__menu-item"
                                onClick={() => {
                                    setTerminalOpen(!isTerminalOpen);
                                    setTerminalMenuOpen(false);
                                }}
                            >
                                {isTerminalOpen ? 'Hide' : 'Show'} Pinned Terminal
                            </button>
                            <button
                                className="toolbar__menu-item"
                                onClick={() => {
                                    addCanvasTerminal();
                                    setTerminalMenuOpen(false);
                                }}
                            >
                                Add Terminal to Canvas
                            </button>
                        </div>
                    ) : null}
                </div>

                <button className="icon-btn" onClick={() => setTrackingOpen(!isTrackingOpen)} title="Stage Tracking">
                    <Github size={12} className={isTrackingOpen ? 'icon-active' : ''} />
                </button>

                <div className="toolbar__dropdown">
                    <button className="icon-btn" onClick={() => setMarkdownMenuOpen((open) => !open)} title="Markdown editors">
                        <FileText size={12} />
                        <ChevronDown size={10} />
                    </button>
                    {markdownMenuOpen ? (
                        <div className="toolbar__menu">
                            <button
                                className="toolbar__menu-item"
                                onClick={() => {
                                    createMarkdownEditor('tal');
                                    setMarkdownMenuOpen(false);
                                }}
                            >
                                New Tal Editor
                            </button>
                            <button
                                className="toolbar__menu-item"
                                onClick={() => {
                                    createMarkdownEditor('dance');
                                    setMarkdownMenuOpen(false);
                                }}
                            >
                                New Dance Editor
                            </button>
                        </div>
                    ) : null}
                </div>

                <button className="icon-btn" onClick={() => setPublishOpen(true)} title="Save or publish selected asset">
                    <Upload size={12} />
                </button>

                <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
                </button>

                <button className={`icon-btn ${isAssistantOpen ? 'is-active' : ''}`} onClick={toggleAssistant} title="Toggle Studio Assistant">
                    <Sparkles size={12} className={isAssistantOpen ? 'icon-active' : ''} color={isAssistantOpen ? "var(--primary)" : undefined} />
                </button>

                <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
                    <Settings size={12} />
                </button>
            </div>
            <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} />
            <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
    );
}
