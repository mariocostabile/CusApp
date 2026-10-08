const { getDefaultConfig } = require('expo/metro-config');
const {
  fetchLiveGinnipalFromNode,
  bookSlotLiveGinnipal,
  cancelBookingLiveGinnipal,
} = require('./src/services/ginnipalNodeFetcher');

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
        const isLocal =
          !origin ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1') ||
          origin.includes('192.168.') ||
          origin.includes('10.');
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
        });

        req.on('end', () => {
          let body = {};
          try {
            if (bodyData) body = JSON.parse(bodyData);
          } catch {}

          const urlObj = new URL(req.url, 'http://localhost:8081');
          const email =
            body.email ||
            urlObj.searchParams.get('email') ||
            process.env.GINNIPAL_EMAIL ||
            '';
          const password =
            body.password ||
            urlObj.searchParams.get('password') ||
            process.env.GINNIPAL_PASSWORD ||
            '';

          // Clear require cache so changes to fetcher are immediately picked up by running Metro
          delete require.cache[require.resolve('./src/services/ginnipalNodeFetcher')];
          const {
            fetchLiveGinnipalFromNode,
            bookSlotLiveGinnipal,
            cancelBookingLiveGinnipal,
          } = require('./src/services/ginnipalNodeFetcher');

          if (req.url.startsWith('/api/ginnipal/book')) {
            const date = body.date || urlObj.searchParams.get('date') || '';
            const slot = body.slot || urlObj.searchParams.get('slot') || '';
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
            const resId = body.id || body.reservationId || urlObj.searchParams.get('id') || '';
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
