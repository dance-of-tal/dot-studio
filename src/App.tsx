import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { AlertCircle, X } from 'lucide-react';
import { useStudioStore } from './store';
import { CanvasArea } from './features/workspace';
import { api, setApiWorkingDirContext } from './api';
import {
  getDragIcon,
  createDragStartHandler,
  createDragEndHandler,
} from './app-dnd-handlers';

const LeftSidebar = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.LeftSidebar })),
);
const ToastViewport = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.ToastViewport })),
);
const TerminalPanel = lazy(() =>
  import('./features/workspace').then((module) => ({ default: module.TerminalPanel })),
);
const AssistantChat = lazy(() =>
  import('./features/assistant/AssistantChat').then((module) => ({ default: module.AssistantChat })),
);

export default function App() {
  const theme = useStudioStore(s => s.theme);
  const workingDir = useStudioStore(s => s.workingDir);
  const performers = useStudioStore(s => s.performers);
  const acts = useStudioStore(s => s.acts);
  const drafts = useStudioStore(s => s.drafts);
  const markdownEditors = useStudioStore(s => s.markdownEditors);
  const sessionMap = useStudioStore(s => s.sessionMap);
  const canvasTerminals = useStudioStore(s => s.canvasTerminals);

  const stageDirty = useStudioStore(s => s.stageDirty);
  const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
  const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
  const focusedPerformerId = useStudioStore(s => s.focusedPerformerId);
  const focusSnapshot = useStudioStore(s => s.focusSnapshot);
  const isAnyFocusActive = !!(focusedPerformerId || (focusSnapshot?.type === 'act'));

  const isInitialMount = useRef(true);

  // Auto-save Stage configuration (debounced 2 seconds)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!stageDirty) {
      return;
    }

    const timer = setTimeout(() => {
      useStudioStore.getState().saveStage();
    }, 2000);

    return () => clearTimeout(timer);
  }, [stageDirty, performers, acts, drafts, markdownEditors, workingDir, sessionMap, canvasTerminals]);

  // Apply theme to HTML root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Initialize server events and auto-restore last session
  useEffect(() => {
    const store = useStudioStore.getState();
    store.initRealtimeEvents();

    // Auto-restore: load studio config → apply theme → load last stage
    api.studio.getConfig()
      .then((config: any) => {
        setApiWorkingDirContext(config.projectDir || null);
        if (config.theme && config.theme !== useStudioStore.getState().theme) {
          useStudioStore.setState({ theme: config.theme });
          localStorage.setItem('dot-theme', config.theme);
        }
        if (config.lastStage) {
          useStudioStore.getState().loadStage(config.lastStage);
        }
      })
      .catch(() => { /* server not up yet, skip restore */ });

    return () => {
      useStudioStore.getState().cleanupRealtimeEvents();
    };
  }, []);

  const [activeDrag, setActiveDrag] = useState<{ kind: string; label: string } | null>(null);
  const [dropWarning, setDropWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const [termHeight, setTermHeight] = useState(250);

  useEffect(() => () => {
    if (warningTimerRef.current) {
      window.clearTimeout(warningTimerRef.current);
    }
  }, []);

  const showDropWarning = (message: string) => {
    setDropWarning(message);
    if (warningTimerRef.current) {
      window.clearTimeout(warningTimerRef.current);
    }
    warningTimerRef.current = window.setTimeout(() => {
      setDropWarning(null);
      warningTimerRef.current = null;
    }, 4800);
  };

  const handleDragStart = createDragStartHandler(setActiveDrag);
  const handleDragEnd = createDragEndHandler(setActiveDrag.bind(null, null) as () => void, showDropWarning);

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`studio-app theme-${theme}`} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {dropWarning ? (
          <div className="app-warning-banner" role="status" aria-live="polite">
            <div className="app-warning-banner__copy">
              <AlertCircle size={13} />
              <span>{dropWarning}</span>
            </div>
            <button className="icon-btn" onClick={() => setDropWarning(null)} title="Dismiss warning">
              <X size={12} />
            </button>
          </div>
        ) : null}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Suspense fallback={null}>
            <LeftSidebar />
          </Suspense>
          <ReactFlowProvider>
            <CanvasArea />
          </ReactFlowProvider>
          {!isAnyFocusActive && (
            <Suspense fallback={null}>
              <AssistantChat />
            </Suspense>
          )}
        </div>
        {!isAnyFocusActive && (
          <Suspense fallback={null}>
            <TerminalPanel
              isOpen={isTerminalOpen}
              onToggle={() => setTerminalOpen(!isTerminalOpen)}
              height={termHeight}
              onHeightChange={setTermHeight}
            />
          </Suspense>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="drag-overlay-card">
            {getDragIcon(activeDrag.kind)}
            <span>{activeDrag.label}</span>
          </div>
        ) : null}
      </DragOverlay>
      <Suspense fallback={null}>
        <ToastViewport />
      </Suspense>
    </DndContext>
  );
}
