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
        bgColor: 'rgba(16, 185, 129, 0.15)',
        textColor: '#34d399',
        borderColor: '#059669',
      };
    case 'downloading':
      return {
        text: 'Downloading…',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        textColor: '#60a5fa',
        borderColor: '#2563eb',
      };
    case 'verifying':
      return {
        text: 'Verifying…',
        bgColor: 'rgba(168, 85, 247, 0.15)',
        textColor: '#c084fc',
        borderColor: '#7e22ce',
      };
    case 'extracting':
      return {
        text: 'Extracting…',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        textColor: '#60a5fa',
        borderColor: '#2563eb',
      };
    case 'error':
      return {
        text: 'Fallback Mode — Manual JAR Needed',
        bgColor: 'rgba(239, 68, 68, 0.15)',
        textColor: '#f87171',
        borderColor: '#dc2626',
      };
    case 'idle':
    default:
      return {
        text: 'Idle (Not Loaded)',
        bgColor: 'rgba(113, 113, 122, 0.15)',
        textColor: '#a1a1aa',
        borderColor: '#52525b',
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
        background: '#18181b',
        color: '#f4f4f5',
        border: '1px solid #27272a',
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
          borderBottom: '1px solid #27272a',
          paddingBottom: '12px',
        },
      },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        h(
          'span',
          { style: { fontWeight: 600, fontSize: '15px', color: '#fafafa' } },
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
              color: '#a1a1aa',
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
            background: '#27272a',
            padding: '10px 12px',
            borderRadius: '6px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } },
          h('span', { style: { color: '#e4e4e7' } }, statusText),
          h('span', { style: { color: '#60a5fa', fontWeight: 600 } }, `${progress}%`),
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
              background: '#3f3f46',
              borderRadius: '3px',
              overflow: 'hidden',
            },
          },
          h('div', {
            style: {
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              background: '#3b82f6',
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
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #dc2626',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          },
        },
        h(
          'div',
          { style: { fontWeight: 600, color: '#f87171', fontSize: '13px' } },
          errorCode ? `Download Error (${errorCode})` : 'Download Error',
        ),
        h(
          'div',
          { style: { color: '#fca5a5', fontSize: '12px' } },
          errorMessage || 'Browser could not download assets automatically. Browser network policy or CORS might block Mojang CDN.',
        ),
        h(
          'div',
          { style: { color: '#d4d4d8', fontSize: '12px', marginTop: '4px' } },
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
            background: isBusy ? '#3f3f46' : '#2563eb',
            color: '#ffffff',
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
            background: showManualImport ? '#3f3f46' : '#27272a',
            color: '#e4e4e7',
            border: '1px solid #3f3f46',
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
            color: '#a1a1aa',
            border: '1px solid #3f3f46',
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
            border: isDraggingJar ? '2px dashed #3b82f6' : '2px dashed #52525b',
            background: isDraggingJar ? 'rgba(59, 130, 246, 0.08)' : 'rgba(39, 39, 42, 0.5)',
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
          { style: { fontWeight: 600, color: '#fafafa', fontSize: '13px' } },
          'Drop Minecraft 1.21.11 client.jar here, or click to browse',
        ),
        h(
          'div',
          { style: { color: '#a1a1aa', fontSize: '11px', maxWidth: '480px' } },
          'Typically found at: %appdata%\\.minecraft\\versions\\1.21.11\\1.21.11.jar (Windows) or ~/Library/Application Support/minecraft/versions/1.21.11/1.21.11.jar (macOS)',
        ),
      ),

    // Resource Pack Layers Section
    h(
      'div',
      {
        style: {
          borderTop: '1px solid #27272a',
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
          h('div', { style: { fontWeight: 600, color: '#fafafa' } }, 'Resource Pack Layers'),
          h(
            'div',
            { style: { color: '#71717a', fontSize: '11px' } },
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
                background: '#27272a',
                color: '#e4e4e7',
                border: '1px solid #3f3f46',
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
            border: isDraggingPack ? '1px dashed #3b82f6' : '1px solid transparent',
            borderRadius: '6px',
            padding: isDraggingPack ? '8px' : '0',
            background: isDraggingPack ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
          },
        },
        resourcePacks.length === 0
          ? h(
              'div',
              {
                style: {
                  padding: '12px',
                  background: '#1f1f23',
                  borderRadius: '6px',
                  color: '#71717a',
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
                    background: pack.enabled ? '#27272a' : '#1f1f23',
                    border: '1px solid #3f3f46',
                    borderRadius: '6px',
                    opacity: pack.enabled ? 1 : 0.6,
                  },
                },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
                  h(
                    'span',
                    { style: { fontSize: '11px', color: '#71717a', width: '20px' } },
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
                      { style: { fontWeight: 500, color: '#f4f4f5', fontSize: '12px' } },
                      pack.name,
                    ),
                    h(
                      'div',
                      { style: { fontSize: '11px', color: '#a1a1aa' } },
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
                        background: '#3f3f46',
                        color: index === 0 ? '#71717a' : '#e4e4e7',
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
                        background: '#3f3f46',
                        color: index === resourcePacks.length - 1 ? '#71717a' : '#e4e4e7',
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
                        color: '#f87171',
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
