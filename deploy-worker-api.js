// deploy-worker-api.js
// Deploys dashv1/worker.js to Cloudflare via REST API (no wrangler needed)
// Usage: node deploy-worker-api.js <API_TOKEN>
// Or:    set CLOUDFLARE_API_TOKEN=<token> && node deploy-worker-api.js
//
// Exit codes:
//   0 = deployed + routes OK + cache purged + post-deploy smoke check passed
//   2 = deployed, but cache purge failed (usually the token lacks the
//       "Zone > Cache Purge" permission — see the printed fix)
//   3 = deployed, but the post-deploy smoke check failed (the live site is
//       not yet serving the new worker — stale edge response or broken proxy)
//   1 = hard failure (no token / upload failed / zone lookup failed)

const fs = require('fs');
const path = require('path');
const https = require('https');

const ACCOUNT_ID = 'a01eb877733d755cb57e25827a9c52fe';
const WORKER_NAME = 'dashv1-proxy';
const TOKEN = process.argv[2] || process.env.CLOUDFLARE_API_TOKEN;

if (!TOKEN) { console.error('Usage: node deploy-worker-api.js <API_TOKEN>'); process.exit(1); }

// Non-fatal-but-visible problems accumulate here instead of crashing the
// deploy; the final exit code reflects the worst outcome.
let exitCode = 0;

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
const GAS_EXEC_PATH = '/macros/s/' + gasMatch[1] + '/exec';

// Patch env references in worker: env.GAS_SCRIPT_URL -> literal string
let patchedSrc = workerSrc
  .replace(/env\.GAS_SCRIPT_URL/g, JSON.stringify(GAS_SCRIPT_URL));

// ---------------------------------------------------------------------------
// Pre-flight: verify the token is active BEFORE uploading, so a stale/revoked
// token fails fast with a clear message instead of a confusing upload error.
// ---------------------------------------------------------------------------
function verifyToken() {
  const opts = {
    hostname: 'api.cloudflare.com',
    path: '/client/v4/user/tokens/verify',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  };
  https.get(opts, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      let r;
      try { r = JSON.parse(data); } catch (e) { r = { success: false }; }
      if (r.success && r.result && r.result.status === 'active') {
        console.log('Token verified (active).');
        uploadWorker();
      } else {
        const msg = (r.errors && r.errors[0] && r.errors[0].message) || 'token verify failed';
        console.error('Token verification failed: ' + msg);
        console.error('Check CLOUDFLARE_API_TOKEN at https://dash.cloudflare.com/profile/api-tokens');
        process.exit(1);
      }
    });
  }).on('error', (e) => {
    console.error('Token verify request failed: ' + e.message);
    process.exit(1);
  });
}

function uploadWorker() {
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
}

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
        console.error('Zone lookup failed or zone not on Cloudflare:', JSON.stringify(result.errors));
        console.error('Worker is live at: https://dashboard-redirect.vcharyanaco-gmail-com.workers.dev');
        process.exit(1);
      }
      const zoneId = result.result[0].id;
      console.log('Zone ID:', zoneId);
      ensureRoute(zoneId, 'dashboardharyana.site/*', () => {
        ensureRoute(zoneId, 'www.dashboardharyana.site/app*', () => {
          purgeCache(zoneId);
        });
      });
    });
  });
}

// Purge the edge cache so the freshly uploaded worker + docs are live
// immediately. Tries zone-wide purge first; if the token cannot do that,
// falls back to a targeted URL purge (some restricted tokens allow URL
// purge but not purge_everything). A permission failure sets exit code 2 so
// the deploy pipeline reports it loudly instead of silently shipping stale
// content.
function purgeCache(zoneId, attempt) {
  const isFallback = attempt === 2;
  const payload = JSON.stringify(isFallback
    ? { files: [
        'https://dashboardharyana.site/app.html',
        'https://dashboardharyana.site/index.html',
        'https://dashboardharyana.site/manifest.json',
        'https://dashboardharyana.site/sw.js',
        'https://dashboardharyana.site/offline-queue.js',
        'https://www.dashboardharyana.site/app.html',
      ] }
    : { purge_everything: true });

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
        console.log('Cache purged for zone ' + zoneId + (isFallback ? ' (targeted URLs)' : '') + ' — new worker + docs live immediately.');
        smokeCheck();
      } else if (!isFallback && attempt !== 2) {
        // Zone-wide purge failed — retry once with targeted URLs before giving up.
        console.log('WARN  Zone-wide purge failed (' + ((r.errors && r.errors[0] && r.errors[0].message) || 'unknown') + ') — retrying with targeted URLs...');
        purgeCache(zoneId, 2);
      } else {
        const msg = (r.errors && r.errors[0] && r.errors[0].message) || JSON.stringify(r.errors);
        console.log('WARN  Cache purge skipped: ' + msg);
        console.log('');
        console.log('      ┌──────────────────────────────────────────────────────────────────┐');
        console.log('      │  FIX: the Cloudflare API token lacks "Zone > Cache Purge".      │');
        console.log('      │  1. Go to https://dash.cloudflare.com/profile/api-tokens        │');
        console.log('      │  2. Edit the token used by CLOUDFLARE_API_TOKEN                 │');
        console.log('      │  3. Add permission: Zone | Cache Purge | Purge (dashboardharyana)');
        console.log('      │  4. Save — the same token value works, no env-var change needed.│');
        console.log('      │  Until fixed, stale edge responses may linger after deploys.    │');
        console.log('      └──────────────────────────────────────────────────────────────────┘');
        console.log('');
        exitCode = 2;
        smokeCheck();
      }
    });
    // Guard the response stream too — an unhandled 'error' event here would
    // crash the whole deploy script after the worker was already uploaded.
    res.on('error', e => console.log('WARN  Cache purge response error: ' + e.message));
  });
  req.on('error', e => {
    console.log('WARN  Cache purge failed: ' + e.message);
    exitCode = 2;
    smokeCheck();
  });
  req.write(payload);
  req.end();
}

