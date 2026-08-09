#!/usr/bin/env node
/**
 * sync-frontend.js — marker-based frontend drift sync (build step)
 *
 * The two frontend clients (script.html for the GAS template, docs/app.js for
 * the static PWA) share a large core of logic that must never drift apart.
 * That core lives in ONE canonical file: src/frontend-logic.js.
 *
 * Both clients wrap the shared core with identical comment markers:
 *
 *   /* ===== SYNCED-FRONTEND:BEGIN ===== *​/
 *   ...shared logic...
 *   /* ===== SYNCED-FRONTEND:END ===== *​/
 *
 * Platform-specific code (e.g. the GAS-only reminder banner in script.html or
 * the PWA-only OfflineQueue/EnterpriseAddons blocks in docs/app.js) stays
 * OUTSIDE the markers and is never touched by this script.
 *
 * What this script does:
 *   1. Reads src/frontend-logic.js (the single source of truth).
 *   2. For each client, locates the BEGIN/END markers and replaces ONLY the
 *      region between them with the canonical content (EOL-normalised to the
 *      target file's style, preserving CRLF in script.html).
 *   3. Fails loudly (exit 1) if either marker is missing, duplicated, or the
 *      region is empty — so a botched marker edit can never silently corrupt
 *      a client.
 *
 * Usage:
 *   node sync-frontend.js            # sync (writes both clients if needed)
 *   node sync-frontend.js --check    # verify only; exit 1 on drift
 *
 * Wired into deploy-all.ps1 before `clasp push` so every deploy ships
 * identical shared logic to both the GAS template and the PWA.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const SOURCE = path.join(ROOT, 'src', 'frontend-logic.js');

const BEGIN = '/* ===== SYNCED-FRONTEND:BEGIN ===== */';
const END = '/* ===== SYNCED-FRONTEND:END ===== */';

const CLIENTS = [
  {
    name: 'script.html (GAS template)',
    file: path.join(ROOT, 'script.html'),
    // The inline <script> block is the only place the markers appear.
    // NOTE: the JS itself contains a literal `</script>` inside a string (task
    // ID HTML-escaping), so we must anchor on the LAST closing tag, not the
    // first one — a first-match regex would truncate the file mid-script.
    spliceIntoHtml: true,
    extractScript: (text) => {
      const start = text.indexOf('<script>');
      const end = text.lastIndexOf('</script>');
      if (start === -1 || end === -1 || end < start) {
        throw new Error('script.html: <script>...</script> block not found');
      }
      return text.slice(start + '<script>'.length, end);
    },
  },
  {
    name: 'docs/app.js (PWA)',
    file: path.join(ROOT, 'docs', 'app.js'),
    extractScript: (text) => text,
  },
];

function fail(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

function normalizeEol(text, eol) {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

/**
 * Reads the marked region from a client file.
 * @returns {{before: string, region: string, after: string}} The text before
 *   the BEGIN marker, the region itself (LF-normalised), and the text after
 *   the END marker (including the END marker line).
 */
function readMarkedRegion(text, name) {
  const bi = text.indexOf(BEGIN);
  const ei = text.indexOf(END);
  if (bi === -1) fail(name + ': SYNCED-FRONTEND:BEGIN marker missing. Re-run the initial marker setup or check the file.');
  if (ei === -1) fail(name + ': SYNCED-FRONTEND:END marker missing.');
  if (ei < bi) fail(name + ': END marker appears before BEGIN marker.');
  if (text.indexOf(BEGIN, bi + BEGIN.length) !== -1) fail(name + ': duplicate SYNCED-FRONTEND:BEGIN marker.');
  if (text.indexOf(END, ei + END.length) !== -1) fail(name + ': duplicate SYNCED-FRONTEND:END marker.');

  const regionRaw = text.slice(bi + BEGIN.length, ei);
  const region = regionRaw.replace(/\r\n/g, '\n');
  if (!region.trim()) fail(name + ': marked region is empty.');
  return {
    before: text.slice(0, bi + BEGIN.length), // includes the BEGIN marker
    region: region,
    after: text.slice(ei), // starts with the END marker
  };
}

function syncClient(client, canonical, checkOnly) {
  let raw = fs.readFileSync(client.file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const scriptText = client.extractScript(raw);

  // Operate on the script text, then splice back for script.html.
  const { before, region, after } = readMarkedRegion(scriptText, client.name);

  if (region === canonical) {
    console.log('✔ ' + client.name + ': already in sync');
    return false;
  }

  if (checkOnly) {
    console.error('✖ ' + client.name + ': SYNCED region drifted from src/frontend-logic.js');
    console.error('  Run `node sync-frontend.js` to reconcile.');
    return true; // drift
  }

  const updated = before + normalizeEol(canonical, eol) + after;
  if (client.spliceIntoHtml) {
    // Splice the updated script back into script.html (anchor on the LAST
    // closing tag for the same reason as extractScript above).
    const startTag = '<script>';
    const endTag = '</script>';
    const start = raw.indexOf(startTag);
    const end = raw.lastIndexOf(endTag);
    if (start === -1 || end === -1) fail(client.name + ': <script> block vanished during sync.');
    raw = raw.slice(0, start + startTag.length) + updated + raw.slice(end);
  } else {
    raw = updated;
  }
  fs.writeFileSync(client.file, raw);
  console.log('↻ ' + client.name + ': synced from src/frontend-logic.js');
  return false;
}

function main() {
  const checkOnly = process.argv.includes('--check');

  if (!fs.existsSync(SOURCE)) {
    fail('src/frontend-logic.js not found. Create it from the marked region of either client.');
  }
  const canonical = fs.readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
  if (!canonical.trim()) fail('src/frontend-logic.js is empty.');

  let drift = false;
  for (const client of CLIENTS) {
    drift = syncClient(client, canonical, checkOnly) || drift;
  }

  console.log(drift
    ? '\n✖ Frontend drift detected (check mode).'
    : (checkOnly ? '\n✔ All clients in sync.' : '\n✔ Frontend sync complete.'));

  process.exit(drift ? 1 : 0);
}

main();
