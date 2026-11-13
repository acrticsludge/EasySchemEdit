// apps/web/src/editor/persistence/LibraryPanel.tsx
// Persistent Build Library panel (Slice E3.9, SUBSPEC-C §6).
// Allows searching, tagging, inspecting build stats, saving active placements to library,
// and placing library builds into the current scene.

import React, { useState, useEffect } from 'react';
import type {
  ProjectPersistenceController,
} from './persistence-controller.ts';
import type { Placement } from '@easyschemedit/domain';
import type { LibraryEntry } from '@easyschemedit/persistence';

export interface LibraryPanelProps {
  controller: ProjectPersistenceController;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
  onPlaced?: (placements: Placement[]) => void;
}

export function LibraryPanel({
  controller,
  isOpen = true,
  onClose,
  className,
  onPlaced,
}: LibraryPanelProps): React.ReactElement | null {
  const [entries, setEntries] = useState<Omit<LibraryEntry, 'data'>[]>([]);
  const [stats, setStats] = useState<{ entryCount: number; totalBytes: number }>({
    entryCount: 0,
    totalBytes: 0,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // Save to Library form state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string>('');
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveTags, setSaveTags] = useState('');
  const [saveFormat, setSaveFormat] = useState<'schem-v3' | 'litematic'>('schem-v3');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const project = controller.getCurrentProject();
  const availablePlacements = project.placements || [];

  const refreshLibrary = async () => {
    try {
      const list = await controller.browseLibrary({
        search: searchQuery.trim() || undefined,
        tag: selectedTag || undefined,
      });
      setEntries(list);

      // Collect all tags across unfiltered library
      const allEntries = await controller.browseLibrary();
      const tagsSet = new Set<string>();
      for (const e of allEntries) {
        for (const t of e.tags || []) {
          tagsSet.add(t.toLowerCase());
        }
      }
      setAvailableTags(Array.from(tagsSet).sort());

      const st = await controller.getLibraryStats();
      setStats(st);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshLibrary();
      if (availablePlacements.length > 0 && !selectedPlacementId) {
        setSelectedPlacementId(availablePlacements[0].id);
        setSaveName(availablePlacements[0].name || '');
      }
    }
  }, [isOpen, searchQuery, selectedTag]);

  if (!isOpen) return null;

  const handleSaveToLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlacementId) {
      setErrorMessage('Please select a placement to save');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const tagsArray = saveTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const entry = await controller.savePlacementToLibrary(selectedPlacementId, {
        name: saveName.trim() || 'Untitled Build',
        description: saveDesc.trim() || undefined,
        tags: tagsArray,
        format: saveFormat,
      });

      setStatusMessage(`Saved "${entry.name}" to Build Library`);
      setShowSaveForm(false);
      setSaveName('');
      setSaveDesc('');
      setSaveTags('');
      await refreshLibrary();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save to library failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceInScene = async (entryId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const placed = await controller.placeFromLibrary(entryId);
      setStatusMessage(`Added ${placed.length} placement(s) to scene`);
      onPlaced?.(placed);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Place failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEntry = async (entryId: string, name: string) => {
    if (!window.confirm(`Delete "${name}" from Build Library?`)) {
      return;
    }

    setIsLoading(true);
    try {
      await controller.removeLibraryEntry(entryId);
      setStatusMessage(`Deleted "${name}"`);
      await refreshLibrary();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setIsLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <aside
      className={`library-panel ${className ?? ''}`}
      aria-label="Build Library Panel"
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: 0,
        color: '#f4f4f5',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#27272a',
          borderBottom: '1px solid #3f3f46',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>🏛️</span>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Build Library</h2>
          <span
            style={{
              fontSize: '11px',
              backgroundColor: '#3f3f46',
              color: '#d4d4d8',
              padding: '2px 6px',
              borderRadius: '10px',
            }}
          >
            {stats.entryCount} items • {formatBytes(stats.totalBytes)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setShowSaveForm(!showSaveForm)}
            style={{
              backgroundColor: showSaveForm ? '#3f3f46' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {showSaveForm ? 'Cancel' : '➕ Save Active'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close library panel"
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Save Placement Form */}
      {showSaveForm && (
        <form
          onSubmit={handleSaveToLibrary}
          style={{
            backgroundColor: '#27272a',
            borderBottom: '1px solid #3f3f46',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#e4e4e7' }}>
            Save Placement to Library
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={selectedPlacementId}
              onChange={(e) => {
                setSelectedPlacementId(e.target.value);
                const pl = availablePlacements.find((p) => p.id === e.target.value);
                if (pl) setSaveName(pl.name || '');
              }}
              style={{
                flex: 1,
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                color: '#f4f4f5',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              {availablePlacements.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.volume.nonAirCount} blocks)
                </option>
              ))}
            </select>

            <select
              value={saveFormat}
              onChange={(e) => setSaveFormat(e.target.value as any)}
              style={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                color: '#f4f4f5',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              <option value="schem-v3">.schem (v3)</option>
              <option value="litematic">.litematic</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Build Name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            required
            style={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '12px',
            }}
          />

          <input
            type="text"
            placeholder="Description (optional)"
            value={saveDesc}
            onChange={(e) => setSaveDesc(e.target.value)}
            style={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '12px',
            }}
          />

          <input
            type="text"
            placeholder="Tags: medieval, castle, roof (comma separated)"
            value={saveTags}
            onChange={(e) => setSaveTags(e.target.value)}
            style={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '4px',
              padding: '6px 8px',
              fontSize: '12px',
            }}
          />

          <button
            type="submit"
            disabled={isLoading || availablePlacements.length === 0}
            style={{
              backgroundColor: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              marginTop: '4px',
            }}
          >
            {isLoading ? 'Saving...' : 'Save to Library'}
          </button>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #27272a',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <div style={{ position: 'relative' }}>
          <input
            type="search"
            placeholder="Search builds by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              color: '#f4f4f5',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
            }}
          />
        </div>

        {availableTags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              style={{
                backgroundColor: selectedTag === null ? '#2563eb' : '#27272a',
                color: selectedTag === null ? '#ffffff' : '#a1a1aa',
                border: '1px solid #3f3f46',
                borderRadius: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              All
            </button>
            {availableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                style={{
                  backgroundColor: selectedTag === tag ? '#2563eb' : '#27272a',
                  color: selectedTag === tag ? '#ffffff' : '#a1a1aa',
                  border: '1px solid #3f3f46',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feedback Messages */}
      {statusMessage && (
        <div
          style={{
            margin: '6px 12px 0',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid #22c55e',
            color: '#86efac',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          ✓ {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            margin: '6px 12px 0',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '11px',
          }}
        >
          ✕ {errorMessage}
        </div>
      )}

      {/* Card List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: '#71717a',
              fontSize: '12px',
            }}
          >
            No builds found in library. Click &quot;➕ Save Active&quot; above to store reusable structures.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>
                    {entry.name}
                  </h4>
                  {entry.description && (
                    <div style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '2px' }}>
                      {entry.description}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    backgroundColor: entry.format === 'litematic' ? '#4338ca' : '#0284c7',
                    color: '#ffffff',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  {entry.format}
                </span>
              </div>

              {/* Stats & Dimensions */}
              <div
                style={{
                  fontSize: '11px',
                  color: '#71717a',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                }}
              >
                <span>
                  📐 {entry.dimensions.width}×{entry.dimensions.height}×{entry.dimensions.length}
                </span>
                <span>🧱 {entry.nonAirCount} blocks</span>
                <span>💾 {formatBytes(entry.sizeBytes)}</span>
              </div>

              {/* Tag Pills */}
              {entry.tags && entry.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {entry.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '10px',
                        backgroundColor: '#18181b',
                        color: '#38bdf8',
                        padding: '1px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={() => handlePlaceInScene(entry.id)}
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  ➕ Place in Scene
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteEntry(entry.id, entry.name)}
                  disabled={isLoading}
                  aria-label={`Delete ${entry.name}`}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#ef4444',
                    border: '1px solid #7f1d1d',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
