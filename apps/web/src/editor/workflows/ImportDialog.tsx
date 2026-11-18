// apps/web/src/editor/workflows/ImportDialog.tsx
// React Component for Drag-and-Drop / File Picker, Import Report Review,
// and Ghost Preview HUD Bar (Slice E3.5, SUBSPEC-D §4.6.4, SUBSPEC-G §6.4).

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  type ImportWorkflowController,
  useImportWorkflow,
} from './import-workflow.ts';
import type { ImportReport } from '@easyschemedit/formats';

export interface ImportDialogProps {
  controller: ImportWorkflowController;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

/**
 * Format bytes into human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * HUD bar displayed at the bottom of the viewport during ghost preview.
 */
export function GhostPreviewHud({
  controller,
}: {
  controller: ImportWorkflowController;
}): React.JSX.Element {
  const workflow = useImportWorkflow(controller);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      controller.handleKeyDown(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [controller]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: 'color-mix(in srgb, var(--ink-850) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--signal)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.6), 0 0 10px color-mix(in srgb, var(--signal) 30%, transparent)',
        padding: '10px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        color: 'var(--text)',
        fontSize: '13px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--signal)',
            boxShadow: '0 0 6px var(--signal)',
          }}
        />
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Ghost Preview:</span>
        <span>Click to place</span>
      </div>

