/**
 * Oracle Pulse Dev Server
 * Port: 3459
 *
 * WezTerm API wrapper + WebSocket relay + Claude Code interaction
 */

const PORT = 3459;

// Types
interface Pane {
  pane_id: number;
  title: string;
  cwd: string;
  size: number;
}

interface SplitProfileRequest {
  agents: string[];
  split: boolean;
}

interface ClaudeSession {
  id: string;
  cwd: string;
  status: 'active' | 'idle';
  lastActivity: Date;
}

// WebSocket clients
const wsClients = new Set<WebSocket>();
const claudeSessions = new Map<string, ClaudeSession>();

// ============ WezTerm API ============

async function findWeztermSocket(): Promise<string | null> {
  try {
    const result = await Bun.$`ls -t /tmp/.wezterm-*-sock-* 2>/dev/null | head -1`.text();
    return result.trim() || null;
  } catch {
    return null;
  }
}

function weztermEnv(sock: string): Record<string, string> {
  return { WEZTERM_UNIX_DOMAIN: `UNIX:${sock}` };
}

async function wezterm(args: string[], env: Record<string, string>): Promise<string> {
  const result = await Bun.$`wezterm cli ${args}`.env(env);
  return result.text();
}

function sshTmuxArgs(agent: string): string[] {
  return [
    'ssh', '-t', 'localhost',
    'tmux', 'attach', '-t', agent
  ];
}

async function spawnNewWindow(agent: string, env: Record<string, string>): Promise<void> {
  const args = sshTmuxArgs(agent);
  await Bun.$`wezterm cli spawn -- ${args}`.env(env);
}

async function spawnTab(agent: string, paneId: number, env: Record<string, string>): Promise<void> {
  const args = sshTmuxArgs(agent);
  await Bun.$`wezterm cli spawn --pane-id ${paneId} -- ${args}`.env(env);
}

async function spawnSplit(agents: string[], sock: string): Promise<void> {
  if (agents.length < 2) return;
  const env = weztermEnv(sock);
  await Bun.$`wezterm cli split-pane -- ${sshTmuxArgs(agents[0])}`.env(env);
  await Bun.$`wezterm cli split-pane -- ${sshTmuxArgs(agents[1])}`.env(env);
}

async function killPane(paneId: number, env: Record<string, string>): Promise<void> {
  await Bun.$`wezterm cli kill-pane --pane-id ${paneId}`.env(env);
}

async function listPanes(env: Record<string, string>): Promise<Pane[]> {
  try {
    const result = await wezterm(['list', '--format', 'json'], env);
    return JSON.parse(result);
  } catch {
    return [];
  }
}

async function sendText(paneId: number, text: string, env: Record<string, string>): Promise<void> {
  await Bun.$`wezterm cli send-text --pane-id ${paneId} ${text}`.env(env);
}

// ============ WebSocket Broadcast ============

