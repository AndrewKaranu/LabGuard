"""
labguard_tail.py — pipe stdin to LabGuard monitoring.

Usage:
    python train.py 2>&1 | python labguard_tail.py "my-run"
    python train.py 2>&1 | python labguard_tail.py          # uses "piped-run"

LabGuard will automatically create a new run entry when this script connects.
All stdin lines are forwarded to the LabGuard dashboard in real time.
"""

import sys
import socket
import json
import time

HOST = 'localhost'
PORT = 7821
RECONNECT_DELAY = 1.0


def connect(name: str) -> socket.socket | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect((HOST, PORT))
    except (ConnectionRefusedError, OSError):
        print(
            f"[labguard_tail] LabGuard not found on port {PORT}. "
            "Make sure LabGuard is open. Retrying…",
            file=sys.stderr, flush=True
        )
        s.close()
        return None

    # Send attach message
    _send(s, {'type': 'attach', 'name': name})

    # Wait for ack
    buf = ''
    s.settimeout(5.0)
    try:
        while True:
            chunk = s.recv(4096).decode()
            if not chunk:
                break
            buf += chunk
            while '\n' in buf:
                line, buf = buf.split('\n', 1)
                line = line.strip()
                if not line:
                    continue
                msg = json.loads(line)
                if msg.get('type') == 'attached':
                    s.settimeout(None)
                    print(
                        f"[labguard_tail] Connected — run ID: {msg['id'][:8]}…",
                        file=sys.stderr, flush=True
                    )
                    return s
    except (socket.timeout, OSError):
        pass

    s.close()
    return None


def _send(sock: socket.socket, msg: dict) -> None:
    try:
        sock.sendall((json.dumps(msg) + '\n').encode())
    except OSError:
        pass


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'piped-run'

    # Retry connecting if LabGuard isn't open yet
    sock = None
    for attempt in range(10):
        sock = connect(name)
        if sock:
            break
        time.sleep(RECONNECT_DELAY)

    if not sock:
        print(
            "[labguard_tail] Could not connect to LabGuard after 10 attempts. "
            "Passing stdin through unchanged.",
            file=sys.stderr, flush=True
        )
        # Fall through — still echo stdin so the pipeline isn't broken
        for line in sys.stdin:
            sys.stdout.write(line)
            sys.stdout.flush()
        return

    interrupted = False

    # Stream stdin → LabGuard + echo to stdout (so the pipeline keeps working)
    try:
        for raw_line in sys.stdin:
            line = raw_line.rstrip('\n')
            # Echo so output isn't swallowed if something else reads this pipe
            sys.stdout.write(raw_line)
            sys.stdout.flush()
            _send(sock, {'type': 'log', 'text': line, 'stream': 'stdout'})
    except (KeyboardInterrupt, BrokenPipeError):
        interrupted = True
    finally:
        # Non-zero for abrupt interrupts so LabGuard can alert on sudden stops.
        _send(sock, {'type': 'exit', 'code': 130 if interrupted else 0})
        sock.close()


if __name__ == '__main__':
    main()
