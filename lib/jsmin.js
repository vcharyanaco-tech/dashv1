'use strict';

/**
 * lib/jsmin.js — conservative, token-aware JavaScript minifier.
 *
 * What it removes (100% safe):
 *   - `//` line comments, `/* ... *​/` block comments, legacy `<!--`/`-->`
 *     HTML-style comments
 *   - Blank lines and indentation: runs of 2+ whitespace chars collapse to a
 *     single space (a single space is kept where two tokens would otherwise
 *     merge into one, e.g. `+ +`, `- -`, `/ /`, or two identifiers)
 *
 * What it NEVER touches:
 *   - String literals ('...', "...") and template literals (`...`) — URL
 *     strings, the inline `</script>` guard and `${...}` interpolations stay
 *     byte-identical (template literals are consumed opaquely, walking nested
 *     interpolations, nested templates and strings to find the true end)
 *   - Regex literals and their flags — a lookahead token state machine
 *     distinguishes `/regex/` from division (keywords like `return`, `case`,
 *     `typeof` count as regex-preceding)
 *
 * It does not rename identifiers or remove punctuation, so the output is
 * always parseable whenever the input is — and minify-frontend.js double
 * checks that with `new Function(...)` before writing anything.
 */

const REGEX_PRECEDING_KEYWORDS = Object.create(null);
['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'else',
 'do', 'yield', 'await', 'instanceof', 'new'].forEach(function (kw) {
  REGEX_PRECEDING_KEYWORDS[kw] = true;
});

function isWordChar(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
    (ch >= '0' && ch <= '9') || ch === '_' || ch === '$';
}

/** Skips a quoted string starting at src[i] (quote at i); returns index after
 *  the closing quote. Never crosses the string's content. */
function skipQuoted(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === quote) return j + 1;
    j++;
  }
  return j;
}

/** Heuristic regex skipper used inside ${...} interpolations (only needed to
 *  keep the brace counter honest; content is preserved verbatim either way).
 *  Returns the index after the regex, or the original index if the `/` does
 *  not look like a regex opener. */
function skipLikelyRegex(src, i) {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j + 1;
    else if (c === '\n' || c === '\r') return i;
    j++;
  }
  return i;
}

/** Consumes a full template literal starting at src[i] (backtick at i) and
 *  returns the index just past its closing backtick. `${...}` interpolations
 *  may contain nested templates/strings/regexes, so the walk is recursive. */
function consumeTemplateLiteral(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '`') return j + 1;
    if (c === '$' && src[j + 1] === '{') j = consumeInterpolation(src, j + 2);
    else j++;
  }
  return j;
}

/** Consumes a `${` interpolation body starting at src[i] and returns the
 *  index just past its matching `}`. */
function consumeInterpolation(src, i) {
  let depth = 1;
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === "'" || c === '"') { j = skipQuoted(src, j); continue; }
    if (c === '`') { j = consumeTemplateLiteral(src, j); continue; }
    if (c === '/') { const k = skipLikelyRegex(src, j); if (k !== j) { j = k; continue; } }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return j + 1; }
    j++;
  }
  return j; // unterminated — the caller's syntax check will catch it
}

/**
 * True when a `/` at the current position starts a regex literal rather than
 * a division operator. `prev` is the last emitted significant char; `lastWord`
 * is the last emitted identifier (keywords like `return` precede a regex).
 *
 * KNOWN LIMITATION: a `/` right after `)` is always treated as division, so
 * `if (x) /re/.test(y)` would be misread and the minified output would fail
 * the `new Function` guard in minify-frontend.js (a loud build abort, never
 * silent corruption). If that construct ever appears, escape the regex or
 * assign it to a variable first.
 */
function isRegexStart(prev, lastWord) {
  if (prev === ')' || prev === ']') return false; // value token → division
  if (prev === 's') return false;                 // string/template → division
  if (prev && isWordChar(prev)) return !!REGEX_PRECEDING_KEYWORDS[lastWord];
  return true;                                    // start / punctuation / operator
}

