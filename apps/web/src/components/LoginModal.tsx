// apps/web/src/components/LoginModal.tsx
// In-editor modal popup wrapping LoginView so guest users can authenticate in-place
// without navigating away or losing unsaved editor state.

import React, { useEffect } from 'react';
import type { AuthUser } from '../client/auth-client.ts';
import { LoginView } from './LoginView.tsx';

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
  title?: string;
  subtitle?: string;
}

export function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  title,
  subtitle,
}: LoginModalProps): React.ReactElement | null {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Sign in to save & open cloud projects'}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '420px',
        }}
      >
        {/* Top-right close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            zIndex: 10,
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
            borderRadius: '4px',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9ca3af';
          }}
        >
          ✕
        </button>

        <LoginView
          title={title ?? 'Sign in to EasySchemEdit'}
          subtitle={subtitle ?? 'Sign in to save & open cloud projects'}
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
