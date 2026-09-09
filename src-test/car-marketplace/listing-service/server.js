const http = require('node:http');
const os = require('node:os');

// ponytail: talks to db-service purely by container name over the orchestrator network —
// no service discovery library, that's what Docker's embedded DNS is for
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
    if (req.method === 'GET' && url.pathname === '/listings') {
      const maxPrice = url.searchParams.get('maxPrice');
      const cars = await fetch(`${DB}/cars`).then((r) => r.json());
      const listings = maxPrice ? cars.filter((c) => c.price <= Number(maxPrice)) : cars;
      // hostname = this container's id: hit /listings a few times through the "listing-service"
      // alias and watch it change as Docker round-robins across the replicas
      return send(res, 200, { servedBy: os.hostname(), listings });
    }

    if (req.method === 'POST' && url.pathname === '/listings') {
      const upstream = await fetch(`${DB}/cars`, { method: 'POST', body: await readBody(req) });
      return send(res, upstream.status, { servedBy: os.hostname(), car: await upstream.json() });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 502, { error: `db-service unreachable: ${err}` });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`listing-service listening on ${port}`));
