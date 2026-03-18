import React from 'react';
import { usePulseStore } from '../store';

export function AgentGrid() {
  const { agents, clickHistory, openAgent, closeAgent } = usePulseStore();

  const getClickOrder = (agentId: string): number | null => {
    const idx = clickHistory.indexOf(agentId);
    return idx >= 0 && idx < 3 ? idx + 1 : null;
  };

  return (
    <div className="agent-grid">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className={`agent-card ${agent.status === 'active' ? 'active' : ''}`}
          onClick={() => openAgent(agent.id)}
        >
          <span className="emoji">{agent.emoji}</span>
          <span className="name">{agent.name}</span>

          {getClickOrder(agent.id) && (
            <span className={`history-badge click-${getClickOrder(agent.id)}`}>
              {getClickOrder(agent.id)}
            </span>
          )}

          <button
            className="close-btn"
            onClick={(e) => {
              e.stopPropagation();
              closeAgent(agent.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
