import { create } from 'zustand';

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: 'active' | 'inactive' | 'error';
  paneId?: number;
  cwd?: string;
  branch?: string;
}

export interface Session {
  id: string;
  name: string;
  repo: string;
  branch: string;
  status: 'running' | 'stopped';
}

export interface Pane {
  pane_id: number;
  title: string;
  cwd: string;
  size: number;
}

interface PulseState {
  agents: Agent[];
  sessions: Session[];
  panes: Pane[];
  clickHistory: string[];
  voiceModalOpen: boolean;

  // Actions
  setAgents: (agents: Agent[]) => void;
  setSessions: (sessions: Session[]) => void;
  setPanes: (panes: Pane[]) => void;
  addClick: (agentId: string) => void;
  setVoiceModalOpen: (open: boolean) => void;
  openAgent: (agentId: string) => void;
  closeAgent: (agentId: string) => void;
}

export const usePulseStore = create<PulseState>((set, get) => ({
  agents: [
    { id: 'pulse', name: 'Pulse', emoji: '🔮', status: 'active' },
    { id: 'sundance', name: 'Sundance', emoji: '🐱', status: 'active' },
    { id: 'hermes', name: 'Hermes', emoji: '⚡', status: 'inactive' },
    { id: 'athena', name: 'Athena', emoji: '🦉', status: 'inactive' },
    { id: 'thor', name: 'Thor', emoji: '🔨', status: 'inactive' },
    { id: 'mother', name: 'Mother', emoji: '🔮', status: 'active' },
    { id: 'creator', name: 'Creator', emoji: '🎨', status: 'active' },
    { id: 'apollo', name: 'Apollo', emoji: '☀️', status: 'inactive' },
    { id: 'homekeeper', name: 'Homekeeper', emoji: '🏠', status: 'inactive' },
  ],
  sessions: [],
  panes: [],
  clickHistory: [],
  voiceModalOpen: false,

  setAgents: (agents) => set({ agents }),
  setSessions: (sessions) => set({ sessions }),
  setPanes: (panes) => set({ panes }),
  addClick: (agentId) => set((state) => ({
    clickHistory: [agentId, ...state.clickHistory.filter(id => id !== agentId)].slice(0, 5)
  })),
  setVoiceModalOpen: (open) => set({ voiceModalOpen: open }),

  openAgent: async (agentId) => {
    const { addClick } = get();
    addClick(agentId);

    try {
      await fetch('http://localhost:3459/wezterm/split-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agents: [agentId], split: false })
      });
    } catch (err) {
      console.error('Failed to open agent:', err);
    }
  },

  closeAgent: async (agentId) => {
    const agent = get().agents.find(a => a.id === agentId);
    if (agent?.paneId) {
      try {
        await fetch(`http://localhost:3459/wezterm/kill-pane?pane_id=${agent.paneId}`);
      } catch (err) {
        console.error('Failed to close agent:', err);
      }
    }
  },
}));
