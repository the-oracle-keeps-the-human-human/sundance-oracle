import React from 'react';
import { createRoot } from 'react-dom/client';
import { usePulseStore } from './store';
import { AgentGrid } from './components/AgentGrid';
import { Sidebar } from './components/Sidebar';
import { VoiceModal } from './components/VoiceModal';

export default function App() {
  const { voiceModalOpen, setVoiceModalOpen } = usePulseStore();

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <header className="p-4 border-b border-[#1a1a24]">
        <h1 className="text-xl font-semibold">🔮 Oracle Pulse</h1>
        <p className="text-sm text-[#8888a0]">Fleet Dashboard — {new Date().toLocaleDateString()}</p>
      </header>

      <main className="flex">
        <div className="flex-1 mr-[280px]">
          <AgentGrid />
        </div>
        <Sidebar />
      </main>

      <button
        className="voice-btn"
        onClick={() => setVoiceModalOpen(true)}
      >
        🎤
      </button>

      {voiceModalOpen && <VoiceModal />}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
