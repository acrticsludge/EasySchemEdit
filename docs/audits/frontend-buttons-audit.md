# Frontend Buttons & Clickable Controls Audit

**Audit Date:** 2026-11-14  
**Target Package:** `apps/web/src/`  
**Scope:** Every `<button>` element and clickable `role="button"` control across all frontend UI components, dialogs, tools, and viewports.

---

## 1. Executive Summary & Counts Matrix

A complete scan of all 51 source files under `apps/web/src/` identified **18 component files** containing button controls. Across these 18 files, there are **157 total button definitions** (155 `<button>` elements via JSX and `React.createElement`, plus 2 interactive `<div role="button">` expander bars).

| Category | Count | Description |
|---|---|---|
| **Total Button Controls** | **157** | All `<button>` and `role="button"` elements defined in `apps/web/src/` |
| **Active / Wired (Distinct)** | **87** | Functional, single-purpose buttons with active handlers tied to domain stores/controllers |
| **Duplicate Buttons** | **59** | Buttons exposing identical operations across multiple panels (14 distinct action clusters) |
| **Dead / Broken / Unreachable** | **11** | Fully implemented buttons locked in an unreachable dialog (`ProjectDialog` is never opened) |

### Summary by Component

| Component / Panel File | Buttons Count | Primary Role |
|---|:---:|---|
| [apps/web/src/editor/layout/BottomDock.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx) | 4 | Tab bar navigation, collapse toggle, history fallback undo/redo |
| [apps/web/src/editor/layout/InspectorPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx) | 13 | Placement property inspector, nudge, rotation, mirror, duplicate, lock, delete |
| [apps/web/src/editor/layout/OutlinerPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx) | 5 | Placement hierarchy, visibility, lock, duplicate, delete, collapse |
| [apps/web/src/editor/layout/Toolbar.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx) | 8 | Top bar: undo/redo, file operations, tool selectors, overlay toggles |
| [apps/web/src/editor/layout/WorkspaceShell.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/WorkspaceShell.tsx) | 4 | Dock tab switcher, right dock collapse, collapsed expander bars (`role="button"`) |
| [apps/web/src/editor/assets/AssetLoadPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx) | 8 | Mojang CDN download, cache clear, pack management (`React.createElement`) |
| [apps/web/src/editor/mcp/AgentLogPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/mcp/AgentLogPanel.tsx) | 3 | MCP AI agent companion pairing, disconnect, per-entry undo |
| [apps/web/src/editor/panels/BakeDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx) | 4 | Modal dialog: selection checklist, cancel, execute bake |
| [apps/web/src/editor/panels/ConflictsPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx) | 7 | Overlap resolution, overlay mode toggles, conflict navigation, bake all |
| [apps/web/src/editor/panels/MaterialListPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx) | 5 | Composite vs per-placement mode toggle, CSV/JSON clipboard export, search clear |
| [apps/web/src/editor/persistence/ExportDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx) | 5 | Modal dialog: Sponge v3 vs Litematica format choice, export & download, close |
| [apps/web/src/editor/persistence/LibraryPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx) | 7 | Build preset library: save active placement, tag filter, place in scene, delete |
| [apps/web/src/editor/persistence/ProjectDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx) | 11 | IDB project manager & crash recovery (**Unreachable: modal trigger missing**) |
| [apps/web/src/editor/tools/BlockPickerPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx) | 13 | Region execution: Fill, Walls, Hollow, Delete, Replace, Copy, Cut, Paste, Move |
| [apps/web/src/editor/viewport/SelectedPlacementBar.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx) | 8 | Floating viewport HUD: gizmo switch, rotate 90°, step toggle, nudge, duplicate, delete |
| [apps/web/src/editor/viewport/ViewportCanvas.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx) | 7 | Viewport HUD: Orbit/Fly camera toggle, Iso/Top/Front/Right presets, Frame All, HUD fold |
| [apps/web/src/editor/workflows/ImportDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx) | 11 | Ghost placement HUD (rotate, mirror, snap, place, cancel) & import wizard dialog |
| [apps/web/src/editor/workflows/TransformControls.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx) | 34 | Multi-selection & single-placement transforms: nudge, rotate, mirror, pivot, lock, delete |

---

## 2. Component-by-Component Inventory

