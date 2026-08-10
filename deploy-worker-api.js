// deploy-worker-api.js
// Deploys dashv1/worker.js to Cloudflare via REST API (no wrangler needed)
// Usage: node deploy-worker-api.js <API_TOKEN>
// Or:    set CLOUDFLARE_API_TOKEN=<token> && node deploy-worker-api.js

const fs = require('fs');
const path = require('path');
const https = require('https');

const ACCOUNT_ID = 'a01eb877733d755cb57e25827a9c52fe';
const WORKER_NAME = 'dashv1-proxy';
const TOKEN = process.argv[2] || process.env.CLOUDFLARE_API_TOKEN;

if (!TOKEN) { console.error('Usage: node deploy-worker-api.js <API_TOKEN>'); process.exit(1); }

const workerSrc = fs.readFileSync(path.join(__dirname, 'worker.js'), 'utf8');
const workerRoutesSrc = fs.readFileSync(path.join(__dirname, 'worker-enterprise-routes.js'), 'utf8');

// Inject env vars into worker source since we're not using wrangler bindings.
// The Apps Script deployment ID is read from docs/app.js (the live client) so
// the worker always proxies the same deployment the frontend calls.
const appJs = fs.readFileSync(path.join(__dirname, 'docs', 'app.js'), 'utf8');
const gasMatch = appJs.match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
if (!gasMatch) {
  console.error('Could not find the Apps Script deployment id in docs/app.js');
  process.exit(1);
}
const GAS_SCRIPT_URL = 'https://script.google.com/macros/s/' + gasMatch[1];

// Patch env references in worker: env.GAS_SCRIPT_URL -> literal string
let patchedSrc = workerSrc
  .replace(/env\.GAS_SCRIPT_URL/g, JSON.stringify(GAS_SCRIPT_URL));

const boundary = 'boundary' + Date.now();
const meta = JSON.stringify({
  main_module: 'worker.js',
  compatibility_date: '2026-08-04',
  bindings: [
    { name: 'AI_INSIGHTS_KV', type: 'kv_namespace', namespace_id: '3aed6a4c7ad842c7b5fba1558a68ab06' }
  ]
});

const body = [
  `--${boundary}`,
  'Content-Disposition: form-data; name="worker.js"; filename="worker.js"',
  'Content-Type: application/javascript+module',
  '',
  patchedSrc,
  `--${boundary}`,
  'Content-Disposition: form-data; name="worker-enterprise-routes.js"; filename="worker-enterprise-routes.js"',
  'Content-Type: application/javascript+module',
  '',
  workerRoutesSrc,
  `--${boundary}`,
  'Content-Disposition: form-data; name="metadata"',
  'Content-Type: application/json',
  '',
  meta,
  `--${boundary}--`
].join('\r\n');

const bodyBuf = Buffer.from(body, 'utf8');

const options = {
  hostname: 'api.cloudflare.com',
  path: `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`,
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': bodyBuf.length
  }
};

console.log(`Uploading worker "${WORKER_NAME}" to account ${ACCOUNT_ID}...`);

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.success) {
      console.log('Worker uploaded successfully.');
      addRoutes();
    } else {
      console.error('Upload failed:', JSON.stringify(result.errors, null, 2));
      process.exit(1);
    }
  });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(bodyBuf);
req.end();

function addRoutes() {
  // Get zone ID for dashboardharyana.site
  const zonesOpts = {
    hostname: 'api.cloudflare.com',
    path: '/client/v4/zones?name=dashboardharyana.site',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
  };
  https.get(zonesOpts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const result = JSON.parse(data);
      if (!result.success || !result.result.length) {
        console.log('Zone lookup failed or zone not on Cloudflare:', JSON.stringify(result.errors));
        console.log('Worker is live at: https://dashboard-redirect.vcharyanaco-gmail-com.workers.dev');
        return;
      }
      const zoneId = result.result[0].id;
      console.log('Zone ID:', zoneId);
      ensureRoute(zoneId, 'dashboardharyana.site/*');
      ensureRoute(zoneId, 'www.dashboardharyana.site/app*');
      purgeCache(zoneId);
    });
  });
}

// Best-effort zone-wide cache purge so docs changes go live immediately
// instead of waiting out the Cloudflare edge cache TTL. Deliberately never
// fails the deploy: if the API token lacks the "Zone > Cache Purge"
// permission (or the purge API errors), we warn and move on.
function purgeCache(zoneId) {
  const payload = JSON.stringify({ purge_everything: true });
  const opts = {
    hostname: 'api.cloudflare.com',
    path: `/client/v4/zones/${zoneId}/purge_cache`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  const req = https.request(opts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      let r;
      try { r = JSON.parse(data); } catch (e) { r = { errors: [{ message: data.slice(0, 200) }] }; }
      if (r.success) {
        console.log('Cache purged for zone ' + zoneId + ' (docs go live immediately).');
      } else {
        const msg = (r.errors && r.errors[0] && r.errors[0].message) || JSON.stringify(r.errors);
        console.log('WARN  Cache purge skipped: ' + msg);
        console.log('      Give the API token the "Zone > Cache Purge" permission to enable auto-purge.');
      }
    });
  });
  req.on('error', e => console.log('WARN  Cache purge failed: ' + e.message));
  req.write(payload);
  req.end();
}

function ensureRoute(zoneId, pattern) {
  const payload = JSON.stringify({ pattern, script: WORKER_NAME });
  const opts = {
    hostname: 'api.cloudflare.com',
    path: `/client/v4/zones/${zoneId}/workers/routes`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  const req = https.request(opts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const r = JSON.parse(data);
      if (r.success) {
        console.log(`Route added: ${pattern}`);
      } else {
        // Route may already exist
        const msg = (r.errors[0] || {}).message || '';
        if (msg.includes('already') || msg.includes('exists') || r.errors[0]?.code === 10020) {
          console.log(`Route already exists: ${pattern}`);
        } else {
          console.log(`Route note for ${pattern}:`, JSON.stringify(r.errors));
        }
      }
    });
  });
  req.on('error', e => console.error(e));
  req.write(payload);
  req.end();
}