// Post-deploy smoke check: verify the live site is actually serving the NEW
// worker (not a stale edge-cached response from the previous version) and that
// the GAS proxy answers. Cache-busting query strings force a miss so the check
// cannot be fooled by the very staleness we're guarding against.
//
// Edge propagation: after a Workers upload, the edge can take a few seconds to
// serve the new version everywhere. We retry the whole check up to 3 times
// with a short pause so a transient propagation window does not produce a
// false failure.
const SMOKE_MAX_ATTEMPTS = 3;
const SMOKE_RETRY_MS = 8000;
let smokeAttempt = 0;

function smokeCheck() {
  smokeAttempt++;
  const host = 'dashboardharyana.site';
  const cb = Date.now();
  let checks = 0;
  let failures = 0;

  function finish() {
    if (failures > 0) {
      if (smokeAttempt < SMOKE_MAX_ATTEMPTS) {
        console.log('Smoke check attempt ' + smokeAttempt + ' failed (' + failures + ' check(s)) — retrying in ' + (SMOKE_RETRY_MS / 1000) + 's (edge propagation)...');
        setTimeout(smokeCheck, SMOKE_RETRY_MS);
        return;
      }
      console.error('SMOKE CHECK FAILED after ' + SMOKE_MAX_ATTEMPTS + ' attempts: live site is not serving the new worker. Investigate before relying on this deploy.');
      if (exitCode === 0) exitCode = 3;
      process.exit(exitCode);
    }
    console.log('Smoke check passed: live worker is serving the fresh deploy.');
    process.exit(exitCode);
  }

  // Per-check completion guard: each check must count exactly once, even when
  // multiple handlers fire for one request (e.g. a timeout destroys the socket,
  // which also emits 'error'). Without this, finish() can run before the other
  // check has reported, producing a premature PASS/FAIL.
  function makeCheck() {
    let done = false;
    return function (failMsg) {
      if (done) return;
      done = true;
      if (failMsg) {
        failures++;
        console.log('  ✗ ' + failMsg);
      }
      checks++;
      if (checks === 2) finish();
    };
  }

  const apiCheck = makeCheck();
  const htmlCheck = makeCheck();

  // Check 1: the GAS API proxy through the worker must return valid JSON
  // (a stale cached error or old worker would return non-JSON / 500). The
  // no-store header check is what proves the NEW worker is live, since that
  // header only exists in this version.
  const apiPath = GAS_EXEC_PATH + '?cb=' + cb;
  const apiBody = JSON.stringify({ function: 'getServerTime' });
  const apiReq = https.request({
    hostname: host,
    path: apiPath,
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(apiBody) },
    timeout: 30000,
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const cc = (res.headers['cache-control'] || '');
      let jsonOk = false;
      try { jsonOk = JSON.parse(data).result !== undefined; } catch (e) {}
      if (res.statusCode === 200 && jsonOk && /no-store/.test(cc)) {
        console.log('  ✓ GAS proxy live (getServerTime OK, Cache-Control: no-store)');
        apiCheck();
      } else {
        apiCheck('GAS proxy check: status=' + res.statusCode + ' cache-control="' + cc + '" body=' + data.slice(0, 120));
      }
    });
  });
  apiReq.on('timeout', () => { apiReq.destroy(); apiCheck('GAS proxy check: timed out (30s)'); });
  apiReq.on('error', () => { apiCheck('GAS proxy check: request error'); });
  apiReq.write(apiBody);
  apiReq.end();

  // Check 2: app.html must be served as the dashboard shell (not a stale
  // "Worker not configured" 500 or a broken page).
  const htmlReq = https.get({
    hostname: host,
    path: '/app.html?cb=' + cb,
    timeout: 20000,
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      if (res.statusCode === 200 && data.includes('India Post Dashboard')) {
        console.log('  ✓ app.html served (dashboard shell)');
        htmlCheck();
      } else {
        htmlCheck('app.html check: status=' + res.statusCode + ' body=' + data.slice(0, 120));
      }
    });
  });
  htmlReq.on('timeout', () => { htmlReq.destroy(); htmlCheck('app.html check: timed out'); });
  htmlReq.on('error', () => { htmlCheck('app.html check: request error'); });
}

function ensureRoute(zoneId, pattern, done) {
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
      let r;
      try { r = JSON.parse(data); } catch (e) { r = { success: false, errors: [{ message: data.slice(0, 120) }] }; }
      if (r.success) {
        console.log(`Route added: ${pattern}`);
      } else {
        // Route may already exist
        const msg = (r.errors && r.errors[0] && r.errors[0].message) || '';
        if (msg.includes('already') || msg.includes('exists') || (r.errors && r.errors[0] && r.errors[0].code === 10020)) {
          console.log(`Route already exists: ${pattern}`);
        } else {
          console.log(`Route note for ${pattern}:`, JSON.stringify(r.errors));
        }
      }
      if (done) done();
    });
  });
  req.on('error', e => { console.error(e); if (done) done(); });
  req.write(payload);
  req.end();
}

verifyToken();
