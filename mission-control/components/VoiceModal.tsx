import React, { useState, useEffect, useRef } from 'react';
import { usePulseStore } from '../store';

export function VoiceModal() {
  const { setVoiceModalOpen, agents } = usePulseStore();
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [targetAgent, setTargetAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Initialize Web Speech API
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'th-TH'; // Thai language
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        const result = event.results[event.results.length - 1];
        const text = result[0].transcript;
        setTranscript(text);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.onerror = (event: any) => {
        setError(`Speech error: ${event.error}`);
        setListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startListening = () => {
    setError(null);
    setTranscript('');

    if (recognitionRef.current) {
      setListening(true);
      recognitionRef.current.start();
    } else {
      // Fallback: simulate for testing
      setListening(true);
      setTimeout(() => {
        setTranscript('สวัสดี Oracle');
        setListening(false);
      }, 2000);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  };

  const sendMessage = async (broadcast: boolean = false) => {
    if (!transcript.trim()) return;

    try {
      const endpoint = broadcast
        ? 'http://localhost:3459/mqtt/broadcast'
        : `http://localhost:3459/mqtt/send/${targetAgent || 'all'}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: transcript })
      });

      const data = await res.json();
      if (data.success) {
        console.log('Message sent:', data);
        setTranscript('');
        setVoiceModalOpen(false);
      } else {
        setError(data.error || 'Failed to send');
      }
    } catch (err) {
      setError(`Error: ${err}`);
    }
  };

  return (
    <div className="voice-modal">
      <h2 className="text-xl font-semibold mb-2">🎤 Voice Command</h2>
      <p className="text-xs text-[#8888a0] mb-4">Thai language supported</p>

      {/* Agent selector */}
      <div className="mb-4">
        <select
          className="w-full p-3 bg-[#0a0a0f] rounded-lg border border-[#2a2a34] text-sm focus:border-[#f97316] outline-none"
          value={targetAgent || ''}
          onChange={(e) => setTargetAgent(e.target.value || null)}
        >
          <option value="">📢 Broadcast to all</option>
          {agents.filter(a => a.status === 'active').map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.emoji} {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* Transcript display */}
      <div className="min-h-[80px] bg-[#0a0a0f] rounded-lg p-4 mb-4 text-sm border border-[#1a1a24]">
        {listening ? (
          <div className="flex items-center gap-2">
            <span className="animate-pulse">🎧</span>
            <span className="text-[#f97316]">Listening...</span>
          </div>
        ) : transcript ? (
          <span className="text-[#22c55e]">"{transcript}"</span>
        ) : (
          <span className="text-[#8888a0]">Press mic to speak...</span>
        )}
        {error && <span className="text-red-400 block mt-2">{error}</span>}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          className={`flex-1 py-3 px-4 rounded-lg transition-all ${
            listening
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-[#1a1a24] hover:bg-[#2a2a34]'
          }`}
          onClick={listening ? stopListening : startListening}
        >
          {listening ? '⏹️ Stop' : '🎤 Listen'}
        </button>

        <button
          className="flex-1 py-3 px-4 bg-[#f97316] rounded-lg hover:bg-[#ea580c] disabled:opacity-50 transition-all"
          onClick={() => sendMessage(false)}
          disabled={!transcript.trim()}
        >
          📤 Send
        </button>

        <button
          className="py-3 px-4 bg-[#22c55e] rounded-lg hover:bg-[#16a34a] transition-all"
          onClick={() => sendMessage(true)}
          disabled={!transcript.trim()}
          title="Broadcast to all agents"
        >
          📢
        </button>
      </div>

      <button
        className="absolute top-4 right-4 text-[#8888a0] hover:text-white"
        onClick={() => setVoiceModalOpen(false)}
      >
        ✕
      </button>
    </div>
  );
}
