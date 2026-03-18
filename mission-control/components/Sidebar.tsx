import React from 'react';
import { usePulseStore } from '../store';

export function Sidebar() {
  const { sessions, panes } = usePulseStore();

  return (
    <aside className="sidebar">
      <h2>📋 Sessions ({sessions.length})</h2>
      {sessions.length === 0 ? (
        <div className="text-sm text-[#8888a0] py-4">
          No active sessions
          <p className="mt-2 text-xs">Start dev-server to see sessions</p>
        </div>
      ) : (
        sessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.status === 'running' ? 'running' : ''}`}
          >
            <div className="font-medium">{session.name}</div>
            <div className="text-xs text-[#8888a0]">
              {session.repo} • {session.branch}
            </div>
          </div>
        ))
      )}

      <h2 className="mt-6">📱 Panes ({panes.length})</h2>
      {panes.length === 0 ? (
        <div className="text-sm text-[#8888a0] py-4">
          No panes detected
        </div>
      ) : (
        panes.slice(0, 5).map((pane) => (
          <div key={pane.pane_id} className="session-item">
            <div className="text-xs">#{pane.pane_id}</div>
            <div className="text-xs text-[#8888a0] truncate">
              {pane.title || pane.cwd}
            </div>
          </div>
        ))
      )}
    </aside>
  );
}
