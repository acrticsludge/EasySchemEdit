// apps/web/src/islands/LoginPageIsland.tsx
// Standalone login page client island. Validates ?redirect=, checks active session,
// and redirects to the editor or requested relative path on auth success.

import React, { useState, useEffect } from 'react';
import type { AuthUser } from '../client/auth-client.ts';
import { getMe } from '../client/auth-client.ts';
import { LoginView } from '../components/LoginView.tsx';

function getValidRedirect(): string {
  if (typeof window === 'undefined') return '/editor';
  try {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    // Ensure relative path starting with '/' but not '//' or containing backslashes
    if (
      redirect &&
      redirect.startsWith('/') &&
      !redirect.startsWith('//') &&
      !redirect.includes('\\')
    ) {
      return redirect;
    }
  } catch {
    // Fall back to /editor on malformed search params
  }
  return '/editor';
}

export default function LoginPageIsland(): React.ReactElement {
  const [isChecking, setIsChecking] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkExistingAuth() {
      const user = await getMe();
      if (!active) return;

      if (user) {
        setRedirecting(true);
        const destination = getValidRedirect();
        window.location.replace(destination);
      } else {
        setIsChecking(false);
      }
    }

    void checkExistingAuth();

    return () => {
      active = false;
    };
  }, []);

  const handleSuccess = (_user: AuthUser) => {
    setRedirecting(true);
    const destination = getValidRedirect();
    window.location.replace(destination);
  };

  const handleCancel = () => {
    window.location.replace('/editor');
  };

  if (isChecking || redirecting) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          color: '#a1a1aa',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          fontSize: '14px',
          minHeight: '260px',
        }}
      >
        <span style={{ fontSize: '24px', animation: 'spin 1.5s linear infinite' }}>⏳</span>
        <span>{redirecting ? 'Signed in! Redirecting...' : 'Checking session...'}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
      }}
    >
      <LoginView
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <a
          href="/editor"
          style={{
            fontSize: '13px',
            color: '#60a5fa',
            textDecoration: 'none',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.textDecoration = 'underline';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.textDecoration = 'none';
          }}
        >
          ← Continue to Editor as Guest
        </a>
      </div>
    </div>
  );
}
