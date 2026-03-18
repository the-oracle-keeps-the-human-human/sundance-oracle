import React, { useState } from 'react';
import { usePulseStore } from '../store';

export function VoiceModal() {
  const { setVoiceModalOpen, agents } = usePulseStore();
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [targetAgent, setTargetAgent] = useState<string | null>(null);

  const startListening = () => {
    setListening(true);
    // In real implementation, use Web Speech API
    // recognition.lang = 'th-TH';
    setTimeout(() => {
      setTranscript('สวัสดี Oracle');
      setListening(false);
    }, 2000);
  };

  const sendMessage = async () => {
    if (!transcript.trim()) return;

    try {
      if (targetAgent) {
        // Send to specific agent
        await fetch(`http://localhost:3459/message/${targetAgent}`, {
          method: 'POST',
          body: JSON.stringify({ message: transcript })
        });
      } else {
        // Broadcast to all
        await fetch('http://localhost:3459/broadcast', {
          method: 'POST',
          body: JSON.stringify({ message: transcript })
        });
      }
      setTranscript('');
      setVoiceModalOpen(false);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  return (
    <div className="voice-modal">
      <h2 className="text-lg font-semibold mb-4">🎤 Voice Command</h2>

      <div className="mb-4">
        <select
          className="w-full p-2 bg-[#12121a] rounded-lg border border-[#1a1a24]"
          value={targetAgent || ''}
          onChange={(e) => setTargetAgent(e.target.value || null)}
        >
          <option value="">📢 Broadcast to all</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.emoji} {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-[60px] bg-[#12121a] rounded-lg p-3 mb-4 text-sm">
        {listening ? (
          <span className="text-[#8888a0]">🎧 Listening...</span>
        ) : (
          transcript || <span className="text-[#8888a0]">Press mic to speak...</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 py-2 px-4 bg-[#12121a] rounded-lg hover:bg-[#1a1a24]"
          onClick={startListening}
        >
          🎤 Listen
        </button>
        <button
          className="flex-1 py-2 px-4 bg-[#f97316] rounded-lg hover:bg-[#ea580c]"
          onClick={sendMessage}
        >
          📤 Send
        </button>
        <button
          className="py-2 px-4 bg-[#12121a] rounded-lg hover:bg-[#1a1a24]"
          onClick={() => setVoiceModalOpen(false)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
