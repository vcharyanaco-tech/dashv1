#!/usr/bin/env python3
"""
export-session.py — one-command export of an opencode session to the PRIVATE
repo vcharyanaco-tech/dashv1-sessions (never the public dashv1 repo).

Usage:
  python export-session.py                  export the most recently updated session + push
  python export-session.py --session <id>   export a specific session (full or prefix id)
  python export-session.py --list           list recent sessions and exit
  python export-session.py --no-push        render the export locally, do not touch git
  python export-session.py --no-sanitize    keep API keys / tokens in the export (DEFAULT: sanitized)
  python export-session.py --out <dir>      override the working directory (default: ~/.local/share/dashv1-sessions)

What it does:
  1. Reads the opencode SQLite store (~/.local/share/opencode/opencode.db)
  2. Renders the session transcript as markdown (same style as opencode /export)
  3. Clones (or pulls) the PRIVATE repo, copies the export in, commits and pushes.

Safety:
  - Pushes ONLY to the private dashv1-sessions repo, never the public dashv1 repo.
  - **Secrets are redacted by default** (--sanitize on). Transcripts routinely
    contain live API keys (e.g. a configureAI call passes real keys as tool-call
    args), so only pass --no-sanitize when you deliberately want the raw
    transcript.
  - Requires the same git credentials used for normal pushes (Git Credential Manager).
"""

import argparse
import datetime
import json
import os
import re
import sqlite3
import subprocess
import sys

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

HOME = os.path.expanduser('~')
OPENCODE_DB = os.path.join(HOME, '.local', 'share', 'opencode', 'opencode.db')
PRIVATE_REPO_URL = 'https://github.com/vcharyanaco-tech/dashv1-sessions.git'
DEFAULT_OUT = os.path.join(HOME, '.local', 'share', 'dashv1-sessions')
GIT_USER = 'vcharyanaco-tech'
GIT_EMAIL = 'vcharyanaco@gmail.com'

# Common secret patterns redacted by --sanitize.
SECRET_PATTERNS = [
    re.compile(r'gsk_[A-Za-z0-9_\-]{16,}'),
    re.compile(r'sk-[A-Za-z0-9_\-]{16,}'),
    re.compile(r'AIza[0-9A-Za-z_\-]{20,}'),
    re.compile(r'ghp_[A-Za-z0-9]{20,}'),
    re.compile(r'gho_[A-Za-z0-9]{20,}'),
    re.compile(r'Bearer\s+[A-Za-z0-9._\-]{16,}', re.I),
    re.compile(r'AKfycb[0-9A-Za-z_\-]{20,}'),
]

ROLE_LABELS = {'user': 'User', 'assistant': 'Assistant', 'system': 'System', 'tool': 'Tool'}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def db_connect():
    if not os.path.exists(OPENCODE_DB):
        sys.exit('opencode DB not found at %s — is opencode installed/used on this machine?' % OPENCODE_DB)
    return sqlite3.connect('file:' + OPENCODE_DB + '?mode=ro', uri=True)


def fmt_ms(ms):
    if not ms:
        return ''
    return datetime.datetime.fromtimestamp(ms / 1000).strftime('%m/%d/%Y, %I:%M:%S %p')


def model_label(model):
    """'opencode/deepseek-v4-flash-free' style label from a message model object."""
    if isinstance(model, dict):
        provider = model.get('providerID') or ''
        model_id = model.get('modelID') or ''
        if provider and model_id:
            return '%s/%s' % (provider, model_id)
        return model_id or provider
    return str(model or '')


def render_message_body(cur, message_id):
    """Renders the parts of one message as markdown text."""
    rows = cur.execute(
        'SELECT data FROM part WHERE message_id=? ORDER BY time_created ASC',
        (message_id,)
    ).fetchall()
    out = []
    for (data,) in rows:
        try:
            p = json.loads(data)
        except Exception:
            continue
        ptype = p.get('type')
        if ptype == 'text':
            if p.get('text'):
                out.append(p['text'].rstrip())
        elif ptype == 'reasoning':
            if p.get('text'):
                out.append('_Thinking:_\n\n' + p['text'].rstrip())
        elif ptype == 'tool':
            tool = p.get('tool') or 'unknown'
            state = p.get('state') or {}
            block = ['**Tool: %s**' % tool]
            if 'input' in state and state['input'] is not None:
                try:
                    inp = json.dumps(state['input'], indent=2, ensure_ascii=False)
                except Exception:
                    inp = str(state['input'])
                block.append('\n**Input:**\n```json\n%s\n```' % inp)
            if state.get('output') not in (None, ''):
                block.append('\n**Output:**\n```\n%s\n```' % str(state['output']).rstrip())
            out.append('\n'.join(block))
        # step-start / step-finish / compaction / file / snapshot: skipped
    return '\n\n'.join(out)


def render_session(cur, sid, title, created, updated, model, agent, messages, sanitize):
    lines = ['# %s' % (title or 'Session')]
    lines.append('')
    lines.append('**Session ID:** %s' % sid)
    if created:
        lines.append('**Created:** %s' % fmt_ms(created))
    if updated:
        lines.append('**Updated:** %s' % fmt_ms(updated))
    lines.append('')
    lines.append('---')
    lines.append('')
    for msg in messages:
        mid, role, mdata, mtc = msg
        label = ROLE_LABELS.get(role, role or 'Message').capitalize()
        if role == 'assistant':
            meta = []
            if agent:
                meta.append(str(agent))
            ml = model_label(mdata.get('model'))
            if ml:
                meta.append(ml)
            suffix = ' (%s)' % ' · '.join(meta) if meta else ''
            lines.append('## Assistant%s' % suffix)
        else:
            lines.append('## %s' % label)
        lines.append('')
        body = render_message_body(cur, mid)
        if body:
            lines.append(body)
        lines.append('')
        lines.append('---')
        lines.append('')
    text = '\n'.join(lines)
    if sanitize:
        for pat in SECRET_PATTERNS:
            text = pat.sub('[REDACTED]', text)
    return text


