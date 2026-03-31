import { Suspense, lazy, useState, useCallback, useEffect, useRef } from 'react';
import { ChevronRight, LayoutGrid } from 'lucide-react';
import { useStudioStore } from '../../store';
import WorkspaceExplorer from './WorkspaceExplorer';
import './LeftSidebar.css';

const AssetLibrary = lazy(() =>
    import('../../features/assets').then((module) => ({ default: module.AssetLibrary })),
);

export default function LeftSidebar() {
    const isAssetLibraryOpen = useStudioStore((s) => s.isAssetLibraryOpen);
    const setAssetLibraryOpen = useStudioStore((s) => s.setAssetLibraryOpen);
    const focusSnapshot = useStudioStore((s) => s.focusSnapshot);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [drawerWidth, setDrawerWidth] = useState(320);

    const suppressNextClick = useCallback(() => {
        const handleClickCapture = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            document.removeEventListener('click', handleClickCapture, true);
        };

        document.addEventListener('click', handleClickCapture, true);
        window.setTimeout(() => {
            document.removeEventListener('click', handleClickCapture, true);
        }, 0);
    }, []);

    const useResize = (setter: (w: number) => void, min: number, max: number) => {
        const dragging = useRef(false);

        const onMouseDown = useCallback((e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragging.current = true;
            const startX = e.clientX;
            const startW = (() => {
                const el = (e.target as HTMLElement).parentElement;
                return el ? el.getBoundingClientRect().width : 240;
            })();

            const onMove = (ev: MouseEvent) => {
                if (!dragging.current) return;
                const delta = ev.clientX - startX;
                setter(Math.min(max, Math.max(min, startW + delta)));
            };
            const onUp = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                dragging.current = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                suppressNextClick();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }, [setter, min, max]);

        return onMouseDown;
    };

    const onSidebarResize = useResize(setSidebarWidth, 180, 400);
    const onDrawerResize = useResize(setDrawerWidth, 240, 480);

    const isFocusActive = !!focusSnapshot;
    const isAssetDrawerOpen = !isFocusActive && isAssetLibraryOpen;

    useEffect(() => {
        if (isFocusActive && isAssetLibraryOpen) {
            setAssetLibraryOpen(false);
        }
    }, [isFocusActive, isAssetLibraryOpen, setAssetLibraryOpen]);

    return (
        <div className={`sidebar-container ${isAssetDrawerOpen ? 'sidebar-container--drawer-open' : ''}`}>
            <div className="sidebar" style={{ width: sidebarWidth }}>
                <div className="sidebar-main-top" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <WorkspaceExplorer />
                </div>
                {!isFocusActive && (
                    <div className="sidebar-main-bottom sidebar-main-bottom--asset-drawer">
                        <button
                            className={`asset-library-btn ${isAssetDrawerOpen ? 'active' : ''}`}
                            onClick={() => setAssetLibraryOpen(!isAssetLibraryOpen)}
                        >
                            <LayoutGrid size={14} />
                            <span>Asset Library</span>
                            <ChevronRight size={12} className={`asset-library-arrow ${isAssetDrawerOpen ? 'rotated' : ''}`} />
                        </button>
                    </div>
                )}
                <div
                    className="sidebar-resize-handle"
                    onMouseDown={onSidebarResize}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                />
            </div>
            <div
                className={`sidebar-drawer left-drawer ${isAssetDrawerOpen ? 'open' : ''}`}
                style={isAssetDrawerOpen ? { width: drawerWidth } : undefined}
            >
                <div
                    className="sidebar-resize-handle sidebar-resize-handle--drawer"
                    onMouseDown={onDrawerResize}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                />
                {isAssetDrawerOpen ? (
                    <Suspense fallback={null}>
                        <AssetLibrary onClose={() => setAssetLibraryOpen(false)} />
                    </Suspense>
                ) : null}
            </div>
        </div>
    );
}
