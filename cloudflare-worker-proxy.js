/**
 * Cloudflare Worker - WebSocket proxy for Twilio Media Streams
 * Deploy this to Cloudflare Workers (free tier) to get a stable WSS endpoint
 * that proxies to our local server via localtunnel.
 * 
 * Worker URL: wss://<worker-name>.<account>.workers.dev/media-stream
 * Proxies to: wss://<localtunnel-url>/media-stream
 */

// The target local server URL - update this when localtunnel URL changes
const TARGET_WS_URL = 'wss://your-tunnel-url.loca.lt/media-stream';

export default {
  async fetch(request, env) {
    const upgradeHeader = request.headers.get('Upgrade');
    
    if (upgradeHeader !== 'websocket') {
      // HTTP request - just return 200 for health checks
      return new Response('WebSocket proxy is running', { status: 200 });
    }

    // WebSocket upgrade - proxy to local server
    const [client, server] = Object.values(new WebSocketPair());
    
    // Connect to upstream (our local server via localtunnel)
    const upstream = new WebSocket(TARGET_WS_URL);
    
    server.accept();
    
    // Proxy messages client -> upstream
    server.addEventListener('message', (event) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(event.data);
      }
    });
    
    // Proxy messages upstream -> client  
    upstream.addEventListener('message', (event) => {
      if (server.readyState === WebSocket.OPEN) {
        server.send(event.data);
      }
    });
    
    upstream.addEventListener('close', (event) => {
      server.close(event.code, event.reason);
    });
    
    server.addEventListener('close', (event) => {
      upstream.close(event.code, event.reason);
    });
    
    upstream.addEventListener('error', (error) => {
      server.close(1011, 'Upstream error');
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};
