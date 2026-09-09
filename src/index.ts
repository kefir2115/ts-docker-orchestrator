import { launchFolder, getHostPort } from './orchestrator.js';
import { startService } from './microservice.js';

// build+run every subfolder with a Dockerfile under this root, torn down on SIGINT/SIGTERM
const root = process.argv[2] ?? process.cwd();
await launchFolder(root);

// declare a port (or omit it to auto-pick a free one) and a route per endpoint
await startService({
  name: 'status',
  port: 3000,
  routes: {
    '/status': () => ({ ok: true, uptime: process.uptime() }),
    '/ping': () => 'pong',
    '/listings': async () => {
      const hostPort = await getHostPort('listing-service');
      if (!hostPort) return new Response('listing-service is not running', { status: 502 });
      const upstream = await fetch(`http://localhost:${hostPort}/listings`);
      return new Response(await upstream.text(), { status: upstream.status });
    },
  },
});
