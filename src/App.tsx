import { useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { AlertCircle, Hexagon, Zap, Cpu, Server, Package, X } from 'lucide-react';
import { useStudioStore } from './store';
import { LeftSidebar, CanvasArea, ToastViewport, TerminalPanel } from './features/workspace';
import { api, setApiWorkingDirContext } from './api';
import { showToast } from './lib/toast';
import { normalizeAssetMcpForStudio, normalizeAssetModelForStudio } from './lib/performers';
import type { ActNodeType, ActSessionLifetime, ActSessionPolicy } from './types';
import type { StudioState } from './store';
import { projectMcpServerNames } from '../shared/project-mcp';
import { extractMcpServerNamesFromConfig } from '../shared/mcp-config';
import {
  toDragPreview,
  isInstalledAsset,
  getAssetAuthor,
  getAssetSlug,
  findActNode,
  ensureActNodePerformer,
  applyTalToPerformer,
  applyDanceToPerformer,
  applyModelToPerformer,
  applyMcpToPerformer,
  applyAssetToPerformerTarget,
} from './lib/dnd-handlers';
import type { DragAsset, DropTargetData, PerformerAssetPayload } from './lib/dnd-handlers';

export default function App() {
  const theme = useStudioStore(s => s.theme);
  const workingDir = useStudioStore(s => s.workingDir);
  const performers = useStudioStore(s => s.performers);
  const edges = useStudioStore(s => s.edges);
  const acts = useStudioStore(s => s.acts);
  const drafts = useStudioStore(s => s.drafts);
  const markdownEditors = useStudioStore(s => s.markdownEditors);
  const sessionMap = useStudioStore(s => s.sessionMap);
  const actChats = useStudioStore(s => s.actChats);
  const actSessionMap = useStudioStore(s => s.actSessionMap);
  const actSessions = useStudioStore(s => s.actSessions);
  const canvasTerminals = useStudioStore(s => s.canvasTerminals);
  const stageDirty = useStudioStore(s => s.stageDirty);
  const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
  const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);

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
  }, [stageDirty, performers, edges, acts, drafts, markdownEditors, workingDir, sessionMap, actChats, actSessionMap, actSessions, canvasTerminals]);

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDrag(toDragPreview((event.active.data.current as DragAsset | undefined) || {}));
  };

  const loadMarkdownTemplateIntoEditor = async (
    editorId: string,
    asset: DragAsset,
    store: StudioState,
  ) => {
    const editor = store.markdownEditors.find((item) => item.id === editorId);
    if (!editor) {
      throw new Error('Editor not found.');
    }
    if (editor.kind !== asset.kind) {
      showDropWarning(`${editor.kind === 'tal' ? 'Tal' : 'Dance'} editor only accepts ${editor.kind} assets.`);
      return;
    }

    const isLocalInstalled = isInstalledAsset(asset);
    const detail = !isLocalInstalled
      ? await api.assets.getRegistry(asset.kind as 'tal' | 'dance', getAssetAuthor(asset), getAssetSlug(asset))
      : await api.assets.get(asset.kind as 'tal' | 'dance', getAssetAuthor(asset), getAssetSlug(asset));

    const currentDraft = store.drafts[editor.draftId];
    if (!currentDraft) {
      throw new Error('Editor draft not found.');
    }

    store.upsertDraft({
      ...currentDraft,
      name: detail.name || asset.name || currentDraft.name,
      slug: detail.slug || asset.slug || asset.name,
      description: detail.description || detail.name || asset.name,
      tags: Array.isArray(detail.tags) ? detail.tags : [],
      content: typeof detail.content === 'string' ? detail.content : '',
      derivedFrom: detail.urn || asset.urn || undefined,
      updatedAt: Date.now(),
    });
    store.updateMarkdownEditorBaseline(editor.id, {
      name: detail.name || asset.name || currentDraft.name,
      slug: detail.slug || asset.slug || asset.name,
      description: detail.description || detail.name || asset.name,
      tags: Array.isArray(detail.tags) ? detail.tags : [],
      content: typeof detail.content === 'string' ? detail.content : '',
    });
    store.selectMarkdownEditor(editor.id);
    showToast(`Loaded ${asset.kind} template into the editor.`, 'success');
  };

  const importActAsset = async (
    asset: DragAsset,
    store: StudioState,
  ) => {
    const detail = isInstalledAsset(asset)
      ? await api.assets.get('act', getAssetAuthor(asset), getAssetSlug(asset))
      : await api.assets.getRegistry('act', getAssetAuthor(asset), getAssetSlug(asset));
    await store.importActFromAsset(detail);
  };

  const resolvePerformerAssetForStudio = async (asset: DragAsset): Promise<PerformerAssetPayload> => {
    const projectConfig = await api.config.getProject().catch(() => ({ config: {} }));
    const projectMcpNames = projectMcpServerNames(projectConfig.config);
    const runtimeModels = await api.models.list();
    const normalized = normalizeAssetMcpForStudio(
      normalizeAssetModelForStudio(asset, runtimeModels),
      projectMcpNames,
    );
    if (!normalized.model && normalized.modelPlaceholder) {
      showDropWarning(`Model ${normalized.modelPlaceholder.provider}/${normalized.modelPlaceholder.modelId} is not available in this Studio runtime. A placeholder was kept so you can pick a replacement.`);
    }
    const declaredMcpNames = extractMcpServerNamesFromConfig(asset.mcpConfig);
    const unresolvedMcpNames = declaredMcpNames.filter((name) => !(normalized.mcpBindingMap?.[name] || '').trim());
    if (unresolvedMcpNames.length > 0) {
      showDropWarning(`Imported MCP placeholders need mapping in the performer editor or Asset Library: ${unresolvedMcpNames.join(', ')}`);
    }
    return normalized as PerformerAssetPayload;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const asset = active.data.current as DragAsset;
    const dropData = over.data.current as DropTargetData;

    if (!asset || !dropData) {
      return;
    }

    const store = useStudioStore.getState();

    const handleCanvasRootDrop = async () => {
      if (dropData.type !== 'canvas-root') {
        return false;
      }

      if (asset.kind === 'performer') {
        store.addPerformerFromAsset(await resolvePerformerAssetForStudio(asset));
        return true;
      }

      if (asset.kind !== 'act') {
        return false;
      }

      try {
        await importActAsset(asset, store);
      } catch (error) {
        console.error('Failed to import act asset', error);
        showToast('Failed to import act asset.', 'error', {
          title: 'Act import failed',
          dedupeKey: `act-import:${asset.urn || `${asset.author || ''}/${asset.slug || asset.name}`}`,
          actionLabel: 'Retry',
          onAction: () => {
            void importActAsset(asset, useStudioStore.getState()).catch((retryError) => {
              console.error('Failed to retry act import', retryError);
            });
          },
        });
      }
      return true;
    };

    const handleMarkdownEditorDrop = async () => {
      if (dropData.type !== 'markdown-editor' || (asset.kind !== 'tal' && asset.kind !== 'dance') || !dropData.editorId) {
        return false;
      }

      try {
        await loadMarkdownTemplateIntoEditor(dropData.editorId, asset, store);
      } catch (error) {
        console.error('Failed to load markdown template', error);
        showToast('Failed to load asset template into the editor.', 'error', {
          title: 'Template import failed',
          dedupeKey: `markdown-template-import:${dropData.editorId}:${asset.kind}:${asset.slug || asset.name}`,
          actionLabel: 'Retry',
          onAction: () => {
            void loadMarkdownTemplateIntoEditor(dropData.editorId as string, asset, useStudioStore.getState()).catch((retryError) => {
              console.error('Failed to retry markdown template load', retryError);
            });
          },
        });
      }
      return true;
    };

    const handleActAreaDrop = async () => {
      if (dropData.type !== 'act-area' || asset.kind !== 'performer' || !dropData.actId) {
        return false;
      }

      store.addPerformerAssetToAct(dropData.actId, await resolvePerformerAssetForStudio(asset));
      return true;
    };

    const handleActNodePerformerDrop = async () => {
      if (dropData.type !== 'act-node-performer' || asset.kind !== 'performer' || !dropData.actId || !dropData.nodeId) {
        return false;
      }

      store.createActOwnedPerformerForNode(dropData.actId, dropData.nodeId, await resolvePerformerAssetForStudio(asset));
      return true;
    };

    const handleActNodeSemanticDrop = () => {
      if (dropData.type !== 'act-node-semantic' || asset.kind !== 'act-semantic' || !dropData.actId || !dropData.nodeId) {
        return false;
      }

      const { act, node } = findActNode(store, dropData.actId, dropData.nodeId);
      if (!act || !node) {
        return true;
      }

      if (asset.semanticType === 'entry') {
        store.updateActMeta(dropData.actId, { entryNodeId: dropData.nodeId });
        return true;
      }

      if (asset.semanticType === 'node-type') {
        store.setActNodeType(dropData.actId, dropData.nodeId, asset.value as ActNodeType);
        return true;
      }

      if (node.type === 'parallel') {
        showDropWarning('Session reuse and lifetime apply only to performer-backed nodes.');
        return true;
      }

      if (asset.semanticType === 'session-policy') {
        store.updateActNode(dropData.actId, dropData.nodeId, { sessionPolicy: asset.value as ActSessionPolicy });
        return true;
      }

      if (asset.semanticType === 'session-lifetime') {
        store.updateActNode(dropData.actId, dropData.nodeId, { sessionLifetime: asset.value as ActSessionLifetime });
      }

      return true;
    };

    const handleActNodeAssetDrop = () => {
      if (!dropData.actId || !dropData.nodeId) {
        return false;
      }

      if (dropData.type === 'act-node-tal' && asset.kind === 'tal') {
        const performerId = ensureActNodePerformer(store, dropData.actId, dropData.nodeId);
        if (performerId) {
          applyTalToPerformer(store, performerId, asset);
        }
        return true;
      }

      if (dropData.type === 'act-node-dance' && asset.kind === 'dance') {
        const performerId = ensureActNodePerformer(store, dropData.actId, dropData.nodeId);
        if (performerId) {
          applyDanceToPerformer(store, performerId, asset);
        }
        return true;
      }

      if (dropData.type === 'act-node-model' && asset.kind === 'model') {
        const performerId = ensureActNodePerformer(store, dropData.actId, dropData.nodeId);
        if (performerId) {
          applyModelToPerformer(store, performerId, asset, showDropWarning);
        }
        return true;
      }

      if (dropData.type === 'act-node-mcp' && asset.kind === 'mcp') {
        const performerId = ensureActNodePerformer(store, dropData.actId, dropData.nodeId);
        if (performerId) {
          applyMcpToPerformer(store, performerId, asset);
        }
        return true;
      }

      return false;
    };

    if (await handleCanvasRootDrop()) {
      return;
    }

    if (await handleMarkdownEditorDrop()) {
      return;
    }

    if (await handleActAreaDrop()) {
      return;
    }

    if (await handleActNodePerformerDrop()) {
      return;
    }

    if (handleActNodeSemanticDrop()) {
      return;
    }

    if (handleActNodeAssetDrop()) {
      return;
    }

    if (dropData.performerId) {
      await applyAssetToPerformerTarget(
        store,
        dropData.performerId,
        dropData.type,
        asset,
        showDropWarning,
        resolvePerformerAssetForStudio,
      );
    }
  };

  const getDragIcon = (kind: string) => {
    switch (kind) {
      case 'tal': return <Hexagon size={12} className="asset-icon tal" />;
      case 'dance': return <Zap size={12} className="asset-icon dance" />;
      case 'model': return <Cpu size={12} className="asset-icon model" />;
      case 'mcp': return <Server size={12} className="asset-icon mcp" />;
      case 'performer': return <Package size={12} className="asset-icon performer" />;
      case 'act-semantic': return <Package size={12} className="asset-icon performer" />;
      default: return <Package size={12} />;
    }
  };

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
          <LeftSidebar />
          <ReactFlowProvider>
            <CanvasArea />
          </ReactFlowProvider>
        </div>
        <TerminalPanel
          isOpen={isTerminalOpen}
          onToggle={() => setTerminalOpen(!isTerminalOpen)}
          height={termHeight}
          onHeightChange={setTermHeight}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="drag-overlay-card">
            {getDragIcon(activeDrag.kind)}
            <span>{activeDrag.label}</span>
          </div>
        ) : null}
      </DragOverlay>
      <ToastViewport />
    </DndContext>
  );
}