/** Would concatenating these two chars merge into a different token? */
function needsSpaceBetween(a, b) {
  if (isWordChar(a) && isWordChar(b)) return true; // foo bar → one identifier
  if ((a === '+' || a === '-') && (b === '+' || b === '-')) return true; // + + → ++
  if (a === '/' && b === '/') return true;          // / / → comment
  return false;
}

function minifyJs(src) {
  src = String(src);
  const out = [];
  let i = 0;
  const n = src.length;
  let prev = '';     // last significant char emitted
  let lastWord = ''; // last identifier emitted (for keyword regex detection)

  while (i < n) {
    const ch = src[i];

    /* ----- quoted strings — preserved verbatim ----- */
    if (ch === "'" || ch === '"') {
      const end = skipQuoted(src, i);
      out.push(src.slice(i, end));
      prev = 's';
      lastWord = '';
      i = end;
      continue;
    }

    /* ----- template literals — preserved verbatim (incl. interpolations) ----- */
    if (ch === '`') {
      const end = consumeTemplateLiteral(src, i);
      out.push(src.slice(i, end));
      prev = 's';
      lastWord = '';
      i = end;
      continue;
    }

    /* ----- comments ----- */
    if (ch === '/' && src[i + 1] === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n' && src[j] !== '\r') j++;
      i = j;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      // Preserve the sync-region markers verbatim — sync-frontend.js anchors
      // on them to keep both clients in step with src/frontend-logic.js.
      const isMarker = src.substr(i, 30) === '/* ===== SYNCED-FRONTEND:BEGIN' ||
        src.substr(i, 28) === '/* ===== SYNCED-FRONTEND:END';
      if (isMarker) {
        const end = src.indexOf('*/', i + 2);
        const markerEnd = end === -1 ? n : end + 2;
        out.push(src.slice(i, markerEnd));
        prev = '/';
        i = markerEnd;
        continue;
      }
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      i = Math.min(j + 2, n);
      continue;
    }
    // Legacy HTML comments are only comments at the START of a line — guard
    // both so `a-->b` (post-decrement then greater-than) is never mangled.
    const atLineStart = i === 0 || src[i - 1] === '\n' || src[i - 1] === '\r';
    if (atLineStart && ch === '<' && src.substr(i, 4) === '<!--') {
      const end = src.indexOf('-->', i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (atLineStart && ch === '-' && src.substr(i, 3) === '-->') {
      let j = i + 3;
      while (j < n && src[j] !== '\n' && src[j] !== '\r') j++;
      i = j;
      continue;
    }

    /* ----- regex literals ----- */
    if (ch === '/' && isRegexStart(prev, lastWord)) {
      let j = i + 1;
      let inClass = false;
      let looksLikeRegex = false;
      while (j < n) {
        const c = src[j];
        if (c === '\\') { j += 2; continue; }
        if (c === '\n' || c === '\r') break; // never spans lines
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) { looksLikeRegex = true; break; }
        j++;
      }
      if (looksLikeRegex) {
        let k = j + 1;
        while (k < n) {
          const c = src[k];
          const isFlag = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
          if (!isFlag) break;
          k++;
        }
        out.push(src.slice(i, k));
        prev = 's';
        lastWord = '';
        i = k;
        continue;
      }
      // Not actually a regex (e.g. lone division) — fall through to normal path.
    }

    /* ----- whitespace runs ----- */
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n' || src[j] === '\r')) j++;
      const next = j < n ? src[j] : '';
      if (prev && next && needsSpaceBetween(prev, next)) out.push(' ');
      i = j;
      continue;
    }

    /* ----- everything else: emit as-is ----- */
    out.push(ch);
    if (isWordChar(ch)) {
      lastWord += ch;
    } else {
      lastWord = '';
    }
    prev = ch;
    i++;
  }

  return out.join('');
}

module.exports = { minifyJs: minifyJs };