      <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--ink-700)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={() => controller.rotateGhostClockwise()}
          title="Rotate 90° Clockwise (R)"
          style={{
            backgroundColor: 'var(--ink-800)',
            color: 'var(--text)',
            border: '1px solid var(--line-strong)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <kbd style={{ fontWeight: 600, color: 'var(--signal)' }}>R</kbd>: Rotate ({workflow.ghostRotationY}°)
        </button>

        <button
          type="button"
          onClick={() => controller.mirrorGhost()}
          title="Cycle Mirror Axis (M)"
          style={{
            backgroundColor: 'var(--ink-800)',
            color: 'var(--text)',
            border: '1px solid var(--line-strong)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <kbd style={{ fontWeight: 600, color: 'var(--signal)' }}>M</kbd>: Mirror ({workflow.ghostMirror})
        </button>

        <button
          type="button"
          onClick={() => controller.snapGhostToGround(null, 0)}
          title="Snap Ghost to Ground Plane Y=0"
          style={{
            backgroundColor: 'var(--ink-800)',
            color: 'var(--text)',
            border: '1px solid var(--line-strong)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Ground Snap
        </button>
      </div>

      <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--ink-700)' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={() => void controller.confirmPlace()}
          style={{
            backgroundColor: 'var(--signal)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Confirm Place
        </button>

        <button
          type="button"
          onClick={() => controller.cancelGhostPreview()}
          title="Cancel Ghost Preview (Esc)"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--text-faint)',
            border: '1px solid var(--line-strong)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <kbd style={{ fontWeight: 600, color: 'var(--danger)' }}>Esc</kbd>: Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Drop zone view for selecting or dragging schematic files.
 */
export function ImportDropZone({
  controller,
  onClose,
}: {
  controller: ImportWorkflowController;
  onClose?: () => void;
}): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      await controller.startFileImport(bytes, file.name);
    },
    [controller],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px',
        gap: '20px',
      }}
    >
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: '100%',
          minHeight: '200px',
          border: isDragging ? '2px dashed var(--signal)' : '2px dashed var(--line-strong)',
          borderRadius: '8px',
          backgroundColor: isDragging ? 'color-mix(in srgb, var(--signal) 8%, transparent)' : 'var(--ink-850)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isDragging ? 'var(--signal)' : 'var(--text-faint)'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>

        <div style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
          {isDragging ? 'Drop schematic file to import' : 'Drag & drop schematic file here'}
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
          or <span style={{ color: 'var(--signal)', textDecoration: 'underline' }}>browse from your computer</span>
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-faint)',
            marginTop: '4px',
          }}
        >
          Supported formats: .schem (Sponge v2/v3), .litematic, .nbt (vanilla), .schematic
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".schem,.litematic,.nbt,.schematic"
          onChange={onInputChange}
          style={{ display: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'var(--ink-800)',
              color: 'var(--text)',
              border: '1px solid var(--line-strong)',
              borderRadius: '4px',
              padding: '6px 16px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Report review view showing format, dimensions, volume, region count,
 * non-air blocks, and placement action buttons.
 */
export function ImportReportView({
  controller,
  report,
  fileName,
  onClose,
}: {
  controller: ImportWorkflowController;
  report: ImportReport;
  fileName: string | null;
  onClose?: () => void;
}): React.JSX.Element {
  const [placing, setPlacing] = useState(false);

  const handlePlaceAtOrigin = async () => {
    setPlacing(true);
    try {
      controller.setCursorPosition([0, 0, 0]);
      await controller.confirmPlace();
      onClose?.();
    } finally {
      setPlacing(false);
    }
  };

  const handleStartGhost = () => {
    controller.startGhostPreview();
    onClose?.();
  };

  const handleCancel = () => {
    controller.cancelGhostPreview();
    onClose?.();
  };

  const formatKind = report.format?.kind ?? 'unknown';
  const formatBadgeColor =
    formatKind === 'schem-v3'
      ? 'var(--ok)'
      : formatKind === 'litematic'
        ? 'var(--signal)'
        : 'var(--warn)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '24px',
      }}
    >
      {/* Header with Format Badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '14px',
        }}
      >
        <div>
          <h2
            style={{
              margin: '0 0 4px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text)',
            }}
          >
            Import Schematic
          </h2>
          <div style={{ color: 'var(--text-faint)', fontSize: '12px' }}>
            {fileName ?? 'Unknown file'}
          </div>
        </div>

        <div
          style={{
            backgroundColor: `${formatBadgeColor}22`,
            color: formatBadgeColor,
            border: `1px solid ${formatBadgeColor}`,
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {formatKind}
        </div>
      </div>

      {/* Grid of Key Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--ink-850)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginBottom: '4px' }}>
            Dimensions (W × H × L)
          </div>
          <div style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
            {report.dimensions.width} × {report.dimensions.height} × {report.dimensions.length}
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--ink-850)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginBottom: '4px' }}>
            Non-Air Blocks
          </div>
          <div style={{ color: 'var(--ok)', fontSize: '15px', fontWeight: 600 }}>
            {report.nonAirBlockCount.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--ink-850)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginBottom: '4px' }}>
            Regions
          </div>
          <div style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600 }}>
            {report.regionCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--ink-850)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginBottom: '4px' }}>
            Volume
          </div>
          <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
            {report.volume.toString()} blocks
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--ink-850)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginBottom: '4px' }}>
            Palette Size
          </div>
          <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
            {report.paletteSize} states
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'var(--ink-850)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginBottom: '4px' }}>
            File Size
          </div>
          <div style={{ color: 'var(--text)', fontSize: '13px', fontWeight: 500 }}>
            {formatBytes(report.fileSizeBytes)}
          </div>
        </div>
      </div>

      {/* Preserved Ancillary Data */}
      <div
        style={{
          backgroundColor: 'var(--ink-850)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            color: 'var(--text-faint)',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          Preserved Features:
        </div>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text)' }}>
          <div>
            Block Entities:{' '}
            <strong style={{ color: 'var(--text)' }}>{report.preserved.blockEntities}</strong>
          </div>
          <div>
            Entities:{' '}
            <strong style={{ color: 'var(--text)' }}>{report.preserved.entities}</strong>
          </div>
          <div>
            Biomes:{' '}
            <strong style={{ color: 'var(--text)' }}>
              {report.preserved.biomes ? 'Yes' : 'No'}
            </strong>
          </div>
          <div>
            Ticks:{' '}
            <strong style={{ color: 'var(--text)' }}>{report.preserved.ticks}</strong>
          </div>
        </div>
      </div>

      {/* Warnings / Unsupported (if any) */}
      {report.warnings && report.warnings.length > 0 && (
        <div
          style={{
            backgroundColor: 'color-mix(in srgb, var(--warn) 10%, transparent)',
            border: '1px solid var(--warn)',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '12px',
            color: 'var(--warn)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            Warnings ({report.warnings.length}):
          </div>
          <ul style={{ margin: '0', paddingLeft: '16px' }}>
            {report.warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          borderTop: '1px solid var(--line)',
          paddingTop: '16px',
        }}
      >
        <button
          type="button"
          onClick={handleCancel}
          style={{
            backgroundColor: 'var(--ink-800)',
            color: 'var(--text)',
            border: '1px solid var(--line-strong)',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          disabled={placing}
          onClick={handlePlaceAtOrigin}
          style={{
            backgroundColor: 'var(--ink-800)',
            color: 'var(--text)',
            border: '1px solid var(--signal)',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '13px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          Place at Origin (0,0,0)
        </button>

        <button
          type="button"
          disabled={placing}
          onClick={handleStartGhost}
          style={{
            backgroundColor: 'var(--signal)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 8px color-mix(in srgb, var(--signal) 40%, transparent)',
          }}
        >
          Place at Cursor (Ghost Preview)
        </button>
      </div>
    </div>
  );
}

/**
 * Main ImportDialog component.
 * Manages modal visibility, dropzone, report view, error state, and ghost preview HUD.
 */
export function ImportDialog({
  controller,
  isOpen = true,
  onClose,
  className,
}: ImportDialogProps): React.JSX.Element | null {
  const workflow = useImportWorkflow(controller);

  // When in ghost preview mode, render the floating HUD overlay
  if (workflow.state === 'ghost-preview') {
    return <GhostPreviewHud controller={controller} />;
  }

  // If closed and not reviewing a report or viewing an error, do not render modal
  if (!isOpen && workflow.state === 'idle') {
    return null;
  }

  const report = workflow.pendingImport?.report ?? null;

  return (
    <div
      className={className}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '680px',
          backgroundColor: 'var(--ink-900)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
        }}
      >
        {workflow.state === 'loading' && (
          <div
            style={{
              padding: '48px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              color: 'var(--text)',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid var(--line)',
                borderTopColor: 'var(--signal)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div style={{ fontSize: '15px', fontWeight: 500 }}>
              Parsing schematic...
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
              Validating format, structures, and block palette
            </div>
          </div>
        )}

        {workflow.state === 'failed' && (
          <div
            style={{
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--danger)',
                fontSize: '18px',
                fontWeight: 600,
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Import Failed
            </div>

            <div
              style={{
                backgroundColor: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                border: '1px solid var(--danger)',
                borderRadius: '6px',
                padding: '12px 16px',
                color: 'var(--text)',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              {workflow.errorMessage ?? 'An unknown error occurred while importing the schematic.'}
            </div>

            {report?.errors && report.errors.length > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-faint)', marginBottom: '4px' }}>
                  Diagnostics:
                </div>
                <ul style={{ margin: 0, paddingLeft: '16px' }}>
                  {report.errors.map((e, idx) => (
                    <li key={idx}>
                      <code>{e.code}</code>: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  controller.reset();
                  onClose?.();
                }}
                style={{
                  backgroundColor: 'var(--ink-800)',
                  color: 'var(--text)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => controller.reset()}
                style={{
                  backgroundColor: 'var(--signal)',
                  color: 'var(--text)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try Another File
              </button>
            </div>
          </div>
        )}

        {workflow.state === 'review-report' && report && (
          <ImportReportView
            controller={controller}
            report={report}
            fileName={workflow.fileName}
            onClose={onClose}
          />
        )}

        {workflow.state === 'idle' && (
          <ImportDropZone controller={controller} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
