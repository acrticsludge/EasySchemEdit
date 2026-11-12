'use client';

import { useEffect, useState } from 'react';

export default function EditorIsland() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // eslint-disable-next-line no-console
    console.log('EditorIsland mounted — domain/command bus integration in h-5+');
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#cbd5e1',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>EasySchemEdit</h1>
      <p style={{ fontSize: '0.95rem', opacity: 0.7 }}>
        {mounted ? 'React editor island mounted.' : 'Mounting...'}
      </p>
      <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '1rem' }}>
        Shell only — editor UI, Three.js renderer, and domain integration in h-2+.
      </p>
    </div>
  );
}