function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data, timestamp: Date.now() });
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// ============ HTTP Server with WebSocket ============

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response('WebSocket upgrade failed', { status: 500 });
      }
      return undefined;
    }

    // GET /wezterm/panes
    if (url.pathname === '/wezterm/panes' && req.method === 'GET') {
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json({ error: 'WezTerm not running' }, { status: 503 });
      }
      const panes = await listPanes(weztermEnv(sock));
      return Response.json(panes);
    }

    // POST /wezterm/split-profile
    if (url.pathname === '/wezterm/split-profile' && req.method === 'POST') {
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json({ error: 'WezTerm not running' }, { status: 503 });
      }

      const body = await req.json() as SplitProfileRequest;
      const { agents, split } = body;

      if (split && agents.length >= 2) {
        await spawnSplit(agents, sock);
      } else {
        const env = weztermEnv(sock);
        for (const agent of agents) {
          await spawnNewWindow(agent, env);
        }
      }

      broadcast('agents_spawned', { agents, split });
      return Response.json({ success: true, agents });
    }

    // GET /wezterm/kill-pane
    if (url.pathname === '/wezterm/kill-pane' && req.method === 'GET') {
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json({ error: 'WezTerm not running' }, { status: 503 });
      }

      const paneId = parseInt(url.searchParams.get('pane_id') || '0');
      if (!paneId) {
        return Response.json({ error: 'pane_id required' }, { status: 400 });
      }

      await killPane(paneId, weztermEnv(sock));
      broadcast('pane_killed', { pane_id: paneId });
      return Response.json({ success: true, pane_id: paneId });
    }

    // POST /wezterm/close-panes
    if (url.pathname === '/wezterm/close-panes' && req.method === 'POST') {
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json({ error: 'WezTerm not running' }, { status: 503 });
      }

      const body = await req.json() as { pane_ids: number[] };
      const env = weztermEnv(sock);

      for (const paneId of body.pane_ids) {
        await killPane(paneId, env);
      }

      broadcast('panes_closed', { pane_ids: body.pane_ids });
      return Response.json({ success: true, closed: body.pane_ids.length });
    }

    // POST /wezterm/send-text — Send command to terminal
    if (url.pathname === '/wezterm/send-text' && req.method === 'POST') {
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json({ error: 'WezTerm not running' }, { status: 503 });
      }

      const body = await req.json() as { pane_id: number; text: string; enter?: boolean };
      const text = body.enter ? `${body.text}\n` : body.text;

      await sendText(body.pane_id, text, weztermEnv(sock));
      broadcast('text_sent', { pane_id: body.pane_id, text: body.text });
      return Response.json({ success: true, pane_id: body.pane_id });
    }

    // POST /claude/prompt — Send prompt to Claude Code session
    if (url.pathname === '/claude/prompt' && req.method === 'POST') {
      const body = await req.json() as { session_id?: string; prompt: string };

      // Find Claude Code pane (look for claude in title)
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json({ error: 'WezTerm not running' }, { status: 503 });
      }

      const panes = await listPanes(weztermEnv(sock));
      const claudePane = panes.find(p =>
        p.title.toLowerCase().includes('claude') ||
        p.cwd.toLowerCase().includes('oracle')
      );

      if (!claudePane) {
        return Response.json({ error: 'No Claude Code session found' }, { status: 404 });
      }

      // Send prompt with Enter
      await sendText(claudePane.pane_id, `${body.prompt}\n`, weztermEnv(sock));
      broadcast('claude_prompt', { pane_id: claudePane.pane_id, prompt: body.prompt });
      return Response.json({ success: true, pane_id: claudePane.pane_id });
    }

    // GET /claude/sessions — List Claude Code sessions
    if (url.pathname === '/claude/sessions' && req.method === 'GET') {
      const sock = await findWeztermSocket();
      if (!sock) {
        return Response.json([]);
      }

      const panes = await listPanes(weztermEnv(sock));
      const claudePanes = panes.filter(p =>
        p.title.toLowerCase().includes('claude') ||
        p.cwd.toLowerCase().includes('oracle')
      ).map(p => ({
        pane_id: p.pane_id,
        cwd: p.cwd,
        title: p.title,
        status: 'active' as const
      }));

      return Response.json(claudePanes);
    }

    // POST /mqtt/send/:agent — Send message to specific agent via MQTT
    if (url.pathname.startsWith('/mqtt/send/') && req.method === 'POST') {
      const agentId = url.pathname.split('/mqtt/send/')[1];
      const body = await req.json() as { message: string };

      // In real implementation, this would publish to MQTT broker
      // For now, broadcast via WebSocket
      broadcast('mqtt_message', {
        target: agentId,
        message: body.message,
        timestamp: Date.now()
      });

      console.log(`📤 MQTT send to ${agentId}: ${body.message}`);
      return Response.json({ success: true, target: agentId, sent: true });
    }

    // POST /mqtt/broadcast — Broadcast message to all agents
    if (url.pathname === '/mqtt/broadcast' && req.method === 'POST') {
      const body = await req.json() as { message: string };

      broadcast('mqtt_broadcast', {
        message: body.message,
        timestamp: Date.now()
      });

      console.log(`📢 MQTT broadcast: ${body.message}`);
      return Response.json({ success: true, broadcast: true });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        ws_clients: wsClients.size
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
      console.log(`📡 WebSocket client connected (${wsClients.size} total)`);
      ws.send(JSON.stringify({ type: 'connected', data: { message: 'Welcome to Oracle Pulse' } }));
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());
        console.log('📩 WebSocket message:', data.type);

        // Handle different message types
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }

        if (data.type === 'get_panes') {
          findWeztermSocket().then(sock => {
            if (sock) {
              listPanes(weztermEnv(sock)).then(panes => {
                ws.send(JSON.stringify({ type: 'panes', data: panes }));
              });
            }
          });
        }
      } catch (e) {
        console.error('WebSocket parse error:', e);
      }
    },
    close(ws) {
      wsClients.delete(ws);
      console.log(`📡 WebSocket client disconnected (${wsClients.size} total)`);
    },
  },
});

console.log(`🔮 Oracle Pulse Dev Server running on http://localhost:${PORT}`);
console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
console.log(`   GET  /wezterm/panes        — List all panes`);
console.log(`   POST /wezterm/split-profile — Open agents`);
console.log(`   POST /wezterm/send-text    — Send text to pane`);
console.log(`   POST /claude/prompt        — Send prompt to Claude`);
console.log(`   GET  /claude/sessions      — List Claude sessions`);
