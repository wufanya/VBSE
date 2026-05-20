from __future__ import annotations

import json
import sys
import urllib.request


def main() -> int:
    try:
        with urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception as exc:
        print(json.dumps({"success": False, "error": repr(exc)}, ensure_ascii=False, indent=2))
        return 1

    targets = []
    for item in data:
        targets.append(
            {
                "id": item.get("id"),
                "type": item.get("type"),
                "title": item.get("title"),
                "url": item.get("url"),
                "ws": item.get("webSocketDebuggerUrl"),
            }
        )

    print(json.dumps({"success": True, "targets": targets}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
