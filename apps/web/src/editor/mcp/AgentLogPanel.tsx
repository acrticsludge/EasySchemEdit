// apps/web/src/editor/mcp/AgentLogPanel.tsx
// Agent Log bottom panel & browser MCP pairing interface (Slice E4.2, SUBSPEC-F §8.2, SUBSPEC-G §6.4).
// Displays paired companion connection status, pairing token input, activity log table, and
// D-8 gated one-click undo button.

import React, { useState, useEffect, useCallback } from 'react';
import type { EditorSession } from '@easyschemedit/operations';
import { AGENT_LOG_PANEL_UNDO_SOURCE } from '@easyschemedit/ui';
import type { McpBridgeClient, BrowserAgentLogEntry } from './mcp-bridge-client.ts';

export interface AgentLogPanelProps {
  client: McpBridgeClient;
  session: EditorSession;
  className?: string;
}

export function AgentLogPanel({ client, session, className }: AgentLogPanelProps) {
  const [pairingToken, setPairingToken] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [, setRevisionTick] = useState(0);

  const forceUpdate = useCallback(() => {
    setRevisionTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const unsubClient = client.subscribe(forceUpdate);
    const unsubSession = session.subscribe(forceUpdate);
    return () => {
      unsubClient();
      unsubSession();
    };
  }, [client, session, forceUpdate]);

  const handlePair = async () => {
    const token = pairingToken.trim();
    if (!token) return;
    setIsPairing(true);
    try {
      await client.pairWithToken(token);
    } finally {
      setIsPairing(false);
    }
  };

  const handleDisconnect = () => {
    client.disconnect();
  };

  const handleUndo = (entryId: string) => {
    client.undoAgentEntry(entryId);
  };

  const isConnected = client.status === 'connected';
  const isConnecting = client.status === 'connecting' || isPairing;
  const isError = client.status === 'error';
  const entries = [...client.getEntries()].reverse();

  // Clean host display: e.g. "127.0.0.1:43127"
  const hostDisplay = client.baseUrl.replace(/^https?:\/\//, '');

  return (
    <div
      className={`agent-log-panel ${className ?? ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: '#18181b',
        color: '#f4f4f5',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* ── Pairing Bar ────────────────────────────────────────── */}
      <header
        className="agent-log-pairing-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#27272a',
          borderBottom: '1px solid #3f3f46',
          flexWrap: 'wrap',
        }}
      >
        <label
          htmlFor="mcp-pairing-token-input"
          style={{ fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          Companion Bridge:
        </label>

        <input
          id="mcp-pairing-token-input"
          type="text"
          value={pairingToken}
          onChange={(e) => setPairingToken(e.target.value)}
          placeholder="Enter 64-hex pairing token from companion..."
          disabled={isConnected || isConnecting}
          aria-label="Pairing Token"
          style={{
            flex: '1 1 240px',
            minWidth: '200px',
            padding: '4px 8px',
            backgroundColor: '#18181b',
            color: '#f4f4f5',
            border: '1px solid #52525b',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        />

        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            style={{
              padding: '4px 12px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePair}
            disabled={isConnecting || !pairingToken.trim()}
            style={{
              padding: '4px 12px',
              backgroundColor: isConnecting || !pairingToken.trim() ? '#52525b' : '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnecting || !pairingToken.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {isConnecting ? 'Pairing...' : 'Pair Browser'}
          </button>
        )}

        {/* Connection status badge */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isConnected && (
            <span
              className="badge badge-connected"
              role="status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                color: '#4ade80',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title={`Session ID: ${client.sessionId}`}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#4ade80',
                }}
              />
              Connected to {hostDisplay}
            </span>
          )}

          {isConnecting && (
            <span
              className="badge badge-connecting"
              role="status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(234, 179, 8, 0.2)',
                color: '#facc15',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              Connecting...
            </span>
          )}

          {isError && (
            <span
              className="badge badge-error"
              role="alert"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title={client.errorMessage ?? undefined}
            >
              Error: {client.errorMessage ?? 'Pairing failed'}
            </span>
          )}

          {!isConnected && !isConnecting && !isError && (
            <span
              className="badge badge-disconnected"
              role="status"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(113, 113, 122, 0.2)',
                color: '#a1a1aa',
                border: '1px solid rgba(113, 113, 122, 0.4)',
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              Disconnected
            </span>
          )}
        </div>
      </header>

      {/* ── Agent Log Table ────────────────────────────────────── */}
      <main
        className="agent-log-content"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {entries.length === 0 ? (
          <div
            className="empty-state"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#71717a',
              fontStyle: 'italic',
            }}
          >
            No agent activity logged yet.
          </div>
        ) : (
          <table
            aria-label="Agent Log"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid #3f3f46', color: '#a1a1aa', fontSize: '11px' }}>
                <th style={{ padding: '6px 8px', width: '90px' }}>Time</th>
                <th style={{ padding: '6px 8px', width: '130px' }}>Tool</th>
                <th style={{ padding: '6px 8px', width: '60px' }}>Rev</th>
                <th style={{ padding: '6px 8px', width: '100px' }}>Changed Blocks</th>
                <th style={{ padding: '6px 8px' }}>Summary / Warnings</th>
                <th style={{ padding: '6px 8px', width: '80px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: BrowserAgentLogEntry) => {
                const undoAvailable = client.isUndoAvailable(entry.id, session.revision);
                const timeStr = entry.timestamp.includes('T')
                  ? entry.timestamp.split('T')[1].slice(0, 8)
                  : entry.timestamp;

                return (
                  <tr
                    key={entry.id}
                    style={{
                      borderBottom: '1px solid #27272a',
                      opacity: entry.undone ? 0.6 : 1,
                    }}
                  >
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#a1a1aa' }}>
                      {timeStr}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <code
                        style={{
                          backgroundColor: '#27272a',
                          padding: '2px 5px',
                          borderRadius: '3px',
                          fontSize: '12px',
                        }}
                      >
                        {entry.tool}
                      </code>
                    </td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                      #{entry.revision}
                    </td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                      {entry.changedCells}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <div>{entry.resultSummary}</div>
                      {entry.warnings.length > 0 && (
                        <div style={{ color: '#facc15', fontSize: '11px', marginTop: '2px' }}>
                          {entry.warnings.map((w, idx) => (
                            <span key={idx}>⚠ {w} </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        data-undo-source={AGENT_LOG_PANEL_UNDO_SOURCE}
                        disabled={!undoAvailable}
                        title={
                          undoAvailable
                            ? 'Undo this operation'
                            : entry.undone
                            ? 'This operation has already been undone'
                            : 'Only the latest revision can be undone directly'
                        }
                        onClick={() => handleUndo(entry.id)}
                        style={{
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 500,
                          borderRadius: '4px',
                          border: 'none',
                          cursor: undoAvailable ? 'pointer' : 'not-allowed',
                          backgroundColor: undoAvailable ? '#3f3f46' : '#27272a',
                          color: undoAvailable ? '#ffffff' : '#71717a',
                        }}
                      >
                        {entry.undone ? 'Undone' : 'Undo'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
