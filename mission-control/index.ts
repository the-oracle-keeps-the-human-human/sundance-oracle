/**
 * Oracle Pulse - Main entry point
 * Serves the React frontend with Bun
 */

import index from './index.html';

Bun.serve({
  port: 3457,

  routes: {
    '/': index,
    '/api/health': {
      GET: () => Response.json({ status: 'ok' }),
    },
  },

  development: {
    hmr: true,
    console: true,
  },
});

console.log('🔮 Oracle Pulse Dashboard: http://localhost:3457');
console.log('📡 Dev Server: bun run server (port 3459)');
