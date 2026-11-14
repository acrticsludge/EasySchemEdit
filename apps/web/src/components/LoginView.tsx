// apps/web/src/components/LoginView.tsx
// Self-contained login and account registration view matching EasySchemEdit dark aesthetic.

import React, { useState, useRef, useEffect } from 'react';
import type { AuthUser } from '../client/auth-client.ts';
import { login, register } from '../client/auth-client.ts';

export interface LoginViewProps {
  onSuccess: (user: AuthUser) => void;
  title?: string;
  subtitle?: string;
  onCancel?: () => void;
  className?: string;
}

export function LoginView({
  onSuccess,
  title,
  subtitle,
  onCancel,
  className,
}: LoginViewProps): React.ReactElement {
  const [tab, setTab] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const usernameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus username input on mount or tab change
    usernameInputRef.current?.focus();
  }, [tab]);

  const handleTabChange = (newTab: 'signin' | 'register') => {
    if (isLoading) return;
    setTab(newTab);
    setErrorMessage(null);
    setConfirmPassword('');
  };

  const validate = (): string | null => {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      return 'Please enter your username';
    }
    if (trimmedUser.length < 3 || trimmedUser.length > 32) {
      return 'Username must be between 3 and 32 characters';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUser)) {
      return 'Username may only contain letters, numbers, underscores, and hyphens';
    }
    if (!password) {
      return 'Please enter your password';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (tab === 'register') {
      if (!confirmPassword) {
        return 'Please confirm your password';
      }
      if (confirmPassword !== password) {
        return 'Passwords do not match';
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMessage(null);

    const clientError = validate();
    if (clientError) {
      setErrorMessage(clientError);
      return;
    }

    setIsLoading(true);
    try {
      const trimmedUser = username.trim();
      let user: AuthUser;
      if (tab === 'signin') {
        user = await login(trimmedUser, password);
      } else {
        user = await register(trimmedUser, password);
      }
      onSuccess(user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`login-view ${className ?? ''}`}
      style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: '#1c1f26',
        border: '1px solid #2a2f3a',
        borderRadius: '8px',
        padding: '28px 24px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        color: '#eaeaea',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h2
          style={{
            margin: '0 0 6px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: '#f4f4f5',
            letterSpacing: '-0.01em',
          }}
        >
          {title ?? (tab === 'signin' ? 'Sign In to EasySchemEdit' : 'Create an Account')}
        </h2>
        {subtitle ? (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#9ca3af',
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: '13px',
              color: '#9ca3af',
              lineHeight: 1.4,
            }}
          >
            {tab === 'signin'
              ? 'Enter your credentials to access your saved projects'
              : 'Create an account to save and access cloud projects anywhere'}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Authentication mode"
        style={{
          display: 'flex',
          gap: '4px',
          backgroundColor: '#14161b',
          border: '1px solid #2a2f3a',
          borderRadius: '6px',
          padding: '4px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signin'}
          disabled={isLoading}
          onClick={() => handleTabChange('signin')}
          style={{
            flex: 1,
            padding: '7px 12px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: tab === 'signin' ? '#2a2f3a' : 'transparent',
            color: tab === 'signin' ? '#f4f4f5' : '#9ca3af',
            fontSize: '13px',
            fontWeight: tab === 'signin' ? 600 : 500,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease, color 0.15s ease',
          }}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'register'}
          disabled={isLoading}
          onClick={() => handleTabChange('register')}
          style={{
            flex: 1,
            padding: '7px 12px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: tab === 'register' ? '#2a2f3a' : 'transparent',
            color: tab === 'register' ? '#f4f4f5' : '#9ca3af',
            fontSize: '13px',
            fontWeight: tab === 'register' ? 600 : 500,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s ease, color 0.15s ease',
          }}
        >
          Create Account
        </button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '16px',
            color: '#f87171',
            fontSize: '12px',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>⚠️</span>
          <span style={{ flex: 1 }}>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Username */}
        <div>
          <label
            htmlFor="ese-auth-username"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: '#d1d5db',
              marginBottom: '6px',
            }}
          >
            Username
          </label>
          <input
            id="ese-auth-username"
            ref={usernameInputRef}
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck="false"
            disabled={isLoading}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="e.g. miner_42"
            style={{
              width: '100%',
              backgroundColor: '#14161b',
              border: '1px solid #2a2f3a',
              borderRadius: '6px',
              padding: '9px 12px',
              color: '#f4f4f5',
              fontSize: '13px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {tab === 'register' && (
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#71717a' }}>
              3–32 characters (letters, numbers, _, -)
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="ese-auth-password"
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 500,
              color: '#d1d5db',
              marginBottom: '6px',
            }}
          >
            Password
          </label>
          <input
            id="ese-auth-password"
            type="password"
            autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
            disabled={isLoading}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="••••••••"
            style={{
              width: '100%',
              backgroundColor: '#14161b',
              border: '1px solid #2a2f3a',
              borderRadius: '6px',
              padding: '9px 12px',
              color: '#f4f4f5',
              fontSize: '13px',
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {tab === 'register' && (
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#71717a' }}>
              At least 8 characters
            </p>
          )}
        </div>

        {/* Confirm Password (Register mode only) */}
        {tab === 'register' && (
          <div>
            <label
              htmlFor="ese-auth-confirm-password"
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: '#d1d5db',
                marginBottom: '6px',
              }}
            >
              Confirm Password
            </label>
            <input
              id="ese-auth-confirm-password"
              type="password"
              autoComplete="new-password"
              disabled={isLoading}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="••••••••"
              style={{
                width: '100%',
                backgroundColor: '#14161b',
                border: '1px solid #2a2f3a',
                borderRadius: '6px',
                padding: '9px 12px',
                color: '#f4f4f5',
                fontSize: '13px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          {onCancel && (
            <button
              type="button"
              disabled={isLoading}
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '9px 16px',
                backgroundColor: 'transparent',
                border: '1px solid #2a2f3a',
                borderRadius: '6px',
                color: '#9ca3af',
                fontSize: '13px',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease, color 0.15s ease',
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              flex: 2,
              padding: '9px 16px',
              backgroundColor: isLoading ? '#1d4ed8' : '#2563eb',
              border: 'none',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.15s ease',
            }}
          >
            {isLoading ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
                <span>{tab === 'signin' ? 'Signing In...' : 'Creating Account...'}</span>
              </>
            ) : (
              <span>{tab === 'signin' ? 'Sign In' : 'Create Account'}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
