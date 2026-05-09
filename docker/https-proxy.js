// Tiny HTTPS reverse proxy that fronts the Next.js standalone server with TLS.
// It listens on HTTPS_PORT (default 3443) and forwards everything to 127.0.0.1:PORT
// where `node server.js` is already running over plain HTTP.
//
// This is launched by docker/entrypoint.sh whenever TLS_CERT_FILE and TLS_KEY_FILE
// are both set and readable. It supports normal HTTP requests, WebSocket upgrades,
// and preserves X-Forwarded-* headers so Next sees the correct scheme/host.

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "3443", 10);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = parseInt(process.env.PORT || "3000", 10);
const CERT_FILE = process.env.TLS_CERT_FILE;
const KEY_FILE = process.env.TLS_KEY_FILE;
const CA_FILE = process.env.TLS_CA_FILE; // optional intermediate chain

if (!CERT_FILE || !KEY_FILE) {
  console.error("[https-proxy] TLS_CERT_FILE and TLS_KEY_FILE must be set");
  process.exit(1);
}

const tlsOptions = {
  cert: fs.readFileSync(CERT_FILE),
  key: fs.readFileSync(KEY_FILE),
  ...(CA_FILE ? { ca: fs.readFileSync(CA_FILE) } : {}),
};

function buildForwardHeaders(req) {
  const headers = { ...req.headers };
  const xfFor = headers["x-forwarded-for"];
  const remote = req.socket.remoteAddress || "";
  headers["x-forwarded-for"] = xfFor ? `${xfFor}, ${remote}` : remote;
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = headers.host || "";
  headers["x-forwarded-port"] = String(HTTPS_PORT);
  return headers;
}

const server = https.createServer(tlsOptions, (req, res) => {
  const proxyReq = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers: buildForwardHeaders(req),
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    console.error("[https-proxy] upstream error:", err.message);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("Bad gateway");
  });
  req.pipe(proxyReq);
});

// WebSocket / HTTP upgrade tunneling.
server.on("upgrade", (req, clientSocket, head) => {
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST, () => {
    const headerLines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    const headers = buildForwardHeaders(req);
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) for (const item of v) headerLines.push(`${k}: ${item}`);
      else if (v != null) headerLines.push(`${k}: ${v}`);
    }
    upstream.write(headerLines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  const onErr = (err) => {
    console.error("[https-proxy] upgrade error:", err.message);
    try { clientSocket.destroy(); } catch {}
    try { upstream.destroy(); } catch {}
  };
  upstream.on("error", onErr);
  clientSocket.on("error", onErr);
});

server.listen(HTTPS_PORT, "0.0.0.0", () => {
  console.log(`[https-proxy] listening on https://0.0.0.0:${HTTPS_PORT} -> http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
});
