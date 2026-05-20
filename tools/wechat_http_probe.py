from __future__ import annotations

import argparse
import json
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


USER_DATA_ROOT = Path.home() / "AppData" / "Local" / "微信开发者工具" / "User Data"


def find_ide_port() -> int | None:
    if not USER_DATA_ROOT.exists():
        return None
    for profile in USER_DATA_ROOT.iterdir():
        cli_state = profile / "Default" / ".cli"
        if not cli_state.exists():
            continue
        value = cli_state.read_text(encoding="utf-8", errors="ignore").strip()
        if value.isdigit():
            return int(value)
    return None


def request_json(url: str, timeout: int = 10) -> tuple[int, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body


def port_listening(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe WeChat DevTools HTTP/CDP/automator state")
    parser.add_argument("--project", default=str(Path.cwd()))
    parser.add_argument("--wait", type=int, default=8)
    args = parser.parse_args()

    ide_port = find_ide_port()
    if ide_port is None:
      print(json.dumps({"success": False, "message": "No .cli port file found"}, ensure_ascii=False))
      return 1

    result: dict[str, object] = {
        "ide_port": ide_port,
        "project": args.project,
        "islogin": None,
        "open": None,
        "auto": None,
        "listen_9222": port_listening(9222),
        "listen_9420": port_listening(9420),
    }

    status, body = request_json(f"http://127.0.0.1:{ide_port}/v2/islogin")
    result["islogin"] = {"status": status, "body": body}

    project_qs = urllib.parse.quote(args.project.replace("\\", "/"))
    status, body = request_json(f"http://127.0.0.1:{ide_port}/v2/open?project={project_qs}")
    result["open"] = {"status": status, "body": body}

    status, body = request_json(f"http://127.0.0.1:{ide_port}/v2/auto?project={project_qs}")
    result["auto"] = {"status": status, "body": body}

    time.sleep(args.wait)
    result["listen_9222_after"] = port_listening(9222)
    result["listen_9420_after"] = port_listening(9420)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
