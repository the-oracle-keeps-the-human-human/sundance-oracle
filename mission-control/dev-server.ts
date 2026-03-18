/**
 * Oracle Pulse Dev Server
 * Port: 3459
 *
 * WezTerm API wrapper + WebSocket relay
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

  // First agent in current pane
  await Bun.$`wezterm cli split-pane -- ${sshTmuxArgs(agents[0])}`.env(env);

  // Second agent in split
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

// ============ HTTP Server ============

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
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

      return Response.json({ success: true, closed: body.pane_ids.length });
    }

    // Health check
    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

console.log(`🔮 Oracle Pulse Dev Server running on http://localhost:${PORT}`);
console.log(`   GET  /wezterm/panes        — List all panes`);
console.log(`   POST /wezterm/split-profile — Open agents`);
console.log(`   GET  /wezterm/kill-pane    — Kill a pane`);
