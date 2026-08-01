#!/usr/bin/env python3
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

REPO_DIR = "/workspaces/dashv1"
BRANCH = "main"
INTERVAL_SECONDS = 15


def run(cmd, check=True):
    result = subprocess.run(cmd, cwd=REPO_DIR, text=True, capture_output=True)
    if check and result.returncode != 0:
        raise RuntimeError(result.stdout + result.stderr)
    return result


while True:
    try:
        status = run(["git", "status", "--porcelain"]).stdout.strip()
        if status:
            run(["git", "add", "-A"])
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            msg = f"Auto-commit from session ({ts})"
            commit_result = run(["git", "commit", "-m", msg], check=False)
            if commit_result.returncode == 0:
                print(f"Committed: {msg}")
                push_result = run(["git", "push", "origin", BRANCH], check=False)
                if push_result.returncode == 0:
                    print("Pushed to origin/main")
                else:
                    print(push_result.stdout + push_result.stderr)
            else:
                if "nothing to commit" not in commit_result.stdout:
                    print(commit_result.stdout + commit_result.stderr)
        time.sleep(INTERVAL_SECONDS)
    except Exception as exc:
        print(f"Auto-commit loop error: {exc}")
        time.sleep(INTERVAL_SECONDS)
