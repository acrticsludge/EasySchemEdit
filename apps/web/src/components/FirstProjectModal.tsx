// apps/web/src/components/FirstProjectModal.tsx
// First-login onboarding dialog shown when a signed-in user has 0 cloud projects.
// S&box aesthetic matching EXPLORER_PLAN.md.

import React, { useState, useEffect } from 'react';

export interface FirstProjectModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onCreate: (projectName: string, schematicName: string, thenImport?: boolean) => Promise<void> | void;
}

export function FirstProjectModal({
  isOpen,
  onClose,
  onCreate,
}: FirstProjectModalProps): React.ReactElement | null {
  const [projectName, setProjectName] = useState('My First Project');
  const [schematicName, setSchematicName] = useState('main.schem');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProjectName('My First Project');
      setSchematicName('main.schem');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (thenImport = false) => {
    const pName = projectName.trim();
    let sName = schematicName.trim();
    if (!pName) {
      setError('Project name is required');
      return;
    }
    if (!sName) {
      setError('Initial schematic name is required');
      return;
    }
    if (!sName.endsWith('.schem') && !sName.endsWith('.litematic')) {
      sName += '.schem';
    }

    setIsLoading(true);
    setError(null);
    try {
      await onCreate(pName, sName, thenImport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create Your First Project"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#14161b',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
          color: '#eaeaea',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 600,
                color: '#ffffff',
                letterSpacing: '-0.2px',
              }}
            >
              📁 Create Your First Project
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: '#8b929e',
                lineHeight: 1.4,
              }}
            >
              Your cloud workspace is empty. Create a project folder and your initial schematic to get started.
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8b929e',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              ✕
            </button>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '4px',
              color: '#f87171',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#c2c5cc',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Project Folder Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. Medieval Castle"
              style={inputStyle}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#c2c5cc',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Initial Schematic Name
            </label>
            <input
              type="text"
              value={schematicName}
              onChange={(e) => setSchematicName(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. main.schem"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            marginTop: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => void handleSubmit(false)}
            disabled={isLoading}
            style={{
              ...buttonBaseStyle,
              backgroundColor: '#4a9eff',
              color: '#ffffff',
              fontWeight: 600,
            }}
          >
            {isLoading ? 'Creating...' : 'Create Project'}
          </button>

          <button
            type="button"
            onClick={() => void handleSubmit(true)}
            disabled={isLoading}
            style={{
              ...buttonBaseStyle,
              backgroundColor: '#1f242d',
              border: '1px solid #3d4452',
              color: '#c2c5cc',
            }}
          >
            Create & Import Schematic...
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  backgroundColor: '#0c0d10',
  border: '1px solid #2a2e38',
  borderRadius: '4px',
  color: '#ffffff',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
};

const buttonBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '4px',
  border: 'none',
  fontSize: '13px',
  cursor: 'pointer',
  transition: 'background-color 0.15s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
