/**
 * All-in-one tunnel + server manager.
 * 
 * Starts localtunnel, captures the URL, writes it to tunnel-url.json,
 * and the Fastify server reads tunnel-url.json dynamically on each request
 * so the TwiML always has the current tunnel URL even after reconnects.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 3000;
const TUNNEL_URL_FILE = path.join(__dirname, 'tunnel-url.json');

function writeTunnelUrl(url) {
  fs.writeFileSync(TUNNEL_URL_FILE, JSON.stringify({ url, wss: url.replace('https://', 'wss://'), updatedAt: new Date().toISOString() }));
  console.log(`[tunnel] URL updated: ${url}`);
}

function startTunnel(onUrl) {
  console.log('[tunnel] Starting localtunnel...');
  
  const lt = spawn('npx', ['localtunnel', '--port', String(PORT)], {
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let gotUrl = false;
  
  lt.stdout.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[\w.-]+\.loca\.lt/);
    if (match && !gotUrl) {
      gotUrl = true;
      const url = match[0];
      writeTunnelUrl(url);
      if (onUrl) onUrl(url);
    }
  });

  lt.stderr.on('data', (data) => {
    const t = data.toString().trim();
    if (t && !t.includes('InsecureRequestWarning')) {
      console.log('[tunnel stderr]', t.substring(0, 100));
    }
  });

  lt.on('close', (code) => {
    console.log(`[tunnel] Died (code=${code}), restarting in 2s...`);
    gotUrl = false;
    setTimeout(() => startTunnel(), 2000);
  });
  
  return lt;
}

// Write an initial placeholder
writeTunnelUrl('http://localhost:3000');

// Start tunnel
startTunnel((url) => {
  console.log(`\n✅ Tunnel is up: ${url}`);
  console.log(`✅ WebSocket:    ${url.replace('https://', 'wss://')}`);
  console.log(`\nTwiML webhook:  POST ${url}/twilio/voice`);
  console.log(`Media stream:   WSS ${url.replace('https://', 'wss://')}/media-stream`);
  console.log('\nServer reads tunnel URL dynamically - no restart needed on tunnel change!\n');
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[tunnel] Shutting down...');
  process.exit(0);
});