### 2.1 [BottomDock.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx) (4 buttons)
Renders the bottom dock tab switcher, collapse button, and tab panel contents (including history fallback).

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [119](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx#L119) | `{tab.icon} {tab.label}` | `role="tab"`, `aria-selected` | `handleSelectTab(tab.id)` | None | **Active / Wired** | Switches bottom dock active tab between Assets, Materials, Conflicts, History, Agent Log. |
| [150](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx#L150) | `▼` | `title="Collapse Bottom Dock"` | `onCollapse` | None | **Active / Wired** | Collapses the bottom dock panel via `controllers.layout.collapsePanel('bottom-dock')`. |
| [198](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx#L198) | `↺ Undo (Ctrl+Z)` | None | `() => void store.undo()` | `!snapshot.canUndo` | **Duplicate** | Triggers session undo in default/fallback History tab. (Duplicate of Toolbar line 129). |
| [209](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx#L209) | `↻ Redo (Ctrl+Y)` | None | `() => void store.redo()` | `!snapshot.canRedo` | **Duplicate** | Triggers session redo in default/fallback History tab. (Duplicate of Toolbar line 150). |

---

### 2.2 [InspectorPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx) (13 buttons)
Detailed property inspector for the currently selected placement in the right dock.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [51](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L51) | `▶` | `title="Collapse Inspector"` | `onCollapse` | None | **Active / Wired** | Collapses inspector panel when no placement is selected. |
| [239](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L239) | `▶` | `title="Collapse Inspector"` | `onCollapse` | None | **Active / Wired** | Collapses inspector panel when a placement is active. |
| [310](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L310) | `±1` | `title="Nudge step: 1 block"` | `() => setNudgeStep(1)` | None | **Duplicate** | Sets local nudge increment to 1 block. (Duplicate of SelectedPlacementBar & TransformControls). |
| [323](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L323) | `±16` | `title="Nudge step: 16 blocks (Chunk)"` | `() => setNudgeStep(16)` | None | **Duplicate** | Sets local nudge increment to 16 blocks. (Duplicate of SelectedPlacementBar & TransformControls). |
| [341](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L341) | `-{axis}` | `title="Nudge -{step} on {axis}"` | `() => handleNudge(axis, -1)` | `placement.locked` | **Duplicate** | Nudges placement translation negatively on X, Y, or Z by nudgeStep. (Duplicate of SelectedPlacementBar & TransformControls). |
| [355](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L355) | `+{axis}` | `title="Nudge +{step} on {axis}"` | `() => handleNudge(axis, 1)` | `placement.locked` | **Duplicate** | Nudges placement translation positively on X, Y, or Z by nudgeStep. (Duplicate of SelectedPlacementBar & TransformControls). |
| [432](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L432) | `{r}°` | None (rendered for 0°, 90°, 180°, 270°) | `() => handleSetRotation(r)` | `placement.locked` | **Duplicate** | Sets absolute placement Y-rotation. (Duplicate of TransformControls & SelectedPlacementBar). |
| [464](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L464) | `{label}` | None (rendered for None, X, Z) | `() => handleSetMirror(m)` | `placement.locked` | **Duplicate** | Sets placement mirror reflection axis. (Duplicate of TransformControls). |
| [507](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L507) | `⎘ Duplicate Side-by-Side` | `title="Duplicate Side-by-Side (Ctrl+D)"` | `handleDuplicatePlacement` | `placement.locked` | **Duplicate** | Clones placement displaced width+1 along X. (Duplicate of Outliner, SelectedPlacementBar, TransformControls). |
| [527](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L527) | `🔒 Unlock` / `🔓 Lock` | `title="Unlock/Lock Placement"` | `handleToggleLock` | None | **Duplicate** | Toggles lock status preventing accidental edits. (Duplicate of Outliner & TransformControls). |
| [543](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L543) | `✕ Delete` | `title="Delete Placement"` | `handleDeletePlacement` | `placement.locked` | **Duplicate** | Deletes placement from session. (Duplicate of Outliner, SelectedPlacementBar, TransformControls). |
| [624](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L624) | `▲` | None | `() => onChange(value + step)` | `disabled` | **Active / Wired** | Increments numeric coordinate in `NumericField` component (Position X/Y/Z, Origin X/Y/Z). |
| [632](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L632) | `▼` | None | `() => onChange(value - step)` | `disabled` | **Active / Wired** | Decrements numeric coordinate in `NumericField` component (Position X/Y/Z, Origin X/Y/Z). |

---

### 2.3 [OutlinerPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx) (5 buttons)
Left-dock hierarchy tree displaying all placements in precedence order.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [170](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L170) | `◀` | `title="Collapse Outliner"` | `onCollapse` | None | **Active / Wired** | Collapses left outliner dock via `controllers.layout.collapsePanel('hierarchy')`. |
| [272](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L272) | `👁` / `—` | `title="Hide/Show Placement"` | `handleToggleVisibility` | None | **Duplicate** | Toggles placement rendering visibility. (Duplicate of TransformControls line 865). |
| [286](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L286) | `🔒` / `🔓` | `title="Unlock/Lock Placement"` | `handleToggleLock` | None | **Duplicate** | Toggles placement lock. (Duplicate of Inspector line 527 & TransformControls line 853). |
| [326](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L326) | `⎘` | `title="Duplicate Side-by-Side (Ctrl+D)"` | `handleDuplicatePlacement` | `placement.locked` | **Duplicate** | Clones placement adjacent to current placement. (Duplicate of Inspector, SelectedPlacementBar, TransformControls). |
| [340](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L340) | `✕` | `title="Delete Placement"` | `handleDeletePlacement` | `placement.locked` | **Duplicate** | Deletes placement from project. (Duplicate of Inspector, SelectedPlacementBar, TransformControls). |

---

### 2.4 [Toolbar.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx) (8 buttons)
Global top toolbar for project actions, undo/redo, tool selection, and overlay toggles.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [129](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L129) | `↺` | `title="Undo (Ctrl+Z)"` | `handleUndo` | `!canUndo` | **Duplicate** | Undoes last session operation. (Duplicate of BottomDock History line 198 & BlockPickerPanel line 233). |
| [150](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L150) | `↻` | `title="Redo (Ctrl+Y / Ctrl+Shift+Z)"` | `handleRedo` | `!canRedo` | **Duplicate** | Redoes last reverted operation. (Duplicate of BottomDock History line 209 & BlockPickerPanel line 249). |
| [177](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L177) | `Import` | `title="Import Schematic (.schem / .litematic)"` | `onImport` | None | **Active / Wired** | Opens `ImportDialog` modal. |
| [187](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L187) | `Export` | `title="Export Schematic (Ctrl+E)"` | `onExport` | None | **Active / Wired** | Opens `ExportDialog` modal. |
| [197](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L197) | `Bake` | `title="Bake Placements into World"` | `onBake` | None | **Duplicate** | Opens `BakeDialog` modal. (Duplicate with ConflictsPanel line 148 bake shortcut). |
| [207](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L207) | `Save` | `title="Save Project (Ctrl+S)"` | `onSave` | None | **Duplicate** | Calls `runtime.persistence.saveCurrentProject()` directly to save to IndexedDB. |
| [232](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L232) | `{tool.icon} {tool.label}` | `title="{tool.label} ({shortcut})"` | `() => handleSelectTool(tool.id)` | None | **Active / Wired** | Iterates over 10 tools (`select`, `move`, `rotate`, `cuboid`, `fill`, `replace`, `walls`, `hollow`, `delete`, `paste`). Sets active tool mode. |
| [303](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L303) | `{label}` | `aria-pressed` | `onClick` | None | **Active / Wired** | Reusable `OverlayToggle` component used 4 times (Chunk borders, Section grid, Block outlines, Conflicts). |

---

### 2.5 [WorkspaceShell.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/WorkspaceShell.tsx) (4 buttons)
Root layout container hosting left outliner, middle 3D viewport, right dock, and bottom dock.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [402](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/WorkspaceShell.tsx#L402) | `{tabId}` | None (inspector, tools, transform, library) | `() => setRightDockTab(tabId)` | None | **Active / Wired** | Switches tabs in the right dock. |
| [424](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/WorkspaceShell.tsx#L424) | `▶` | `title="Collapse Right Dock"` | `() => controllers.layout.collapsePanel('inspector')` | None | **Active / Wired** | Collapses the entire right dock container. |
| [536](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/WorkspaceShell.tsx#L536) | `{label}` | `role="button"`, `title="Click to expand {label}"` | `onClick` | None | **Active / Wired** | Vertical collapsed bar that restores Left Dock (Outliner) or Right Dock (Inspector/Tools). |
| [572](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/WorkspaceShell.tsx#L572) | `{label}` | `role="button"`, `title="Click to expand bottom dock"` | `onClick` | None | **Active / Wired** | Horizontal collapsed bar that restores Bottom Dock. |

---

### 2.6 [AssetLoadPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx) (8 buttons)
Asset pipeline UI for fetching Mojang client assets and loading custom resource packs. Rendered via `React.createElement` (`h`).

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [249](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L249) | `✕` | `aria-label="Close panel"` | `onClose` | None | **Active / Wired** | Closes the asset panel if mounted as overlay. |
| [350](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L350) | `Auto-Download Assets (1.21.11)` | None | `() => manager.autoLoad()` | `isBusy` | **Active / Wired** | Downloads official client JAR & extracted assets from Mojang CDN with SHA-1 check. |
| [369](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L369) | `Hide Manual Import` / `Load Local .jar` | None | `() => setShowManualImport((v) => !v)` | None | **Active / Wired** | Toggles local client JAR manual upload dropzone. |
| [387](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L387) | `Clear Cache` | None | `() => manager.clearCacheAndReload()` | None | **Active / Wired** | Evicts cached textures from IndexedDB asset cache and re-extracts. |
| [499](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L499) | `+ Add Pack (.zip)` | None | `() => packInputRef.current?.click()` | None | **Active / Wired** | Opens file picker to load custom resource pack zip. |
| [602](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L602) | `▲` | `aria-label="Move {pack.name} up"` | `() => manager.moveResourcePack(pack.id, 'up')` | `index === 0` | **Active / Wired** | Moves resource pack higher in resolution priority. |
| [621](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L621) | `▼` | `aria-label="Move {pack.name} down"` | `() => manager.moveResourcePack(pack.id, 'down')` | `index === len-1` | **Active / Wired** | Moves resource pack lower in resolution priority. |
| [640](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/assets/AssetLoadPanel.tsx#L640) | `✕` | `aria-label="Remove {pack.name}"` | `() => manager.removeResourcePack(pack.id)` | None | **Active / Wired** | Unloads custom resource pack and refreshes texture atlas. |

---

### 2.7 [AgentLogPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/mcp/AgentLogPanel.tsx) (3 buttons)
MCP companion status and audit log for AI agent edits.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [120](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/mcp/AgentLogPanel.tsx#L120) | `Disconnect` | None | `handleDisconnect` | None | **Active / Wired** | Closes WebSocket pairing bridge with local MCP companion server (`127.0.0.1:43127`). |
| [136](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/mcp/AgentLogPanel.tsx#L136) | `Pair Browser` / `Pairing...` | None | `handlePair` | `isConnecting \|\| !pairingToken` | **Active / Wired** | Initiates handshake and exchanges HMAC pairing token with companion bridge. |
| [341](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/mcp/AgentLogPanel.tsx#L341) | `Undo` / `Undone` | `title="Undo this operation"` | `() => handleUndo(entry.id)` | `!undoAvailable` | **Active / Wired** | Rolls back a specific MCP agent operation revision from the companion log. |

---

### 2.8 [BakeDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx) (4 buttons)
Modal dialog for baking multi-placement composites into single consolidated volumes.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [138](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx#L138) | `✕` | `aria-label="Close dialog"` | `onClose` | `isExecuting` | **Active / Wired** | Dismisses dialog without baking. |
| [262](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx#L262) | `Select All` / `Deselect All` | None | `handleSelectAll` | None | **Active / Wired** | Toggles all available placements in target checklist. |
| [397](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx#L397) | `Cancel` | None | `onClose` | `isExecuting` | **Active / Wired** | Footer cancel button; dismisses modal. |
| [415](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx#L415) | `Bake Placements` | None | `() => void handleExecuteBake()` | `isInvalid \|\| isExecuting` | **Duplicate** | Executes volumetric composite bake operation according to selected overlap policy. (Duplicate of ConflictsPanel bake action). |

---

### 2.9 [ConflictsPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx) (7 buttons)
Volumetric collision detection and resolution interface in the bottom dock.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [148](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L148) | `Bake All Overlaps` | None | `() => void handleBakeAll()` | `stats.totalOverlaps === 0` | **Duplicate** | Resolves all detected overlaps via composite bake. (Duplicate of Toolbar Bake & BakeDialog). |
| [186](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L186) | `Off` / `Conflicts Only` / `All Overlaps` | None | `() => controller.setOverlayMode(mode)` | None | **Active / Wired** | Changes 3D viewport conflict highlight overlay rendering mode. |
| [208](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L208) | `◀ Prev` | `title="Previous Conflict"` | `() => controller.prev()` | `conflictList.length <= 1` | **Active / Wired** | Navigates to previous conflict in list and focuses 3D camera. |
| [232](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L232) | `Next ▶` | `title="Next Conflict"` | `() => controller.next()` | `conflictList.length <= 1` | **Active / Wired** | Navigates to next conflict in list and focuses 3D camera. |
| [355](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L355) | `Keep Top` | `title="Keep block in top placement and delete from overlapping placements"` | `handleKeepWinner(entry, topPlacementId)` | `resolvingId !== null` | **Active / Wired** | Resolves conflict by keeping top placement voxel and deleting lower placement voxel. |
| [379](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L379) | `Keep Bottom` | `title="Keep block in bottom placement and delete from top placements"` | `handleKeepWinner(entry, bottomPlacementId)` | `resolvingId !== null` | **Active / Wired** | Resolves conflict by keeping lower placement voxel and carving out top voxel. |
| [402](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L402) | `Hide Losers` | None | `handleHideLosers(entry, topPlacementId)` | `resolvingId !== null` | **Active / Wired** | Masks conflicting blocks in loser placement without destructive voxel deletion. |

---

### 2.10 [MaterialListPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx) (5 buttons)
Material inventory accounting and clipboard export in the bottom dock.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [114](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx#L114) | `Effective Composite` | None | `() => void controller.setMode('effective')` | None | **Active / Wired** | Calculates materials based on final baked world (excluding covered/occluded blocks). |
| [130](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx#L130) | `Per-Placement` | None | `() => void controller.setMode('perPlacement')` | None | **Active / Wired** | Calculates materials broken down per individual placement volume. |
| [188](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx#L188) | `Copy CSV` / `✓ Copied CSV` | None | `() => void handleCopyCsv()` | None | **Active / Wired** | Formats material bill of materials to CSV and copies to system clipboard. |
| [206](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx#L206) | `Copy JSON` / `✓ Copied JSON` | None | `() => void handleCopyJson()` | None | **Active / Wired** | Formats material bill of materials to JSON and copies to system clipboard. |
| [259](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/MaterialListPanel.tsx#L259) | `✕` | None | `() => controller.setSearchQuery('')` | None | **Active / Wired** | Clears material filter search input. |

---

### 2.11 [ExportDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx) (5 buttons)
Modal dialog for exporting schematics to disk.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [155](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx#L155) | `✕` | `aria-label="Close export dialog"` | `onClose` | `isExporting` | **Active / Wired** | Dismisses modal via header close button. |
| [190](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx#L190) | `Sponge v3 (.schem)` | None | `() => setTargetFormat('schem-v3')` | None | **Active / Wired** | Selects WorldEdit Sponge v3 format for export. |
| [209](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx#L209) | `Litematica (.litematic)` | None | `() => setTargetFormat('litematic')` | None | **Active / Wired** | Selects Litematica bit-packed long format for export. |
| [398](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx#L398) | `Close` | None | `onClose` | `isExporting` | **Active / Wired** | Dismisses modal via footer button. |
| [414](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ExportDialog.tsx#L414) | `Export & Download` | None | `handleExecuteExport` | `isExporting \|\| placements.length === 0` | **Active / Wired** | Serializes project to chosen format and triggers browser file download. |

---

### 2.12 [LibraryPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx) (7 buttons)
Build library manager in the right dock for persisting and reusing placement prefabs.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [212](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L212) | `➕ Save Active` / `Cancel` | None | `() => setShowSaveForm(!showSaveForm)` | None | **Active / Wired** | Toggles inline form to save current placement as a reusable library asset. |
| [229](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L229) | `✕` | `aria-label="Close library panel"` | `onClose` | None | **Active / Wired** | Closes library panel when mounted as standalone dialog. |
| [353](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L353) | `Save to Library` / `Saving...` | `type="submit"` | Form submit (`handleSaveToLibrary`) | `isLoading \|\| placements.length === 0` | **Active / Wired** | Submits save form to store prefab in IndexedDB library. (Triggered via `form.onSubmit`). |
| [404](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L404) | `All` | None | `() => setSelectedTag(null)` | None | **Active / Wired** | Resets tag filter to show all saved prefabs. |
| [421](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L421) | `{tag}` | None | `() => setSelectedTag(selectedTag === tag ? null : tag)` | None | **Active / Wired** | Toggles tag filtering on library presets. |
| [577](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L577) | `➕ Place in Scene` | None | `() => handlePlaceInScene(entry.id)` | `isLoading` | **Active / Wired** | Instantiates library preset as a new placement in the current project. |
| [594](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L594) | `✕` | `aria-label="Delete {entry.name}"` | `() => handleDeleteEntry(entry.id, entry.name)` | `isLoading` | **Active / Wired** | Deletes preset entry from IndexedDB build library. |

---

### 2.13 [ProjectDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx) (11 buttons)
Project manager dialog with crash recovery and `.vxproj` export/import.  
> [!WARNING]
> **UNREACHABLE COMPONENT:** In [EditorIsland.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/islands/EditorIsland.tsx#L46), `const [isProjectOpen, setIsProjectOpen] = useState(false)` is declared, but `setIsProjectOpen(true)` is never called anywhere in the codebase. As a result, this entire dialog and all 11 buttons cannot be reached by a user in the live frontend!

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [290](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L290) | `✕` | `aria-label="Close dialog"` | `onClose` | `isLoading` | **Dead / Unreachable** | Header close button. |
| [327](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L327) | `Restore` | None | `handleRestoreRecovery` | `isLoading` | **Dead / Unreachable** | Restores crash recovery snapshot from IndexedDB. |
| [344](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L344) | `Discard` | None | `handleDiscardRecovery` | `isLoading` | **Dead / Unreachable** | Discards crash recovery snapshot. |
| [388](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L388) | `💾 Save to IDB` | None | `handleSaveCurrent` | `isLoading` | **Dead / Unreachable** | Saves current project to IndexedDB projects table. |
| [405](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L405) | `➕ New Project` | None | `handleNewProjectClick` | `isLoading` | **Dead / Unreachable** | Resets editor to a blank empty project. |
| [426](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L426) | `⬇️ Download .vxproj Archive` | None | `handleDownloadVxproj` | `isLoading` | **Dead / Unreachable** | Bundles all placements & metadata into a `.vxproj` zip file. |
| [442](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L442) | `📂 Open .vxproj File...` | None | `handleOpenFileClick` | `isLoading` | **Dead / Unreachable** | Triggers hidden file input to unpack `.vxproj` archive into IndexedDB. |
| [474](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L474) | `↻ Refresh` | None | `refreshSavedProjects` | `isLoading` | **Dead / Unreachable** | Re-queries IndexedDB for saved projects. |
| [552](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L552) | `Open` | None | `() => handleLoadProject(proj.id)` | `isLoading` | **Dead / Unreachable** | Loads selected project from IndexedDB into active editor session. |
| [569](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L569) | `Delete` | `aria-label="Delete {proj.name}"` | `() => handleDeleteProject(proj.id)` | `isLoading` | **Dead / Unreachable** | Deletes project record and chunks from IndexedDB. |
| [636](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L636) | `Close` | None | `onClose` | `isLoading` | **Dead / Unreachable** | Footer close button. |

---

### 2.14 [BlockPickerPanel.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx) (13 buttons)
Block palette and region operations toolbar in the Right Dock `Tools` tab.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [233](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L233) | `Undo` | None | `() => store.undo()` | `!canUndo \|\| isExecuting` | **Duplicate** | Session undo button. (Duplicate of Toolbar line 129 & BottomDock line 198). |
| [249](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L249) | `Redo` | None | `() => store.redo()` | `!canRedo \|\| isExecuting` | **Duplicate** | Session redo button. (Duplicate of Toolbar line 150 & BottomDock line 209). |
| [418](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L418) | `✕` | `title="Remove property"` | `() => handleRemoveProperty(k)` | None | **Active / Wired** | Removes blockstate property from active paint state. |
| [488](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L488) | `Add` | None | `handleAddProperty` | None | **Active / Wired** | Adds key=value property to active blockstate string. |
| [516](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L516) | `Fill Region` | None | `regionTools.fill(...)` | `isExecuting \|\| !activeBounds` | **Duplicate** | Executes fill operation on active cuboid selection. (Duplicate of Toolbar `fill` mode). |
| [539](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L539) | `Walls` | None | `regionTools.walls(...)` | `isExecuting \|\| !activeBounds` | **Duplicate** | Executes hollow walls operation on active cuboid selection. (Duplicate of Toolbar `walls` mode). |
| [565](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L565) | `Hollow ({shellThickness})` | None | `regionTools.hollow(...)` | `isExecuting \|\| !activeBounds` | **Duplicate** | Executes hollow operation on active selection. (Duplicate of Toolbar `hollow` mode). |
| [588](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L588) | `Delete Region` | None | `regionTools.deleteRegion()` | `isExecuting \|\| !activeBounds` | **Duplicate** | Clears all blocks in region to air. (Duplicate of Toolbar `delete` mode). |
| [642](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L642) | `Replace` | None | `regionTools.replace(...)` | `isExecuting \|\| !activeBounds` | **Duplicate** | Replaces matching pattern blocks with target blockstate. (Duplicate of Toolbar `replace` mode). |
| [682](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L682) | `📋 Copy` | None | `regionTools.copy()` | `isExecuting \|\| !activeBounds` | **Active / Wired** | Copies active region voxel volume to internal clipboard. |
| [700](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L700) | `✂️ Cut` | None | `regionTools.cut()` | `isExecuting \|\| !activeBounds` | **Active / Wired** | Copies active region to clipboard and carves selection to air. |
| [718](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L718) | `📥 Paste` | None | `regionTools.paste(...)` | `isExecuting` | **Duplicate** | Pastes clipboard voxels at target location. (Duplicate of Toolbar `paste` mode). |
| [767](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L767) | `Move Region` | None | `regionTools.moveRegion(moveOffset)` | `isExecuting \|\| !activeBounds` | **Active / Wired** | Shifts selected blocks in place by [dx, dy, dz]. |

---

### 2.15 [SelectedPlacementBar.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx) (8 buttons)
Floating bottom HUD overlaid on the 3D viewport whenever a placement is selected.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [183](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L183) | `✥ Move (W)` | `title="Move Gizmo (W)"` | `handleSelectMove` | None | **Duplicate** | Activates Three.js TransformControls move gizmo. (Duplicate of Toolbar `move` tool). |
| [200](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L200) | `↻ Rotate 90° (E)` | `title="Rotate +90° (E)"` | `handleRotate` | `placement.locked` | **Duplicate** | Rotates placement +90° around Y. (Duplicate of Inspector, TransformControls). |
| [220](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L220) | `1` | `title="Step: 1 block"` | `() => setStep(1)` | None | **Duplicate** | Sets nudge step to 1 block. (Duplicate of Inspector line 310 & TransformControls). |
| [232](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L232) | `16` | `title="Step: 16 blocks (Chunk)"` | `() => setStep(16)` | None | **Duplicate** | Sets nudge step to 16 blocks. (Duplicate of Inspector line 323 & TransformControls). |
| [250](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L250) | `-{axis}` | `title="Nudge -{step} on {axis}"` | `() => handleNudge(axis, -1)` | `placement.locked` | **Duplicate** | Quick nudge -X, -Y, or -Z. (Duplicate of Inspector & TransformControls). |
| [264](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L264) | `+{axis}` | `title="Nudge +{step} on {axis}"` | `() => handleNudge(axis, 1)` | `placement.locked` | **Duplicate** | Quick nudge +X, +Y, or +Z. (Duplicate of Inspector & TransformControls). |
| [286](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L286) | `⎘ Duplicate Side-by-Side (Ctrl+D)` | `title="Duplicate Side-by-Side (Ctrl+D)"` | `handleDuplicate` | `placement.locked` | **Duplicate** | Duplicates placement side-by-side. (Duplicate of Outliner line 326, Inspector line 507, TransformControls line 876). |
| [302](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L302) | `✕ Delete` | `title="Delete Placement (Del)"` | `handleDelete` | `placement.locked` | **Duplicate** | Deletes selected placement. (Duplicate of Outliner line 340, Inspector line 543, TransformControls line 888). |

---

### 2.16 [ViewportCanvas.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx) (7 buttons)
Floating HUD on top-right of the Three.js viewport canvas.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [1677](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1677) | `Orbit Mode` / `Fly Mode (WASD)` | None | `handleToggleMode` | None | **Active / Wired** | Toggles camera controller between OrbitControls and FPS Minecraft-style WASD fly camera. |
| [1691](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1691) | `Iso` | `title="Isometric View"` | `() => handleApplyPreset('isometric')` | None | **Active / Wired** | Snaps camera to isometric projection angle (azimuth 45°, elevation 35.264°). |
| [1699](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1699) | `Top` | `title="Top View"` | `() => handleApplyPreset('top')` | None | **Active / Wired** | Snaps camera directly above looking down (+Y). |
| [1706](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1706) | `Front` | `title="Front View"` | `() => handleApplyPreset('front')` | None | **Active / Wired** | Snaps camera facing South/North (+Z). |
| [1713](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1713) | `Right` | `title="Right View"` | `() => handleApplyPreset('right')` | None | **Active / Wired** | Snaps camera facing East (+X). |
| [1720](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1720) | `Frame` | `title="Frame Entire Schematic"` | `handleFrameAll` | None | **Active / Wired** | Computes bounding sphere of all placements and animates camera to fit scene. |
| [1727](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/ViewportCanvas.tsx#L1727) | `▸` / `▾` | `title="Expand/Collapse HUD"` | `() => setHudCollapsed((c) => !c)` | None | **Active / Wired** | Collapses/expands the floating viewport options HUD box. |

---

### 2.17 [ImportDialog.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx) (11 buttons)
Interactive import wizard dialog and the floating ghost-preview viewport bar.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [89](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L89) | `R: Rotate ({deg}°)` | `title="Rotate 90° Clockwise (R)"` | `controller.rotateGhostClockwise()` | None | **Duplicate** | Ghost HUD: rotates ghost preview 90° CW before placement. (Duplicate of rotate actions). |
| [107](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L107) | `M: Mirror ({axis})` | `title="Cycle Mirror Axis (M)"` | `controller.mirrorGhost()` | None | **Duplicate** | Ghost HUD: cycles mirror reflection axis (None → X → Z). (Duplicate of mirror actions). |
| [125](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L125) | `Ground Snap` | `title="Snap Ghost to Ground Plane Y=0"` | `controller.snapGhostToGround(null, 0)` | None | **Active / Wired** | Ghost HUD: snaps bottom face of ghost bounding box to Y=0 ground grid. |
| [146](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L146) | `Confirm Place` | None | `() => void controller.confirmPlace()` | None | **Active / Wired** | Ghost HUD: commits ghost placement into active project session. |
| [163](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L163) | `Cancel (Esc)` | `title="Cancel Ghost Preview (Esc)"` | `controller.cancelGhostPreview()` | None | **Active / Wired** | Ghost HUD: cancels ghost preview and reverts import workflow. |
| [305](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L305) | `Cancel` | None | `onClose` | None | **Active / Wired** | Dialog file-picker stage: dismisses import modal. |
| [602](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L602) | `Cancel` | None | `handleCancel` | None | **Active / Wired** | Dialog preview stage: cancels parsed schematic. |
| [618](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L618) | `Place at Origin (0,0,0)` | None | `handlePlaceAtOrigin` | `placing` | **Active / Wired** | Instantly commits schematic at [0, 0, 0] without interactive ghost. |
| [636](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L636) | `Place at Cursor (Ghost Preview)` | None | `handleStartGhost` | `placing` | **Active / Wired** | Enters interactive ghost mode in viewport for user to place schematic with mouse. |
| [796](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L796) | `Close` | None | `() => { controller.reset(); onClose?.(); }` | None | **Active / Wired** | Dialog error stage: dismisses import modal. |
| [815](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/ImportDialog.tsx#L815) | `Try Another File` | None | `() => controller.reset()` | None | **Active / Wired** | Dialog error stage: resets file reader to upload another file. |

---

### 2.18 [TransformControls.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx) (34 buttons)
Dedicated transform inspector in Right Dock `Transform` tab supporting single and multi-selection transforms.

| Line | Label / Visual | Tooltip (`title`) / Aria | Handler (`onClick`) | Disabled State | Classification | Purpose & Behavior |
|:---:|---|---|---|---|:---:|---|
| [346](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L346) | `✕` | None | `onClose` | None | **Active / Wired** | Closes transform controls floating panel if displayed as overlay. |
| [391](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L391) | `1 Block` | None | `() => setNudgeStep(1)` | None | **Duplicate** | Group mode: sets nudge step to 1. (Duplicate of Inspector & SelectedPlacementBar). |
| [406](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L406) | `16 (Chunk)` | None | `() => setNudgeStep(16)` | None | **Duplicate** | Group mode: sets nudge step to 16. (Duplicate of Inspector & SelectedPlacementBar). |
| [425](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L425) | `-{nudgeStep}X` | None | `handleGroupNudge([-nudgeStep, 0, 0])` | `anyLockedInGroup` | **Duplicate** | Group mode: nudges all selected placements -X. |
| [433](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L433) | `-{nudgeStep}Y` | None | `handleGroupNudge([0, -nudgeStep, 0])` | `anyLockedInGroup` | **Duplicate** | Group mode: nudges all selected placements -Y. |
| [441](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L441) | `-{nudgeStep}Z` | None | `handleGroupNudge([0, 0, -nudgeStep])` | `anyLockedInGroup` | **Duplicate** | Group mode: nudges all selected placements -Z. |
| [449](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L449) | `+{nudgeStep}X` | None | `handleGroupNudge([nudgeStep, 0, 0])` | `anyLockedInGroup` | **Duplicate** | Group mode: nudges all selected placements +X. |
| [457](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L457) | `+{nudgeStep}Y` | None | `handleGroupNudge([0, nudgeStep, 0])` | `anyLockedInGroup` | **Duplicate** | Group mode: nudges all selected placements +Y. |
| [465](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L465) | `+{nudgeStep}Z` | None | `handleGroupNudge([0, 0, nudgeStep])` | `anyLockedInGroup` | **Duplicate** | Group mode: nudges all selected placements +Z. |
| [479](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L479) | `90° CW` | None | `handleGroupRotate(90)` | `anyLockedInGroup` | **Duplicate** | Group mode: rotates entire group +90° around collective centroid. |
| [487](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L487) | `90° CCW` | None | `handleGroupRotate(270)` | `anyLockedInGroup` | **Duplicate** | Group mode: rotates entire group -90° around collective centroid. |
| [495](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L495) | `180°` | None | `handleGroupRotate(180)` | `anyLockedInGroup` | **Duplicate** | Group mode: rotates entire group 180° around collective centroid. |
| [505](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L505) | `Mirror X` | None | `handleGroupMirror('x')` | `anyLockedInGroup` | **Duplicate** | Group mode: reflects all placements across group X axis. |
| [513](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L513) | `Mirror Z` | None | `handleGroupMirror('z')` | `anyLockedInGroup` | **Duplicate** | Group mode: reflects all placements across group Z axis. |
| [546](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L546) | `1 Block` | None | `() => setNudgeStep(1)` | None | **Duplicate** | Single mode: sets nudge step to 1. |
| [561](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L561) | `16 (Chunk)` | None | `() => setNudgeStep(16)` | None | **Duplicate** | Single mode: sets nudge step to 16. |
| [580](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L580) | `-{nudgeStep}X` | None | `handleNudge([-nudgeStep, 0, 0])` | `isLocked` | **Duplicate** | Single mode: nudges placement -X. |
| [589](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L589) | `-{nudgeStep}Y` | None | `handleNudge([0, -nudgeStep, 0])` | `isLocked` | **Duplicate** | Single mode: nudges placement -Y. |
| [598](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L598) | `-{nudgeStep}Z` | None | `handleNudge([0, 0, -nudgeStep])` | `isLocked` | **Duplicate** | Single mode: nudges placement -Z. |
| [607](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L607) | `+{nudgeStep}X` | None | `handleNudge([nudgeStep, 0, 0])` | `isLocked` | **Duplicate** | Single mode: nudges placement +X. |
| [616](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L616) | `+{nudgeStep}Y` | None | `handleNudge([0, nudgeStep, 0])` | `isLocked` | **Duplicate** | Single mode: nudges placement +Y. |
| [625](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L625) | `+{nudgeStep}Z` | None | `handleNudge([0, 0, nudgeStep])` | `isLocked` | **Duplicate** | Single mode: nudges placement +Z. |
| [643](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L643) | `90° CW` | None | `handleRotateStep('cw')` | `isLocked` | **Duplicate** | Single mode: rotates placement +90° around origin pivot. |
| [652](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L652) | `90° CCW` | None | `handleRotateStep('ccw')` | `isLocked` | **Duplicate** | Single mode: rotates placement -90° around origin pivot. |
| [661](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L661) | `180°` | None | `handleRotate180` | `isLocked` | **Duplicate** | Single mode: rotates placement 180° around origin pivot. |
| [679](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L679) | `None` | None | `() => handleMirror('none')` | `isLocked` | **Duplicate** | Single mode: clears mirror reflection. |
| [693](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L693) | `Mirror X` | None | `() => handleMirror('x')` | `isLocked` | **Duplicate** | Single mode: reflects placement across X axis. |
| [707](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L707) | `Mirror Z` | None | `() => handleMirror('z')` | `isLocked` | **Duplicate** | Single mode: reflects placement across Z axis. |
| [736](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L736) | `Center Origin` | None | `handleCenterOrigin` | `isLocked` | **Active / Wired** | Calculates bounding box geometric center and sets as origin pivot. |
| [793](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L793) | `Apply` | None | `handleApplyOrigin` | `isLocked` | **Active / Wired** | Commits manual numerical origin pivot changes to placement. |
| [853](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L853) | `Unlock` / `Lock` | None | `controller.setPlacementLocked(...)` | None | **Duplicate** | Toggles lock status. (Duplicate of Outliner & Inspector). |
| [865](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L865) | `Hide` / `Show` | None | `controller.setPlacementHidden(...)` | None | **Duplicate** | Toggles visibility. (Duplicate of Outliner line 272). |
| [876](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L876) | `Duplicate` | None | `controller.duplicatePlacement(...)` | `isLocked` | **Duplicate** | Duplicates placement displaced width+1 along X. (Duplicate of Inspector, Outliner, SelectedPlacementBar). |
| [888](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L888) | `Delete` | None | `controller.deletePlacement(...)` | `isLocked` | **Duplicate** | Deletes placement from project. (Duplicate of Inspector, Outliner, SelectedPlacementBar). |

---

## 3. Duplicate Buttons Analysis

59 buttons in the frontend represent duplicate triggers for 14 core operations. Below is the detailed classification comparing their locations, intent, and redundancy.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DUPLICATION CLUSTERS SUMMARY                          │
├────────────────────────────┬─────────┬──────────────────────────────────────┤
│ Cluster                    │ Copies  │ Surfaces                             │
├────────────────────────────┼─────────┼──────────────────────────────────────┤
│ 1. Undo                    │ 3       │ Toolbar, BottomDock, BlockPicker     │
│ 2. Redo                    │ 3       │ Toolbar, BottomDock, BlockPicker     │
│ 3. Duplicate Placement     │ 4       │ Inspector, Outliner, Bar, Transform  │
│ 4. Delete Placement        │ 4       │ Inspector, Outliner, Bar, Transform  │
│ 5. Lock / Unlock           │ 3       │ Inspector, Outliner, Transform       │
│ 6. Visibility (Show/Hide)  │ 2       │ Outliner, Transform                  │
│ 7. Nudge Step (1 vs 16)    │ 4       │ Inspector, Bar, Transform x2         │
│ 8. Nudge Axis (-X..+Z)     │ 4 sets  │ Inspector, Bar, Transform x2         │
│ 9. Rotation Y              │ 6       │ Toolbar, Bar, Inspector, Transform x2, Import │
│ 10. Mirror                 │ 4       │ Inspector, Transform x2, Import      │
│ 11. Bake                   │ 3       │ Toolbar, ConflictsPanel, BakeDialog  │
│ 12. Save                   │ 3       │ Toolbar, ProjectDialog, LibraryPanel │
│ 13. Paste                  │ 2       │ Toolbar, BlockPickerPanel            │
│ 14. Panel Collapse/Expand  │ 4 sets  │ Outliner, Inspector, Dock, Viewport  │
└────────────────────────────┴─────────┴──────────────────────────────────────┘
```

### Detailed Breakdown of Clusters:

#### Cluster 1 & 2: Undo (`↺`) & Redo (`↻`)
- **Instances:**
  - [Toolbar.tsx:129, 150](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L129): Primary global toolbar buttons with shortcut hints `Ctrl+Z` / `Ctrl+Y`.
  - [BottomDock.tsx:198, 209](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/BottomDock.tsx#L198): History fallback tab header buttons.
  - [BlockPickerPanel.tsx:233, 249](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L233): Region tool header buttons.
- **Verdict:** **Partially Redundant.** The `Toolbar` buttons and global shortcut listeners are the primary mechanism. Having Undo/Redo inside `BlockPickerPanel` clutters the region operations panel. The History tab buttons are reasonable contextual quick-actions when viewing past revisions.

#### Cluster 3: Duplicate Placement Side-by-Side (`⎘`)
- **Instances:**
  - [InspectorPanel.tsx:507](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L507): Full-width action button.
  - [OutlinerPanel.tsx:326](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L326): Per-item row hover button.
  - [SelectedPlacementBar.tsx:286](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L286): Viewport floating HUD button.
  - [TransformControls.tsx:876](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L876): Bottom action grid button.
- **Verdict:** **Intentional Quick-Access with Redundancy.** Exposing duplicate in `Outliner` (row icon) and `SelectedPlacementBar` (viewport HUD) is highly convenient for workflow. However, having duplicate buttons in BOTH `InspectorPanel` and `TransformControls` in the same right dock is redundant because both tabs serve placement inspection.

#### Cluster 4: Delete Placement (`✕`)
- **Instances:**
  - [InspectorPanel.tsx:543](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L543)
  - [OutlinerPanel.tsx:340](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L340)
  - [SelectedPlacementBar.tsx:302](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L302)
  - [TransformControls.tsx:888](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L888)
- **Verdict:** **Intentional Quick-Access.** Similar to duplicate placement: outliner row and viewport HUD provide immediate access without opening docks.

#### Cluster 5 & 6: Lock (`🔒`/`🔓`) & Visibility (`👁`/`—`)
- **Lock:** [InspectorPanel.tsx:527](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L527), [OutlinerPanel.tsx:286](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L286), [TransformControls.tsx:853](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L853).
- **Visibility:** [OutlinerPanel.tsx:272](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/OutlinerPanel.tsx#L272), [TransformControls.tsx:865](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L865).
- **Verdict:** Outliner is the natural home for visibility & lock toggles (standard CAD/DCC hierarchy pattern). The duplicate toggles in `TransformControls` and `InspectorPanel` are secondary.

#### Cluster 7 & 8: Nudge Controls (Step 1 vs 16, Axes -X..+Z)
- **Instances:**
  - [InspectorPanel.tsx:310, 323, 341, 355](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/InspectorPanel.tsx#L310)
  - [SelectedPlacementBar.tsx:220, 232, 250, 264](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/viewport/SelectedPlacementBar.tsx#L220)
  - [TransformControls.tsx:391, 406, 425-465](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L391) (Group mode)
  - [TransformControls.tsx:546, 561, 580-625](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/workflows/TransformControls.tsx#L546) (Single mode)
- **Verdict:** **Intentional Viewport HUD vs Dock Duplicate.** Having nudge buttons directly on `SelectedPlacementBar` in the viewport lets users nudge while looking at 3D geometry without taking their eyes off the canvas. However, having identical nudge clusters in BOTH `InspectorPanel` and `TransformControls` creates complete redundancy in the Right Dock.

#### Cluster 9 & 10: Rotation & Mirror
- **Rotation:**
  - `Toolbar.tsx:232`: Activates interactive rotation pointer mode.
  - `SelectedPlacementBar.tsx:200`: Quick rotate +90°.
  - `InspectorPanel.tsx:432`: 4 absolute radio-style buttons (`0°`, `90°`, `180°`, `270°`).
  - `TransformControls.tsx:479-495` & `643-661`: Step-based delta buttons (`90° CW`, `90° CCW`, `180°`).
  - `ImportDialog.tsx:89`: Pre-placement ghost rotation.
- **Mirror:**
  - `InspectorPanel.tsx:464`: Mirror axes (`None`, `X`, `Z`).
  - `TransformControls.tsx:505, 513` & `679-707`: Mirror axes.
  - `ImportDialog.tsx:107`: Pre-placement ghost mirror cycle.
- **Verdict:** `SelectedPlacementBar`'s `Rotate 90°` is an intentional high-speed shortcut. `InspectorPanel` provides absolute orientation while `TransformControls` provides relative stepping.

#### Cluster 11: Bake Operations
- **Instances:**
  - [Toolbar.tsx:197](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L197): Opens `BakeDialog` modal.
  - [ConflictsPanel.tsx:148](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/ConflictsPanel.tsx#L148): `Bake All Overlaps` button.
  - [BakeDialog.tsx:415](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/panels/BakeDialog.tsx#L415): Commits bake execution.
- **Verdict:** **Intentional Workflow Shortcut.** `ConflictsPanel` exposes a fast path to bake when collisions are flagged.

#### Cluster 12: Save Operations
- **Instances:**
  - [Toolbar.tsx:207](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L207): Saves current project into IndexedDB directly.
  - [ProjectDialog.tsx:388](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/ProjectDialog.tsx#L388): `💾 Save to IDB` button.
  - [LibraryPanel.tsx:353](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L353): Saves single active placement as a reusable preset.
- **Verdict:** Distinct functions despite "Save" labeling: Toolbar saves the whole project file; LibraryPanel saves a modular prefab.

#### Cluster 13: Paste Operations
- **Instances:**
  - [Toolbar.tsx:232](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L232): `Paste Clipboard` tool selector.
  - [BlockPickerPanel.tsx:718](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/tools/BlockPickerPanel.tsx#L718): `📥 Paste` execution button.
- **Verdict:** `Toolbar` selects the pointer tool mode; `BlockPickerPanel` executes the paste operation.

---

## 4. Dead, Broken, Stub & Unreachable Controls Analysis

### 4.1 High Priority Finding: Unreachable `ProjectDialog.tsx` (11 Buttons)
In [EditorIsland.tsx:46](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/islands/EditorIsland.tsx#L46):
```tsx
const [isProjectOpen, setIsProjectOpen] = useState(false);
...
{isProjectOpen && (
  <ProjectDialog
    controller={runtime.persistence}
    isOpen={isProjectOpen}
    onClose={() => setIsProjectOpen(false)}
  />
)}
```
**Problem:** `setIsProjectOpen(true)` is **never called anywhere in the entire codebase**.
- In [Toolbar.tsx:207](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L207), the `Save` button is wired to `onSave={() => runtime.persistence.saveCurrentProject()}` which performs an immediate IndexedDB write rather than opening the ProjectDialog.
- There is no "Open Project", "Project Manager", or "Manage Projects" button on the Toolbar, status bar, or workspace dock.
- **Impact:** All **11 buttons** in `ProjectDialog.tsx` (Crash recovery restore/discard, `.vxproj` export/import archive buttons, saved project listing open/delete buttons) are **dead code from the user's perspective** because the modal is physically inaccessible in the UI.

### 4.2 Architecture Gap: Toolbar Region Tool Selection vs Execution
In [Toolbar.tsx:34-45](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L34-L45), the tool definition list includes:
- `fill`: Fill Region
- `replace`: Replace Blocks
- `walls`: Walls
- `hollow`: Hollow
- `delete`: Delete Region
- `paste`: Paste Clipboard

When a user clicks one of these buttons on the top toolbar:
1. `handleSelectTool(tool.id)` is called, updating `store.selectedTool`.
2. The 3D viewport enters cuboid selection mode.
3. **However**, clicking the button does NOT execute the action, nor does it automatically switch the Right Dock tab to `tools` (`BlockPickerPanel.tsx`) where the actual execution buttons (`Fill Region`, `Walls`, `Hollow`, `Replace`, `Delete`) and parameters (such as block picker, shell thickness, and matchers) reside.
4. If the user does not manually click the `TOOLS` tab in the Right Dock, the Toolbar buttons appear to "do nothing" other than change the pointer tool.

### 4.3 Form Submit Handling in `LibraryPanel.tsx:353`
- The `Save to Library` button in [LibraryPanel.tsx:353](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/persistence/LibraryPanel.tsx#L353) lacks an explicit `onClick` prop because it is configured as `type="submit"` inside `<form onSubmit={handleSaveToLibrary}>`.
- The handler is fully wired and functional through the standard HTML DOM form submit event.

---

## 5. Recommendations for Consolidation

1. **Wire `ProjectDialog` into the UI:**
   - Add a "Projects" or "Open/Save..." button in [Toolbar.tsx](file:///C:/Anubhav/Web%20Dev%20Projects/EasySchemEdit/apps/web/src/editor/layout/Toolbar.tsx#L125) (e.g. next to the Project Name or in place of the raw direct save) that triggers `setIsProjectOpen(true)`. This immediately lights up all 11 project management & crash recovery buttons.

2. **Auto-Switch Right Dock Tab on Tool Selection:**
   - When the user selects a region tool (`fill`, `replace`, `walls`, `hollow`, `delete`) in `Toolbar.tsx`, automatically switch `WorkspaceShell`'s `rightDockTab` to `'tools'` so the user immediately sees the parameter controls and execution buttons.

3. **Consolidate Right Dock `Inspector` and `Transform` Tabs:**
   - Both `InspectorPanel` and `TransformControls` live in the Right Dock and have nearly 100% duplicate functionality for Nudge (Step 1/16, -X..+Z), Rotation (CW/CCW/180), Mirror, Duplicate, Lock, and Delete.
   - Merging them into a single unified `Inspector` tab will eliminate 20+ redundant buttons from the DOM and streamline the user interface.

4. **Retain `SelectedPlacementBar` as Intentional Quick HUD:**
   - Keep the floating viewport HUD on `SelectedPlacementBar` because in-viewport manipulation without opening side docks is an ergonomic advantage for 3D schematic composition.

---
*Audit completed with zero external code modifications.*
