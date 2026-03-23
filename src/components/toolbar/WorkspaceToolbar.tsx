import { Suspense, lazy, useState, useEffect } from 'react';
import { api } from '../../api';
import { showToast } from '../../lib/toast';
import { GitBranch, CheckCircle, AlertCircle, Settings, Moon, Sun, Hexagon, Terminal as TerminalIcon, Github, ChevronDown, Upload, LogIn, UserRound } from 'lucide-react';
import { useStudioStore } from '../../store';
import { useServerHealth, useDotStatus, usePerformers } from '../../hooks/queries';
import { useDotLogin } from '../../hooks/useDotLogin';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries';
import { DropdownMenu } from '../shared/DropdownMenu';

import './StageToolbar.css';

const SettingsModal = lazy(() =>
    import('../../features/providers').then((module) => ({ default: module.SettingsModal })),
);
const PublishModal = lazy(() =>
    import('../modals/PublishModal').then((module) => ({ default: module.default })),
);

export default function WorkspaceToolbar() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);

    const theme = useStudioStore(s => s.theme);
    const toggleTheme = useStudioStore(s => s.toggleTheme);
    const workingDir = useStudioStore(s => s.workingDir);
    const isAssistantOpen = useStudioStore(s => s.isAssistantOpen);
    const toggleAssistant = useStudioStore(s => s.toggleAssistant);
    const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
    const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
    const isTrackingOpen = useStudioStore(s => s.isTrackingOpen);
    const setTrackingOpen = useStudioStore(s => s.setTrackingOpen);
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
                    .then((data: { branch?: string | null }) => setGitBranch(data.branch || null))
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

                {authUser?.authenticated ? (
                    <DropdownMenu
                        align="right"
                        trigger={
                            <button
                                className="toolbar__item dot-auth-status dot-auth-status--ok"
                                title={`Signed in as @${authUser.username}`}
                                style={{ cursor: 'pointer', border: 'none', background: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', fontSize: '11px' }}
                            >
                                <UserRound size={12} />
                                <span>@{authUser.username}</span>
                                <ChevronDown size={10} />
                            </button>
                        }
                        items={[
                            { label: isLoggingOut ? 'Signing out…' : 'Log out', onClick: () => void logout(), disabled: isLoggingOut },
                        ]}
                    />
                ) : (
                    <button
                        className="toolbar__item dot-auth-status dot-auth-status--warn"
                        onClick={() => void startLogin(true)}
                        title={isAuthenticating
                            ? 'Waiting for DOT login to complete in the browser'
                            : 'Review the DOT Terms of Service and sign in'
                        }
                        style={{ cursor: 'pointer', border: 'none', background: 'none', display: 'flex', alignItems: 'center', gap: '4px', padding: '0 6px', fontSize: '11px' }}
                    >
                        <LogIn size={12} />
                        <span>{isAuthenticating ? 'Signing in…' : 'Sign in'}</span>
                    </button>
                )}

                <span
                    className="toolbar__item"
                    title={serverConnected ? 'Local server connected' : 'Local server disconnected'}
                >
                    {serverConnected ? <CheckCircle size={12} color="#14AE5C" /> : <AlertCircle size={12} color="#F24822" />}
                </span>

                <div className="divider-v" />

                <DropdownMenu
                    trigger={
                        <button className="icon-btn" title="Terminal">
                            <TerminalIcon size={12} className={isTerminalOpen ? 'icon-active' : ''} />
                            <ChevronDown size={10} />
                        </button>
                    }
                    items={[
                        { label: `${isTerminalOpen ? 'Hide' : 'Show'} Pinned Terminal`, onClick: () => setTerminalOpen(!isTerminalOpen) },
                        { label: 'Add Terminal to Canvas', onClick: () => addCanvasTerminal() },
                    ]}
                />

                <button className="icon-btn" onClick={() => setTrackingOpen(!isTrackingOpen)} title="Workspace Tracking">
                    <Github size={12} className={isTrackingOpen ? 'icon-active' : ''} />
                </button>

                <button className="icon-btn" onClick={() => setPublishOpen(true)} title="Save or publish selected asset">
                    <Upload size={12} />
                </button>

                <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
                </button>

                <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
                    <Settings size={12} />
                </button>

                <button
                    className={`toolbar__assistant-btn ${isAssistantOpen ? 'is-active' : ''}`}
                    onClick={toggleAssistant}
                    title="Toggle Studio Assistant"
                >
                    Assistant
                </button>
            </div>
            {publishOpen ? (
                <Suspense fallback={null}>
                    <PublishModal open={publishOpen} onClose={() => setPublishOpen(false)} />
                </Suspense>
            ) : null}
            {settingsOpen ? (
                <Suspense fallback={null}>
                    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
                </Suspense>
            ) : null}
        </>
    );
}
