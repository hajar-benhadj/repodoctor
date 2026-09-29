"""Fixture module: shell injection, SSL bypass and a branchy function."""
import subprocess
import requests


def run(cmd, cwd=None):
    """Executes a shell command (fixture: shell=True)."""
    return subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True)


def fetch(url):
    """Fetches a URL (fixture: verify=False)."""
    return requests.get(url, verify=False, timeout=5)


def classify(items, mode, flags, threshold, strict):
    out = []
    for item in items:
        if item is None:
            continue
        if mode == "a":
            if item > threshold:
                out.append("high")
            elif item > threshold / 2:
                out.append("mid")
            else:
                out.append("low")
        elif mode == "b":
            if strict and item < 0:
                out.append("neg")
            elif flags and item in flags:
                out.append("flag")
            else:
                out.append("std")
        else:
            if item and threshold and strict:
                out.append("all")
            elif not item:
                out.append("empty")
            else:
                out.append("none")
    return out
