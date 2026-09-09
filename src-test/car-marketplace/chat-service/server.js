const http = require('node:http');

// ponytail: chains two other services by name (user-service, db-service) — shows a multi-hop
// call, not just a single proxy
const USERS = 'http://user-service:3000';
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

  try {
    if (req.method === 'GET' && url.pathname === '/messages') {
      return send(res, 200, await fetch(`${DB}/messages`).then((r) => r.json()));
    }

    if (req.method === 'POST' && url.pathname === '/messages') {
      const { from, to, text } = JSON.parse((await readBody(req)) || '{}');

      const [fromRes, toRes] = await Promise.all([
        fetch(`${USERS}/users/${from}`),
        fetch(`${USERS}/users/${to}`),
      ]);
      if (fromRes.status !== 200 || toRes.status !== 200) {
        return send(res, 400, { error: 'unknown sender or recipient' });
      }

      const upstream = await fetch(`${DB}/messages`, {
        method: 'POST',
        body: JSON.stringify({ from, to, text }),
      });
      return send(res, upstream.status, await upstream.json());
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 502, { error: `upstream unreachable: ${err}` });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`chat-service listening on ${port}`));
