// apps/web/src/editor/assets/AssetLoadPanel.tsx
// Asset Load Panel React component (Slice E3.3, SUBSPEC-G §6.4).
// Subscribes to BrowserAssetManager: auto-download, manual JAR drop zone,
// and resource-pack layer management.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  BrowserAssetManager,
  BrowserAssetManagerState,
  ResourcePackEntry,
} from './asset-manager.ts';

const h = React.createElement;

export interface AssetLoadPanelProps {
  manager: BrowserAssetManager;
  onClose?: () => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getBadgeStyle(state: BrowserAssetManagerState, fromCache: boolean): {
  text: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
} {
  switch (state) {
    case 'ready':
      return {
        text: fromCache ? 'Ready (Cached)' : 'Ready (Downloaded)',
        bgColor: 'color-mix(in srgb, var(--ok) 15%, transparent)',
        textColor: 'var(--ok)',
        borderColor: 'var(--ok)',
      };
    case 'downloading':
      return {
        text: 'Downloading…',
        bgColor: 'color-mix(in srgb, var(--signal) 15%, transparent)',
        textColor: 'var(--signal)',
        borderColor: 'var(--signal)',
      };
    case 'verifying':
      return {
        text: 'Verifying…',
        bgColor: 'color-mix(in srgb, var(--signal) 15%, transparent)',
        textColor: 'var(--signal)',
        borderColor: 'var(--signal)',
      };
    case 'extracting':
      return {
        text: 'Extracting…',
        bgColor: 'color-mix(in srgb, var(--signal) 15%, transparent)',
        textColor: 'var(--signal)',
        borderColor: 'var(--signal)',
      };
    case 'error':
      return {
        text: 'Fallback Mode — Manual JAR Needed',
        bgColor: 'color-mix(in srgb, var(--danger) 15%, transparent)',
        textColor: 'var(--danger)',
        borderColor: 'var(--danger)',
      };
    case 'idle':
    default:
      return {
        text: 'Idle (Not Loaded)',
        bgColor: 'color-mix(in srgb, var(--text-faint) 15%, transparent)',
        textColor: 'var(--text-dim)',
        borderColor: 'var(--text-faint)',
      };
  }
}

export function AssetLoadPanel(props: AssetLoadPanelProps): React.ReactElement {
  const { manager, onClose, className } = props;

  // Track updates from BrowserAssetManager
  const [, setTick] = useState(0);
  useEffect(() => {
    return manager.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, [manager]);

  const [showManualImport, setShowManualImport] = useState(false);
  const [isDraggingJar, setIsDraggingJar] = useState(false);
  const [isDraggingPack, setIsDraggingPack] = useState(false);

  const jarInputRef = useRef<HTMLInputElement | null>(null);
  const packInputRef = useRef<HTMLInputElement | null>(null);

  const state = manager.state;
  const progress = manager.progress;
  const statusText = manager.statusText;
  const errorCode = manager.errorCode;
  const errorMessage = manager.errorMessage;
  const fromCache = manager.fromCache;
  const resourcePacks = manager.resourcePacks;
  const textureCount = manager.getTextureCount();
  const atlasDimensions = manager.getAtlasDimensions();

  const isBusy = state === 'downloading' || state === 'verifying' || state === 'extracting';
  const badge = getBadgeStyle(state, fromCache);

  // Auto-reveal manual JAR drop zone when error occurs
  const shouldShowDropZone = showManualImport || state === 'error' || errorCode === 'ASSET_DOWNLOAD_FAILED';

  const handleJarFileSelected = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        await manager.loadManualJar(new Uint8Array(buffer), file.name);
      } catch (err) {
        console.error('Failed to load manual JAR:', err);
      }
    },
    [manager],
  );

  const handlePackFileSelected = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        manager.addResourcePack(new Uint8Array(buffer), file.name);
      } catch (err) {
        console.error('Failed to add resource pack:', err);
      }
    },
    [manager],
  );

  // JAR Drag & Drop handlers
  const handleJarDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingJar(true);
  }, []);

  const handleJarDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingJar(false);
  }, []);

  const handleJarDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingJar(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.jar') || file.type.includes('java-archive') || file.type.includes('zip'))) {
        await handleJarFileSelected(file);
      }
    },
    [handleJarFileSelected],
  );

  // Pack Drag & Drop handlers
  const handlePackDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPack(true);
  }, []);

  const handlePackDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPack(false);
  }, []);

  const handlePackDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingPack(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.zip') || file.type.includes('zip'))) {
        await handlePackFileSelected(file);
      }
    },
    [handlePackFileSelected],
  );

  return h(
    'div',
    {
      role: 'region',
      'aria-label': 'Asset Management Panel',
      className,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'var(--ink-850)',
        color: 'var(--text)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        padding: '18px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        lineHeight: 1.5,
        maxWidth: '720px',
      },
    },
    // Top Bar / Header
    h(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '12px',
        },
      },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        h(
          'span',
          { style: { fontWeight: 600, fontSize: '15px', color: 'var(--text)' } },
          'Minecraft 1.21.11 Assets',
        ),
        h(
          'span',
          {
            style: {
              fontSize: '11px',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '9999px',
              background: badge.bgColor,
              color: badge.textColor,
              border: `1px solid ${badge.borderColor}`,
            },
          },
          badge.text,
        ),
      ),
      onClose &&
        h(
          'button',
          {
            type: 'button',
            onClick: onClose,
            'aria-label': 'Close panel',
            style: {
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px 8px',
            },
          },
          '✕',
        ),
    ),

    // Progress Bar (when downloading, verifying, or extracting)
    isBusy &&
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: 'var(--ink-700)',
            padding: '10px 12px',
            borderRadius: '6px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } },
          h('span', { style: { color: 'var(--text)' } }, statusText),
          h('span', { style: { color: 'var(--signal)', fontWeight: 600 } }, `${progress}%`),
        ),
        h(
          'div',
          {
            role: 'progressbar',
            'aria-valuenow': progress,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            style: {
              width: '100%',
              height: '6px',
              background: 'var(--line-strong)',
              borderRadius: '3px',
              overflow: 'hidden',
            },
          },
          h('div', {
            style: {
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              background: 'var(--signal)',
              transition: 'width 0.2s ease',
            },
          }),
        ),
      ),

    // Error Alert Banner
    state === 'error' &&
      h(
        'div',
        {
          style: {
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '1px solid var(--danger)',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          },
        },
        h(
          'div',
          { style: { fontWeight: 600, color: 'var(--danger)', fontSize: '13px' } },
          errorCode ? `Download Error (${errorCode})` : 'Download Error',
        ),
        h(
          'div',
          { style: { color: 'var(--danger)', fontSize: '12px' } },
          errorMessage || 'Browser could not download assets automatically. Browser network policy or CORS might block Mojang CDN.',
        ),
        h(
          'div',
          { style: { color: 'var(--text)', fontSize: '12px', marginTop: '4px' } },
          'Use the drop zone below to load your local Minecraft 1.21.11 client.jar directly.',
        ),
      ),

    // Action Controls Row
    h(
      'div',
      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h(
        'button',
        {
          type: 'button',
          disabled: isBusy,
          onClick: () => manager.autoLoad(),
          style: {
            background: isBusy ? 'var(--line-strong)' : 'var(--signal)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '6px',
            padding: '7px 14px',
            fontWeight: 500,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            fontSize: '12px',
          },
        },
        isBusy ? 'Downloading…' : 'Auto-Download Assets (1.21.11)',
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => setShowManualImport((v) => !v),
          style: {
            background: showManualImport ? 'var(--line-strong)' : 'var(--ink-700)',
            color: 'var(--text)',
            border: '1px solid var(--line-strong)',
            borderRadius: '6px',
            padding: '7px 14px',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '12px',
          },
        },
        showManualImport ? 'Hide Manual Import' : 'Load Local .jar',
      ),
      h(
        'button',
        {
          type: 'button',
          onClick: () => manager.clearCacheAndReload(),
          style: {
            background: 'transparent',
            color: 'var(--text-dim)',
            border: '1px solid var(--line-strong)',
            borderRadius: '6px',
            padding: '7px 14px',
            fontWeight: 500,
            cursor: 'pointer',
            fontSize: '12px',
          },
        },
        'Clear Cache',
      ),
    ),

    // Manual JAR Drop Zone
    shouldShowDropZone &&
      h(
        'div',
        {
          onDragOver: handleJarDragOver,
          onDragLeave: handleJarDragLeave,
          onDrop: handleJarDrop,
          onClick: () => jarInputRef.current?.click(),
          style: {
            border: isDraggingJar ? '2px dashed var(--signal)' : '2px dashed var(--line-strong)',
            background: isDraggingJar ? 'color-mix(in srgb, var(--signal) 8%, transparent)' : 'color-mix(in srgb, var(--ink-700) 50%, transparent)',
            borderRadius: '8px',
            padding: '20px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          },
        },
        h('input', {
          ref: jarInputRef,
          type: 'file',
          accept: '.jar,application/java-archive,application/zip',
          style: { display: 'none' },
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleJarFileSelected(file);
          },
        }),
        h('div', { style: { fontSize: '24px' } }, '📦'),
        h(
          'div',
          { style: { fontWeight: 600, color: 'var(--text)', fontSize: '13px' } },
          'Drop Minecraft 1.21.11 client.jar here, or click to browse',
        ),
        h(
          'div',
          { style: { color: 'var(--text-dim)', fontSize: '11px', maxWidth: '480px' } },
          'Typically found at: %appdata%\\.minecraft\\versions\\1.21.11\\1.21.11.jar (Windows) or ~/Library/Application Support/minecraft/versions/1.21.11/1.21.11.jar (macOS)',
        ),
      ),

    // Resource Pack Layers Section
    h(
      'div',
      {
        style: {
          borderTop: '1px solid var(--line)',
          paddingTop: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        },
      },
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          },
        },
        h(
          'div',
          null,
          h('div', { style: { fontWeight: 600, color: 'var(--text)' } }, 'Resource Pack Layers'),
          h(
            'div',
            { style: { color: 'var(--text-faint)', fontSize: '11px' } },
            `Active Textures: ${textureCount} | Atlas: ${atlasDimensions.width}×${atlasDimensions.height} (${atlasDimensions.pages} page${atlasDimensions.pages === 1 ? '' : 's'})`,
          ),
        ),
        h(
          'div',
          null,
          h('input', {
            ref: packInputRef,
            type: 'file',
            accept: '.zip,application/zip',
            style: { display: 'none' },
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) handlePackFileSelected(file);
            },
          }),
          h(
            'button',
            {
              type: 'button',
              onClick: () => packInputRef.current?.click(),
              style: {
                background: 'var(--ink-700)',
                color: 'var(--text)',
                border: '1px solid var(--line-strong)',
                borderRadius: '6px',
                padding: '5px 12px',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '12px',
              },
            },
            '+ Add Pack (.zip)',
          ),
        ),
      ),

      // Resource Pack Drop Target & List
      h(
        'div',
        {
          onDragOver: handlePackDragOver,
          onDragLeave: handlePackDragLeave,
          onDrop: handlePackDrop,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            border: isDraggingPack ? '1px dashed var(--signal)' : '1px solid transparent',
            borderRadius: '6px',
            padding: isDraggingPack ? '8px' : '0',
            background: isDraggingPack ? 'color-mix(in srgb, var(--signal) 5%, transparent)' : 'transparent',
          },
        },
        resourcePacks.length === 0
          ? h(
              'div',
              {
                style: {
                  padding: '12px',
                  background: 'var(--ink-850)',
                  borderRadius: '6px',
                  color: 'var(--text-faint)',
                  textAlign: 'center',
                  fontSize: '12px',
                },
              },
              'No custom resource packs installed. Default vanilla 1.21.11 assets are used.',
            )
          : resourcePacks.map((pack: ResourcePackEntry, index: number) =>
              h(
                'div',
                {
                  key: pack.id,
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: pack.enabled ? 'var(--ink-700)' : 'var(--ink-850)',
                    border: '1px solid var(--line-strong)',
                    borderRadius: '6px',
                    opacity: pack.enabled ? 1 : 0.6,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  h(
                    'span',
                    { style: { fontSize: '11px', color: 'var(--text-faint)', width: '20px' } },
                    `#${index + 1}`,
                  ),
                  h('input', {
                    type: 'checkbox',
                    checked: pack.enabled,
                    'aria-label': `Toggle ${pack.name}`,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                      manager.toggleResourcePack(pack.id, e.target.checked),
                    style: { cursor: 'pointer' },
                  }),
                  h(
                    'div',
                    null,
                    h(
                      'div',
                      { style: { fontWeight: 500, color: 'var(--text)', fontSize: '12px' } },
                      pack.name,
                    ),
                    h(
                      'div',
                      { style: { fontSize: '11px', color: 'var(--text-dim)' } },
                      formatBytes(pack.sizeBytes),
                    ),
                  ),
                ),
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: index === 0,
                      'aria-label': `Move ${pack.name} up`,
                      onClick: () => manager.moveResourcePack(pack.id, 'up'),
                      style: {
                        background: 'var(--line-strong)',
                        color: index === 0 ? 'var(--text-faint)' : 'var(--text)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '11px',
                      },
                    },
                    '▲',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: index === resourcePacks.length - 1,
                      'aria-label': `Move ${pack.name} down`,
                      onClick: () => manager.moveResourcePack(pack.id, 'down'),
                      style: {
                        background: 'var(--line-strong)',
                        color: index === resourcePacks.length - 1 ? 'var(--text-faint)' : 'var(--text)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        cursor: index === resourcePacks.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: '11px',
                      },
                    },
                    '▼',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      'aria-label': `Remove ${pack.name}`,
                      onClick: () => manager.removeResourcePack(pack.id),
                      style: {
                        background: 'transparent',
                        color: 'var(--danger)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        marginLeft: '4px',
                      },
                    },
                    '✕',
                  ),
                ),
              ),
            ),
      ),
    ),
  );
}
