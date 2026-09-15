// Simulates exactly what Twilio's media stream server does when it connects
// Including the same headers Twilio uses
const WebSocket = require('ws');
const https = require('https');

const TUNNEL_URL = process.argv[2] || 'wss://your-tunnel-url.loca.lt';
const WSS_URL = `${TUNNEL_URL}/media-stream`;

console.log(`Testing WebSocket connection to: ${WSS_URL}`);
console.log('Simulating Twilio media server headers...\n');

const ws = new WebSocket(WSS_URL, {
  headers: {
    'User-Agent': 'TwilioProxy/1.1',
    'X-Twilio-Signature': 'fake-sig',
    'X-Forwarded-For': '54.172.60.0', // Twilio US East
  },
  rejectUnauthorized: false
});

let opened = false;

ws.on('open', () => {
  opened = true;
  console.log('✅ WebSocket OPENED successfully!');
  
  // Send the Twilio "connected" event
  const connected = JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' });
  ws.send(connected);
  console.log('Sent: connected event');
  
  // Send start event
  setTimeout(() => {
    const start = JSON.stringify({
      event: 'start',
      sequenceNumber: '1',
      start: {
        streamSid: 'MZ_TEST123',
        callSid: 'CA_TEST123',
        accountSid: process.env.TWILIO_ACCOUNT_SID || 'AC_MOCK_ACCOUNT_SID',
        tracks: ['inbound'],
        customParameters: { leadId: 'test-lead-id' },
        mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 }
      },
      streamSid: 'MZ_TEST123'
    });
    ws.send(start);
    console.log('Sent: start event');
  }, 500);
  
  // Close after 5 seconds
  setTimeout(() => {
    console.log('\n5 seconds elapsed - closing');
    ws.close();
  }, 5000);
});

ws.on('message', (data) => {
  console.log('Received from server:', data.toString().substring(0, 200));
});

ws.on('error', (err) => {
  console.log('❌ WebSocket ERROR:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`WebSocket CLOSED: code=${code} reason="${reason.toString()}"`);
  if (opened) {
    console.log('\n✅ Connection worked! Twilio should be able to connect.');
  } else {
    console.log('\n❌ Connection FAILED before opening.');
  }
  process.exit(0);
});

ws.on('unexpected-response', (req, res) => {
  console.log(`❌ UNEXPECTED RESPONSE: HTTP ${res.statusCode}`);
  let body = '';
  res.on('data', d => body += d.toString());
  res.on('end', () => {
    console.log('Response body (first 500 chars):', body.substring(0, 500));
    console.log('\nThis means the tunnel is returning an HTTP page instead of upgrading the connection.');
  });
});

setTimeout(() => {
  console.log('TIMEOUT - no response after 10s');
  process.exit(1);
}, 10000);
