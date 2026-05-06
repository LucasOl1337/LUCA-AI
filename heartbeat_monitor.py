import json
import sys
import time
from datetime import datetime, timezone


def now_utc():
    return datetime.now(timezone.utc).isoformat()


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "heartbeat-report.json"
    started = now_utc()
    print(f"[heartbeat] started {started}", flush=True)
    while True:
        updated = now_utc()
        with open(out, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "service": "heartbeat-monitor",
                    "status": "online",
                    "startedAt": started,
                    "updatedAt": updated,
                    "intervalSeconds": 5,
                },
                f,
            )
        print(f"[heartbeat] ok {updated}", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    main()
