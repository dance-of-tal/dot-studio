import { useState, useCallback, useRef } from 'react';
import { ChevronLeft, LayoutGrid } from 'lucide-react';
import { useStudioStore } from '../../store';
import StageExplorer from './StageExplorer';
import { AssetLibrary } from '../../features/assets';
import './LeftSidebar.css';

export default function LeftSidebar() {
    const isAssetLibraryOpen = useStudioStore((s) => s.isAssetLibraryOpen);
    const setAssetLibraryOpen = useStudioStore((s) => s.setAssetLibraryOpen);
    const focusedPerformerId = useStudioStore((s) => s.focusedPerformerId);
    const [sidebarWidth, setSidebarWidth] = useState(240);
    const [drawerWidth, setDrawerWidth] = useState(320);

    const useResize = (setter: (w: number) => void, min: number, max: number) => {
        const dragging = useRef(false);

        const onMouseDown = useCallback((e: React.MouseEvent) => {
            e.preventDefault();
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
            const onUp = () => {
                dragging.current = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
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

    const isFocused = !!focusedPerformerId;

    return (
        <div className={`sidebar-container ${isAssetLibraryOpen ? 'sidebar-container--drawer-open' : ''}`}>
            <div className="sidebar" style={{ width: sidebarWidth }}>
                <div className="sidebar-main-top" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <StageExplorer />
                </div>
                {!isFocused && (
                    <div className="sidebar-main-bottom sidebar-main-bottom--asset-drawer">
                        <button
                            className={`asset-library-btn ${isAssetLibraryOpen ? 'active' : ''}`}
                            onClick={() => setAssetLibraryOpen(!isAssetLibraryOpen)}
                        >
                            <LayoutGrid size={14} />
                            <span>Asset Library</span>
                            <ChevronLeft size={12} className={`asset-library-arrow ${isAssetLibraryOpen ? 'rotated' : ''}`} />
                        </button>
                    </div>
                )}
                <div
                    className={`sidebar-resize-handle ${isAssetLibraryOpen ? 'sidebar-resize-handle--occluded' : ''}`}
                    onMouseDown={onSidebarResize}
                />
            </div>
            <div
                className={`sidebar-drawer left-drawer ${isAssetLibraryOpen ? 'open' : ''}`}
                style={isAssetLibraryOpen ? { width: drawerWidth } : undefined}
            >
                <div className="sidebar-resize-handle sidebar-resize-handle--drawer" onMouseDown={onDrawerResize} />
                <AssetLibrary onClose={() => setAssetLibraryOpen(false)} />
            </div>
        </div>
    );
}
