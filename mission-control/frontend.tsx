import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { usePulseStore } from './store';
import { AgentGrid } from './components/AgentGrid';
import { Sidebar } from './components/Sidebar';
import { VoiceModal } from './components/VoiceModal';
import { TerminalPanel } from './components/TerminalPanel';

const WS_URL = 'ws://localhost:3459/ws';
const DEDUP_INTERVAL = 15000; // 15 seconds auto-dedup

export default function App() {
  const { voiceModalOpen, setVoiceModalOpen, setPanes, setSessions, setAgents, agents } = usePulseStore();
  const [wsConnected, setWsConnected] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // WebSocket connection
  useEffect(() => {
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      console.log('📡 WebSocket connected');
      setWsConnected(true);
      setWs(socket);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📩 Received:', data.type);

        switch (data.type) {
          case 'panes':
            setPanes(data.data);
            dedupAgents(data.data);
            break;
          case 'sessions':
            setSessions(data.data);
            break;
          case 'connected':
            socket.send(JSON.stringify({ type: 'get_panes' }));
            break;
          case 'agents_spawned':
          case 'pane_killed':
          case 'text_sent':
            socket.send(JSON.stringify({ type: 'get_panes' }));
            break;
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    };

    socket.onclose = () => {
      console.log('📡 WebSocket disconnected');
      setWsConnected(false);
      setWs(null);
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    return () => socket.close();
  }, []);

  // Auto-dedup: merge panes with agents
  const dedupAgents = useCallback((panes: any[]) => {
    const updatedAgents = agents.map(agent => {
      const matchingPane = panes.find((p: any) =>
        p.title?.toLowerCase().includes(agent.id) ||
        p.cwd?.toLowerCase().includes(agent.id)
      );

      if (matchingPane) {
        return {
          ...agent,
          status: 'active' as const,
          paneId: matchingPane.pane_id,
          cwd: matchingPane.cwd,
          branch: matchingPane.cwd?.split('/').pop()
        };
      }
      return agent;
    });

    setAgents(updatedAgents);
  }, [agents, setAgents]);

  // Auto-dedup interval (every 15 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3459/wezterm/panes');
        const panes = await res.json();
        if (Array.isArray(panes)) {
          setPanes(panes);
          dedupAgents(panes);
        }
      } catch {
        // Silently fail - WezTerm might not be running
      }
    }, DEDUP_INTERVAL);

    return () => clearInterval(interval);
  }, [dedupAgents, setPanes]);

  // Periodic session refresh
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3459/claude/sessions');
        const sessions = await res.json();
        if (Array.isArray(sessions)) setSessions(sessions);
      } catch {
        // Silently fail
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [setSessions]);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <header className="p-4 border-b border-[#1a1a24] flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">🔮 Oracle Pulse</h1>
          <p className="text-sm text-[#8888a0]">Fleet Dashboard — {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-xs px-2 py-1 rounded ${wsConnected ? 'bg-green-600' : 'bg-red-600'}`}>
            {wsConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </span>
          <button
            className="px-3 py-1 bg-[#1a1a24] rounded hover:bg-[#2a2a34] text-sm"
            onClick={() => setShowTerminal(!showTerminal)}
          >
            💻 Terminal
          </button>
        </div>
      </header>

      <main className="flex">
        <div className="flex-1 mr-[280px]">
          <AgentGrid />
          {showTerminal && <TerminalPanel ws={ws} />}
        </div>
        <Sidebar />
      </main>

      <button
        className="voice-btn"
        onClick={() => setVoiceModalOpen(true)}
      >
        🎤
      </button>

      {voiceModalOpen && (
        <>
          <div className="voice-overlay" onClick={() => setVoiceModalOpen(false)} />
          <VoiceModal />
        </>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