def find_session(cur, sid_arg):
    if sid_arg:
        # exact match first, then prefix match
        row = cur.execute('SELECT id, title, time_created, time_updated, model, agent FROM session WHERE id=?', (sid_arg,)).fetchone()
        if not row:
            row = cur.execute(
                'SELECT id, title, time_created, time_updated, model, agent FROM session WHERE id LIKE ? ORDER BY time_updated DESC LIMIT 1',
                (sid_arg + '%',)
            ).fetchone()
        if not row:
            sys.exit('Session not found: %s' % sid_arg)
    else:
        row = cur.execute(
            'SELECT id, title, time_created, time_updated, model, agent FROM session ORDER BY time_updated DESC LIMIT 1'
        ).fetchone()
        if not row:
            sys.exit('No sessions found in the opencode store.')
    print('Selected session: %s  (%s)' % (row[0], (row[1] or '')[:55]))
    return row


def list_sessions(cur, limit=12):
    rows = cur.execute(
        'SELECT id, title, time_updated FROM session ORDER BY time_updated DESC LIMIT ?',
        (limit,)
    ).fetchall()
    print('Recent sessions (newest first):\n')
    for sid, title, tu in rows:
        print('  %s  %s  %s' % (fmt_ms(tu), sid, (title or '')[:55]))


def run_git(args, cwd=None, check=True):
    proc = subprocess.run(['git'] + args, cwd=cwd, capture_output=True, text=True)
    if check and proc.returncode != 0:
        sys.exit('git %s failed:\n%s\n%s' % (' '.join(args), proc.stdout.strip(), proc.stderr.strip()))
    return proc


def ensure_workdir(out):
    if os.path.isdir(os.path.join(out, '.git')):
        run_git(['-C', out, 'pull', '--rebase', 'origin', 'main'])
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    run_git(['clone', PRIVATE_REPO_URL, out])
    return out


def push_export(out, sid, title):
    run_git(['-C', out, 'config', 'user.name', GIT_USER])
    run_git(['-C', out, 'config', 'user.email', GIT_EMAIL])
    status = run_git(['-C', out, 'status', '--porcelain'])
    if not status.stdout.strip():
        print('No changes to push (export already up to date).')
        return False
    msg = 'session export %s: %s' % (sid, (title or '')[:60])
    run_git(['-C', out, 'add', '-A'])
    run_git(['-C', out, 'commit', '-m', msg])
    run_git(['-C', out, 'push', 'origin', 'main'])
    print('Pushed to %s' % PRIVATE_REPO_URL)
    return True


def main():
    ap = argparse.ArgumentParser(description='Export an opencode session to the private dashv1-sessions repo.')
    ap.add_argument('--session', help='session id (full or prefix); default: most recently updated')
    ap.add_argument('--list', action='store_true', help='list recent sessions and exit')
    ap.add_argument('--no-push', action='store_true', help='render the export but do not touch git')
    ap.add_argument('--no-sanitize', dest='sanitize', action='store_false', help='KEEP API keys/tokens in the export (default is to redact them)')
    ap.add_argument('--out', default=DEFAULT_OUT, help='working directory (default: %s)' % DEFAULT_OUT)
    args = ap.parse_args()

    con = db_connect()
    cur = con.cursor()
    if args.list:
        try:
            list_sessions(cur)
        finally:
            con.close()
        return

    sid, title, created, updated, model, agent = find_session(cur, args.session)

    # Load all messages (only user/assistant roles are rendered)
    rows = cur.execute(
        'SELECT id, data, time_created FROM message WHERE session_id=? ORDER BY time_created ASC',
        (sid,)
    ).fetchall()
    messages = []
    for mid, data, mtc in rows:
        try:
            md = json.loads(data)
        except Exception:
            continue
        role = md.get('role')
        if role not in ('user', 'assistant', 'system'):
            continue
        messages.append((mid, role, md, mtc))

    if not messages:
        sys.exit('Session %s has no renderable messages.' % sid)

    markdown = render_session(cur, sid, title, created, updated, model, agent, messages, args.sanitize)

    if not args.sanitize:
        print('WARNING: exporting UNSANITIZED transcript — it may contain live API keys/tokens.')

    filename = 'session-%s.md' % sid
    if args.no_push:
        target = os.path.join(args.out, filename)
        os.makedirs(args.out, exist_ok=True)
        with open(target, 'w', encoding='utf-8') as f:
            f.write(markdown)
        print('Exported (no push): %s  (%d messages, %d bytes)' % (target, len(messages), len(markdown)))
        print('Preview:\n' + markdown[:400])
        con.close()
        return

    out = ensure_workdir(args.out)
    target = os.path.join(out, filename)
    with open(target, 'w', encoding='utf-8') as f:
        f.write(markdown)
    print('Exported %s (%d messages, %d bytes)' % (target, len(messages), len(markdown)))
    push_export(out, sid, title)
    con.close()


if __name__ == '__main__':
    main()
