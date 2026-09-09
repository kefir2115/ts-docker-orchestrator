const http = require('node:http');
const os = require('node:os');

const DB = 'http://db-service:3000';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const [resource, id] = url.pathname.split('/').filter(Boolean);
  if (resource !== 'users') return send(res, 404, { error: 'not found' });

  try {
    if (req.method === 'GET' && !id) {
      const users = await fetch(`${DB}/users`).then((r) => r.json());
      return send(res, 200, { servedBy: os.hostname(), users });
    }
    if (req.method === 'GET' && id) {
      const upstream = await fetch(`${DB}/users/${id}`);
      return send(res, upstream.status, { servedBy: os.hostname(), user: await upstream.json() });
    }
    if (req.method === 'POST' && !id) {
      const upstream = await fetch(`${DB}/users`, { method: 'POST', body: await readBody(req) });
      return send(res, upstream.status, { servedBy: os.hostname(), user: await upstream.json() });
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 502, { error: `db-service unreachable: ${err}` });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`user-service listening on ${port}`));
