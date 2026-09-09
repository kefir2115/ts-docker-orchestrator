const http = require('node:http');

// ponytail: in-memory store shared by the other services — fine for a demo fixture, a real
// deployment would swap this for an actual database without touching its callers' code
const cars = new Map([
  ['1', { id: '1', make: 'Toyota', model: 'Corolla', year: 2019, price: 62000 }],
  ['2', { id: '2', make: 'BMW', model: '320i', year: 2021, price: 145000 }],
  ['3', { id: '3', make: 'Skoda', model: 'Octavia', year: 2020, price: 89000 }],
]);
const users = new Map([
  ['1', { id: '1', name: 'Alice' }],
  ['2', { id: '2', name: 'Bob' }],
]);
const messages = [];
let nextCarId = 4;
let nextUserId = 3;
let nextMessageId = 1;

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
  const store = { cars, users, messages: null }[resource];

  try {
    if (resource === 'messages') {
      if (req.method === 'GET') return send(res, 200, messages);
      if (req.method === 'POST') {
        const msg = { id: String(nextMessageId++), ...JSON.parse((await readBody(req)) || '{}') };
        messages.push(msg);
        return send(res, 201, msg);
      }
    }

    if (store) {
      if (req.method === 'GET' && !id) return send(res, 200, [...store.values()]);
      if (req.method === 'GET' && id) {
        const item = store.get(id);
        return item ? send(res, 200, item) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && !id) {
        const newId = String(resource === 'cars' ? nextCarId++ : nextUserId++);
        const item = { id: newId, ...JSON.parse((await readBody(req)) || '{}') };
        store.set(newId, item);
        return send(res, 201, item);
      }
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 400, { error: String(err) });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`db-service listening on ${port}`));
