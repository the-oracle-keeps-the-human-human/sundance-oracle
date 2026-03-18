import React, { useState } from 'react';
import { usePulseStore } from '../store';

interface TerminalPanelProps {
  ws: WebSocket | null;
}

export function TerminalPanel({ ws }: TerminalPanelProps) {
  const { panes, sessions } = usePulseStore();
  const [prompt, setPrompt] = useState('');
  const [selectedPane, setSelectedPane] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<{ type: 'sent' | 'response'; text: string }[]>([]);

  const sendToClaude = async () => {
    if (!prompt.trim()) return;
    setSending(true);

    try {
      const res = await fetch('http://localhost:3459/claude/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setHistory(prev => [...prev, { type: 'sent', text: prompt }]);
        setPrompt('');
      } else {
        setHistory(prev => [...prev, { type: 'response', text: `Error: ${data.error}` }]);
      }
    } catch (err) {
      setHistory(prev => [...prev, { type: 'response', text: `Error: ${err}` }]);
    }

    setSending(false);
  };

  const sendToPane = async () => {
    if (!prompt.trim() || !selectedPane) return;
    setSending(true);

    try {
      const res = await fetch('http://localhost:3459/wezterm/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pane_id: selectedPane, text: prompt, enter: true })
      });

      const data = await res.json();
      if (data.success) {
        setHistory(prev => [...prev, { type: 'sent', text: `[Pane ${selectedPane}] ${prompt}` }]);
        setPrompt('');
      }
    } catch (err) {
      setHistory(prev => [...prev, { type: 'response', text: `Error: ${err}` }]);
    }

    setSending(false);
  };

  return (
    <div className="m-4 p-4 bg-[#12121a] rounded-lg border border-[#1a1a24]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">💻 Terminal Interaction</h3>
        <select
          className="bg-[#1a1a24] px-2 py-1 rounded text-sm"
          value={selectedPane || ''}
          onChange={(e) => setSelectedPane(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">Auto-detect Claude</option>
          {panes.map((pane) => (
            <option key={pane.pane_id} value={pane.pane_id}>
              #{pane.pane_id} - {pane.title || pane.cwd}
            </option>
          ))}
        </select>
      </div>

      {/* Claude Sessions */}
      {sessions.length > 0 && (
        <div className="mb-4 p-2 bg-[#0a0a0f] rounded">
          <p className="text-xs text-[#8888a0] mb-2">Active Claude Sessions:</p>
          <div className="flex gap-2 flex-wrap">
            {sessions.map((s) => (
              <span key={s.pane_id} className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                #{s.pane_id} {s.cwd.split('/').pop()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Command History */}
      <div className="h-32 overflow-y-auto mb-4 p-2 bg-[#0a0a0f] rounded font-mono text-sm">
        {history.length === 0 ? (
          <span className="text-[#8888a0]">No commands sent yet...</span>
        ) : (
          history.map((h, i) => (
            <div key={i} className={h.type === 'sent' ? 'text-green-400' : 'text-red-400'}>
              {h.type === 'sent' ? '→ ' : '← '}{h.text}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 bg-[#0a0a0f] px-3 py-2 rounded border border-[#1a1a24] focus:border-[#f97316] outline-none"
          placeholder="Enter command or prompt..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (selectedPane ? sendToPane() : sendToClaude())}
          disabled={sending}
        />
        <button
          className="px-4 py-2 bg-[#f97316] rounded hover:bg-[#ea580c] disabled:opacity-50"
          onClick={selectedPane ? sendToPane : sendToClaude}
          disabled={sending || !prompt.trim()}
        >
          {sending ? '⏳' : '📤'}
        </button>
      </div>

      <p className="text-xs text-[#8888a0] mt-2">
        Tip: Select a pane to send directly, or leave empty to auto-detect Claude Code session
      </p>
    </div>
  );
}
