#!/usr/bin/env node
/**
 * minify-frontend.js — build-time minification step.
 *
 * Runs AFTER `node sync-frontend.js` (deploy-all.ps1 wires the order) and
 * minifies, in place:
 *   - script.html  : the whole inline <script> block (GAS template client)
 *   - docs/app.js  : the whole PWA client
 *
 * Safety: every input is first parsed with `new Function(...)` and the
 * minified output must parse AND be idempotent (minify(minify(x)) ===
 * minify(x)); on any failure the script exits 1 WITHOUT writing anything,
 * so a botched minify can never be committed or pushed.
 *
 * The minifier itself (lib/jsmin.js) is deliberately conservative: it strips
 * comments and collapses whitespace but never alters strings, regex literals,
 * identifiers or punctuation.
 *
 * Usage:
 *   node minify-frontend.js          # apply (default)
 *   node minify-frontend.js --check  # verify current files are already
 *                                    # minified/idempotent; write nothing
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { minifyJs } = require(path.join(__dirname, 'lib', 'jsmin.js'));

const ROOT = __dirname;

function fail(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

/** Parses the code (syntax only — never executes). Throws on invalid JS. */
function assertParses(code, label) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(code);
  } catch (err) {
    throw new Error(label + ': syntax check failed: ' + err.message);
  }
}

function minifySafely(code, label) {
  assertParses(code, label + ' (input)');
  const once = minifyJs(code);
  const twice = minifyJs(once);
  if (twice !== once) {
    throw new Error(label + ': minifier is not idempotent on this input — aborting');
  }
  assertParses(once, label + ' (minified)');
  return once;
}

function extractInlineScript(raw) {
  const start = raw.indexOf('<script>');
  const end = raw.lastIndexOf('</script>');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('script.html: <script>...</script> block not found');
  }
  return {
    startTagEnd: start + '<script>'.length,
    endTagStart: end,
    script: raw.slice(start + '<script>'.length, end)
  };
}

function processScriptHtml() {
  const file = path.join(ROOT, 'script.html');
  const raw = fs.readFileSync(file, 'utf8');
  const { startTagEnd, endTagStart, script } = extractInlineScript(raw);

  const minified = minifySafely(script, 'script.html inline script');
  if (script === minified) {
    console.log('✔ script.html: already minified (' + script.length + ' chars)');
    return;
  }
  const out = raw.slice(0, startTagEnd) + minified + raw.slice(endTagStart);
  fs.writeFileSync(file, out);
  console.log('↻ script.html: ' + script.length + ' -> ' + minified.length + ' chars of JS (−' + (script.length - minified.length) + ')');
}

function processAppJs() {
  const file = path.join(ROOT, 'docs', 'app.js');
  const code = fs.readFileSync(file, 'utf8');

  const minified = minifySafely(code, 'docs/app.js');
  if (code === minified) {
    console.log('✔ docs/app.js: already minified (' + code.length + ' chars)');
    return;
  }
  fs.writeFileSync(file, minified);
  console.log('↻ docs/app.js: ' + code.length + ' -> ' + minified.length + ' chars (−' + (code.length - minified.length) + ')');
}

function main() {
  const checkOnly = process.argv.includes('--check');

  console.log('Minifying frontend clients…');
  if (checkOnly) {
    // Verify the current files are already in minified (idempotent) form.
    const scriptRaw = fs.readFileSync(path.join(ROOT, 'script.html'), 'utf8');
    const appJs = fs.readFileSync(path.join(ROOT, 'docs', 'app.js'), 'utf8');
    const script = extractInlineScript(scriptRaw).script;
    if (script === minifyJs(script) && appJs === minifyJs(appJs)) {
      console.log('✔ All clients already minified.');
      process.exit(0);
    }
    console.error('✖ One or more clients are not yet minified. Run `node minify-frontend.js`.');
    process.exit(1);
  }

  try {
    processScriptHtml();
    processAppJs();
    console.log('✔ Minification complete.');
  } catch (err) {
    fail(err.message + ' — nothing was written.');
  }
}

main();
