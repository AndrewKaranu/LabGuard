"""
LabGuard SDK — local agent bridge for ML training scripts.

Usage:
    from labguard_sdk import action, connect

    connect()  # connects to LabGuard on localhost:7821

    @action
    def reduce_lr(factor=0.5):
        \"\"\"Reduce learning rate by a factor\"\"\"
        for group in optimizer.param_groups:
            group['lr'] *= factor

    @action
    def save_checkpoint():
        \"\"\"Save current model state\"\"\"
        torch.save(model.state_dict(), 'checkpoint.pt')

    # ... rest of training script
"""

import socket
import json
import threading
import inspect
import sys
import time

_HOST = 'localhost'
_PORT = 7821
_actions: dict = {}
_sock: socket.socket | None = None
_connected = False
_lock = threading.Lock()


def connect(host: str = _HOST, port: int = _PORT, timeout: float = 5.0) -> bool:
    """Connect to LabGuard. Call once at the start of your script."""
    global _sock, _connected

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect((host, port))
        s.settimeout(None)
        _sock = s
        _connected = True

        # Start listener thread
        t = threading.Thread(target=_listen, daemon=True)
        t.start()

        print(f"[LabGuard] Connected on port {port}", flush=True)

        # Register any actions that were decorated before connect()
        for name, fn in _actions.items():
            _register(name, fn)

        return True

    except (ConnectionRefusedError, OSError) as e:
        print(f"[LabGuard] Could not connect ({e}). Running without LabGuard.", flush=True)
        return False


def action(fn):
    """Decorator to register a function as a safe callable action."""
    _actions[fn.__name__] = fn
    if _connected:
        _register(fn.__name__, fn)
    return fn


def _register(name: str, fn) -> None:
    sig = inspect.signature(fn)
    params = {}
    for k, v in sig.parameters.items():
        if v.default is inspect.Parameter.empty:
            params[k] = None
        else:
            params[k] = str(v.default)

    _send({
        'type': 'register',
        'name': name,
        'description': (fn.__doc__ or '').strip(),
        'params': params
    })


def _send(msg: dict) -> None:
    if not _sock:
        return
    try:
        with _lock:
            _sock.sendall((json.dumps(msg) + '\n').encode())
    except OSError:
        pass


def _listen() -> None:
    global _connected
    buf = ''
    while _sock:
        try:
            data = _sock.recv(4096)
            if not data:
                break
            buf += data.decode()
            while '\n' in buf:
                line, buf = buf.split('\n', 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    _handle(msg)
                except json.JSONDecodeError:
                    pass
        except OSError:
            break
    _connected = False
    print('[LabGuard] Disconnected.', flush=True)


def _handle(msg: dict) -> None:
    if msg.get('type') == 'call':
        name = msg.get('name')
        call_id = msg.get('call_id')
        args = msg.get('args', {})

        fn = _actions.get(name)
        if fn is None:
            _send({'type': 'result', 'call_id': call_id, 'name': name,
                   'success': False, 'output': f'Action "{name}" not found'})
            return

        try:
            result = fn(**args)
            _send({'type': 'result', 'call_id': call_id, 'name': name,
                   'success': True, 'output': str(result) if result is not None else ''})
            print(f'[LabGuard] Action executed: {name}({args})', flush=True)
        except Exception as e:
            _send({'type': 'result', 'call_id': call_id, 'name': name,
                   'success': False, 'output': str(e)})
            print(f'[LabGuard] Action failed: {name} — {e}', flush=True)

    elif msg.get('type') == 'connected':
        print(f"[LabGuard] Handshake OK (client {msg.get('clientId', '')[:8]}…)", flush=True)
