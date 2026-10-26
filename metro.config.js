const { getDefaultConfig } = require('expo/metro-config');
const {
  fetchLiveGinnipalFromNode,
  bookSlotLiveGinnipal,
  cancelBookingLiveGinnipal,
} = require('./src/services/ginnipalNodeFetcher');

// Credentials fit well under this; caps memory when Metro is exposed through a tunnel.
const MAX_BODY_BYTES = 10_000;

// Exact hostname match: a substring check let origins like localhost.evil.com through.
function isLocalOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^192\.168\.\d+\.\d+$/.test(hostname)
    );
  } catch {
    return false;
  }
}

const config = getDefaultConfig(__dirname);

const originalEnhanceMiddleware = config.server.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware, server) => {
    const parentMiddleware = originalEnhanceMiddleware
      ? originalEnhanceMiddleware(metroMiddleware, server)
      : metroMiddleware;

    return (req, res, next) => {
      // Proxy endpoints to GinniPAL
      if (req.url.startsWith('/api/ginnipal')) {
        const origin = req.headers['origin'] || '';
        const isLocal = !origin || isLocalOrigin(origin);
        res.setHeader('Access-Control-Allow-Origin', isLocal ? (origin || '*') : 'null');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        let bodyData = '';
        req.on('data', (chunk) => {
          bodyData += chunk;
          if (bodyData.length > MAX_BODY_BYTES) {
            res.writeHead(413);
            res.end();
            req.destroy();
          }
        });

        req.on('end', () => {
          let body = {};
          try {
            if (bodyData) body = JSON.parse(bodyData);
          } catch {}

          // Credentials only from the POST body: no .env fallback (anyone on the LAN/tunnel
          // would act as the dev) and no query string (ends up in logs).
          const email = body.email || '';
          const password = body.password || '';
          if (req.method !== 'POST' || !email || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Credenziali mancanti' }));
            return;
          }

          // Clear require cache so changes to fetcher are immediately picked up by running Metro
          delete require.cache[require.resolve('./src/services/ginnipalNodeFetcher')];
          const {
            fetchLiveGinnipalFromNode,
            bookSlotLiveGinnipal,
            cancelBookingLiveGinnipal,
          } = require('./src/services/ginnipalNodeFetcher');

          if (req.url.startsWith('/api/ginnipal/book')) {
            const date = body.date || '';
            const slot = body.slot || '';
            bookSlotLiveGinnipal(email, password, date, slot)
              .then((data) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
              })
              .catch((err) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              });
            return;
          }

          if (req.url.startsWith('/api/ginnipal/cancel')) {
            const resId = body.id || body.reservationId || '';
            cancelBookingLiveGinnipal(email, password, resId)
              .then((data) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
              })
              .catch((err) => {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
              });
            return;
          }

          fetchLiveGinnipalFromNode(email, password)
            .then((data) => {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            })
            .catch((err) => {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            });
        });
        return;
      }

      return parentMiddleware(req, res, next);
    };
  },
};

module.exports = config;
