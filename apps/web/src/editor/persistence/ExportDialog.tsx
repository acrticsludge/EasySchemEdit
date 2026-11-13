// apps/web/src/editor/persistence/ExportDialog.tsx
// Modal dialog for Schematic Export (Slice E3.9, SUBSPEC-B §3, §4).
// Supports Sponge v3 (.schem) and Litematica (.litematic), scope selection
// (Composite, Active Placement, Selection), strict vs lossy validation,
// and export report display with immediate file download.

import React, { useState, useEffect } from 'react';
import type {
  ProjectPersistenceController,
} from './persistence-controller.ts';
import { triggerFileDownload } from './persistence-controller.ts';
import type { ExportReport } from '@easyschemedit/formats';

export interface ExportDialogProps {
  controller: ProjectPersistenceController;
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function ExportDialog({
  controller,
  isOpen,
  onClose,
  className,
}: ExportDialogProps): React.ReactElement | null {
  const [targetFormat, setTargetFormat] = useState<'schem-v3' | 'litematic'>('schem-v3');
  const [scope, setScope] = useState<'composite' | 'placement' | 'selection'>('composite');
  const [placementId, setPlacementId] = useState<string>('');
  const [strict, setStrict] = useState<boolean>(false);
  const [allowLossy, setAllowLossy] = useState<boolean>(true);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [report, setReport] = useState<ExportReport | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const project = controller.getCurrentProject();
  const availablePlacements = project.placements || [];

  // Reset and sync state when opening
  useEffect(() => {
    if (isOpen) {
      setReport(null);
      setDownloadFilename(null);
      setErrorMessage(null);
      if (availablePlacements.length > 0 && !placementId) {
        setPlacementId(availablePlacements[0].id);
      }
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  if (!isOpen) return null;

  const handleExecuteExport = async () => {
    setIsExporting(true);
    setErrorMessage(null);
    setReport(null);
    setDownloadFilename(null);

    try {
      const result = await controller.exportProjectSchematic(targetFormat, {
        scope,
        placementId: scope === 'placement' ? placementId : undefined,
        strict,
        allowLossy,
      });

      setReport(result.report);
      setDownloadFilename(result.filename);
      triggerFileDownload(result.filename, result.bytes);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div
      role="dialog"
      aria-labelledby="export-dialog-title"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) {
          onClose();
        }
      }}
    >
      <div
        className={`export-dialog ${className ?? ''}`}
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: '#18181b',
          border: '1px solid #3f3f46',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          color: '#f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            borderBottom: '1px solid #3f3f46',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>📦</span>
            <h2 id="export-dialog-title" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
              Export Schematic
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Close export dialog"
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '18px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Format Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#d4d4d8' }}>
              Target Format
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setTargetFormat('schem-v3')}
                style={{
                  backgroundColor: targetFormat === 'schem-v3' ? '#2563eb' : '#27272a',
                  border: `1px solid ${targetFormat === 'schem-v3' ? '#3b82f6' : '#3f3f46'}`,
                  borderRadius: '6px',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#ffffff',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Sponge v3 (.schem)</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                  WorldEdit, FastAsyncWorldEdit, Axolotl
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTargetFormat('litematic')}
                style={{
                  backgroundColor: targetFormat === 'litematic' ? '#4f46e5' : '#27272a',
                  border: `1px solid ${targetFormat === 'litematic' ? '#6366f1' : '#3f3f46'}`,
                  borderRadius: '6px',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#ffffff',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px' }}>Litematica (.litematic)</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                  Client mod format with multi-region support
                </div>
              </button>
            </div>
          </div>

          {/* Scope Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#d4d4d8' }}>
              Export Scope
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: '#27272a',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid #3f3f46',
                }}
              >
                <input
                  type="radio"
                  name="scope"
                  value="composite"
                  checked={scope === 'composite'}
                  onChange={() => setScope('composite')}
                />
                Effective Composite
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  backgroundColor: '#27272a',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid #3f3f46',
                }}
              >
                <input
                  type="radio"
                  name="scope"
                  value="placement"
                  checked={scope === 'placement'}
                  onChange={() => setScope('placement')}
                />
                Active Placement
              </label>
            </div>

            {scope === 'placement' && (
              <div style={{ marginTop: '6px' }}>
                <select
                  value={placementId}
                  onChange={(e) => setPlacementId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#27272a',
                    border: '1px solid #3f3f46',
                    color: '#f4f4f5',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    fontSize: '12px',
                  }}
                >
                  {availablePlacements.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.volume.nonAirCount} blocks)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Export Mode / Validation Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#d4d4d8' }}>
              Validation Mode
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowLossy}
                  onChange={(e) => setAllowLossy(e.target.checked)}
                />
                Permissive / Confirm Lossy (downgrades unsupported format features gracefully)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={strict}
                  onChange={(e) => setStrict(e.target.checked)}
                />
                Strict Mode (rejects export if any block or entity mapping fails)
              </label>
            </div>
          </div>

          {/* Feedback & Export Report */}
          {errorMessage && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            >
              ✕ {errorMessage}
            </div>
          )}

          {report && (
            <div
              style={{
                backgroundColor: '#27272a',
                border: '1px solid #10b981',
                borderRadius: '6px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#34d399' }}>
                  ✓ Export Successful: {downloadFilename}
                </span>
                <span style={{ fontSize: '11px', color: '#a1a1aa' }}>
                  {formatBytes(report.estimatedOutputSizeBytes)}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#d4d4d8', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <div>📐 Dimensions: {report.dimensions.width}×{report.dimensions.height}×{report.dimensions.length}</div>
                <div>🧱 Non-air Blocks: {report.nonAirBlockCount}</div>
                <div>🎨 Palette Entries: {report.paletteSizeEstimate}</div>
                <div>📑 Regions: {report.regionCount}</div>
              </div>

              {report.ancillaryData && (
                <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #3f3f46', paddingTop: '6px' }}>
                  Ancillary: {report.ancillaryData.blockEntities} block entities, {report.ancillaryData.entities} entities{report.ancillaryData.biomes ? ', biomes' : ''}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 16px',
            backgroundColor: '#27272a',
            borderTop: '1px solid #3f3f46',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              backgroundColor: '#3f3f46',
              color: '#f4f4f5',
              border: '1px solid #52525b',
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
            onClick={handleExecuteExport}
            disabled={isExporting || availablePlacements.length === 0}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isExporting ? 'Exporting...' : 'Export & Download'}
          </button>
        </footer>
      </div>
    </div>
  );
}
