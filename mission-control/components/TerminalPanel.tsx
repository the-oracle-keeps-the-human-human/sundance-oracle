import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePulseStore } from '../store';

interface TerminalPanelProps {
  ws: WebSocket | null;
}

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  timestamp: number;
}

export function TerminalPanel({ ws }: TerminalPanelProps) {
  const { panes, sessions } = usePulseStore();
  const [prompt, setPrompt] = useState('');
  const [selectedPane, setSelectedPane] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // WebSocket message handler
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'connected':
            setConnected(true);
            addLine('system', '🔗 Connected to Oracle Pulse');
            break;

          case 'claude_prompt':
            addLine('input', `> ${data.data.prompt}`);
            break;

          case 'text_sent':
            addLine('input', `> ${data.data.text}`);
            break;

          case 'terminal_output':
            addLine('output', data.data.text);
            break;

          case 'mqtt_message':
          case 'mqtt_broadcast':
            addLine('output', `📨 ${data.data.message}`);
            break;

          case 'agents_spawned':
            addLine('system', `🚀 Spawned: ${data.data.agents.join(', ')}`);
            break;

          case 'pane_killed':
            addLine('system', `💀 Pane ${data.data.pane_id} closed`);
            break;
        }
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    };

    ws.addEventListener('message', handleMessage);

    ws.onopen = () => {
      setConnected(true);
      addLine('system', '🔗 Connected to Oracle Pulse');
    };

    ws.onclose = () => {
      setConnected(false);
      addLine('error', '❌ Disconnected from server');
    };

    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    setLines(prev => [...prev.slice(-500), {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
      text,
      timestamp: Date.now()
    }]);
  }, []);

  // Poll for Claude session output
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!claudeSessionId) return;

      try {
        const res = await fetch(`http://localhost:3459/claude/output/${claudeSessionId}`);
        const data = await res.json();
        if (data.output) {
          addLine('output', data.output);
        }
      } catch {
        // Silently fail
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [claudeSessionId, addLine]);

  const sendToClaude = async () => {
    if (!prompt.trim()) return;
    setSending(true);
    addLine('input', prompt);

    try {
      const res = await fetch('http://localhost:3459/claude/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setClaudeSessionId(data.session_id || data.pane_id?.toString());
        setPrompt('');
      } else {
        addLine('error', `Error: ${data.error}`);
      }
    } catch (err) {
      addLine('error', `Error: ${err}`);
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const sendToPane = async () => {
    if (!prompt.trim() || !selectedPane) return;
    setSending(true);
    addLine('input', `[Pane ${selectedPane}] ${prompt}`);

    try {
      const res = await fetch('http://localhost:3459/wezterm/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pane_id: selectedPane, text: prompt, enter: true })
      });

      const data = await res.json();
      if (data.success) {
        setPrompt('');
      }
    } catch (err) {
      addLine('error', `Error: ${err}`);
    }

    setSending(false);
    inputRef.current?.focus();
  };

  const clearTerminal = () => {
    setLines([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (selectedPane) {
        sendToPane();
      } else {
        sendToClaude();
      }
    }
  };

  return (
    <div className="m-4 rounded-lg border border-[#1a1a24] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center p-3 bg-[#12121a] border-b border-[#1a1a24]">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">💻 Terminal</h3>
          <span className={`text-xs px-2 py-0.5 rounded ${connected ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'}`}>
            {connected ? '●' : '○'} {connected ? 'Connected' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-[#0a0a0f] px-2 py-1 rounded text-sm border border-[#2a2a34]"
            value={selectedPane || ''}
            onChange={(e) => setSelectedPane(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">🤖 Auto (Claude)</option>
            {panes.map((pane) => (
              <option key={pane.pane_id} value={pane.pane_id}>
                #{pane.pane_id} {pane.title?.slice(0, 20) || pane.cwd.split('/').pop()}
              </option>
            ))}
          </select>
          <button
            onClick={clearTerminal}
            className="px-2 py-1 text-xs bg-[#1a1a24] rounded hover:bg-[#2a2a34]"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {/* Claude Sessions indicator */}
      {sessions.length > 0 && (
        <div className="px-3 py-2 bg-[#0f0f14] border-b border-[#1a1a24] flex items-center gap-2">
          <span className="text-xs text-[#8888a0]">Active:</span>
          {sessions.slice(0, 3).map((s) => (
            <button
              key={s.pane_id}
              onClick={() => setSelectedPane(s.pane_id)}
              className={`text-xs px-2 py-0.5 rounded ${
                selectedPane === s.pane_id
                  ? 'bg-green-600 text-white'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              }`}
            >
              #{s.pane_id} {s.cwd.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Terminal output */}
      <div
        ref={terminalRef}
        className="h-64 overflow-y-auto p-3 bg-[#0a0a0f] font-mono text-sm"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.length === 0 ? (
          <div className="text-[#8888a0]">
            <p>🔮 Oracle Pulse Terminal</p>
            <p className="text-xs mt-1">Type a command or prompt and press Enter</p>
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`whitespace-pre-wrap break-all ${
                line.type === 'input' ? 'text-[#22c55e]' :
                line.type === 'output' ? 'text-[#f0f0f5]' :
                line.type === 'error' ? 'text-[#ef4444]' :
                'text-[#8888a0]'
              }`}
            >
              {line.type === 'input' && <span className="text-[#f97316]">❯ </span>}
              {line.text}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 p-3 bg-[#0f0f14] border-t border-[#1a1a24]">
        <span className="text-[#f97316]">❯</span>
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent outline-none text-sm"
          placeholder={selectedPane ? `Send to pane #${selectedPane}...` : "Send to Claude Code..."}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          autoFocus
        />
        <button
          className="px-3 py-1 bg-[#f97316] rounded hover:bg-[#ea580c] disabled:opacity-50 text-sm"
          onClick={selectedPane ? sendToPane : sendToClaude}
          disabled={sending || !prompt.trim()}
        >
          {sending ? '⏳' : 'Send'}
        </button>
      </div>
    </div>
  );
}
