const ngrok = require('@ngrok/ngrok');
const fs = require('fs');
const path = require('path');

const AUTHTOKEN = '3IQXogO5QhXkCWjOWDXJcGBsf7q_4X5JEfg9LoBUN9kuE3cof';
const PORT = 3000;
const TUNNEL_FILE = path.join(__dirname, 'tunnel-url.json');
const ENV_FILE = path.join(__dirname, '.env');

function updateUrls(url) {
  const wssUrl = url.replace('https://', 'wss://').replace('http://', 'ws://');
  
  // Write tunnel-url.json
  fs.writeFileSync(TUNNEL_FILE, JSON.stringify({
    url: url,
    wss: wssUrl,
    updatedAt: new Date().toISOString()
  }));

  // Update .env
  let envContent = fs.readFileSync(ENV_FILE, 'utf8');
  envContent = envContent.replace(/^PUBLIC_BASE_URL=.*/m, `PUBLIC_BASE_URL=${url}`);
  envContent = envContent.replace(/^PUBLIC_WSS_URL=.*/m, `PUBLIC_WSS_URL=${wssUrl}`);
  fs.writeFileSync(ENV_FILE, envContent);

  console.log(`\n========================================`);
  console.log(`🚀 NGROK TUNNEL READY:`);
  console.log(`   HTTPS: ${url}`);
  console.log(`   WSS:   ${wssUrl}`);
  console.log(`========================================\n`);
}

async function start() {
  try {
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: AUTHTOKEN,
    });

    const url = listener.url();
    updateUrls(url);

    // Keep process alive
    process.stdin.resume();
  } catch (err) {
    console.error('Ngrok failed to start:', err);
    process.exit(1);
  }
}

start();
