import { createServer } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { Hono, type Context } from 'hono';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

type RouteHandler = (c: Context) => unknown | Promise<unknown>;

export type ServiceDef = {
  name: string;
  port?: number;
  // shorthand for routes: { '/': handler }
  handler?: RouteHandler;
  // whatever a handler returns is JSON-serialized, unless it's already a Response
  routes?: Record<string, RouteHandler>;
};

export async function startService(def: ServiceDef): Promise<{ port: number; server: ServerType }> {
  const routes = { ...(def.handler ? { '/': def.handler } : {}), ...def.routes };
  if (Object.keys(routes).length === 0) {
    throw new Error(`startService("${def.name}"): pass a "handler" or "routes"`);
  }

  const app = new Hono();
  for (const [path, handler] of Object.entries(routes)) {
    app.get(path, async (c) => {
      const result = await handler(c);
      return result instanceof Response ? result : c.json(result);
    });
  }

  const port = def.port ?? (await freePort());
  const server = serve({ fetch: app.fetch, port });
  console.log(`[${def.name}] listening on :${port} -> ${Object.keys(routes).join(', ')}`);
  return { port, server };
}
