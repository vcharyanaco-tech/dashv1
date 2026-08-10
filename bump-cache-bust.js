// bump-cache-bust.js
// Bumps the ?v= cache-bust stamp in docs/app.html so browsers and the
// GitHub raw CDN always fetch fresh assets after a deploy.
//
// Idempotent: stamps are minute-granular, so re-running within the same
// minute produces no diff (and no extra git commit).
//
// Usage: node bump-cache-bust.js
const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, 'docs', 'app.html');

function newStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
}

if (!fs.existsSync(TARGET)) {
  console.error('bump-cache-bust: ' + TARGET + ' not found');
  process.exit(1);
}

const html = fs.readFileSync(TARGET, 'utf8');
const stamp = newStamp(new Date());
const next = html.replace(/(\?v=)[A-Za-z0-9._-]+/g, '$1' + stamp);

if (next === html) {
  console.log('bump-cache-bust: stamp already current (' + stamp + ') - no change');
  process.exit(0);
}

fs.writeFileSync(TARGET, next);
console.log('bump-cache-bust: bumped ?v= -> ' + stamp + ' in docs/app.html');
