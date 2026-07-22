# LabGuard

AI-powered desktop app for monitoring ML experiments and lab runs in real time. LabGuard streams terminal output, parses metrics, watches for anomalies with local or cloud LLMs, and can trigger safe, user-approved actions in your training script.

## Features

- **Live experiment monitoring** — Launch a command or attach an existing process and watch stdout/stderr in a terminal view
- **Automatic metrics** — Parses common training log formats (key/value lines, Hugging Face–style JSON) and charts them with Recharts
- **LLM watchdog** — Periodically analyzes recent logs and metrics with Ollama, NVIDIA NIM, or Claude; suggests actions only after you approve them
- **Safe runtime actions** — Python scripts register callable actions via `labguard_sdk.py` over a local TCP bridge (`localhost:7821`)
- **Per-run chat** — Ask questions about a run with context from logs, metrics, and watchdog events
- **Video / multi-source runs** — Monitor webcam, screen capture, MP4, or linked terminal output with cloud-model analysis
- **Email alerts** — Optional SMTP notifications for training failures, watchdog suggestions, and video alerts
- **Model management** — Install/start Ollama, pull local models, and configure NIM or Claude API keys in Settings

## Tech stack

| Layer | Stack |
| --- | --- |
| Desktop shell | Electron + electron-vite |
| UI | React 19, TypeScript, Tailwind CSS 4, Zustand |
| Charts | Recharts |
| Local LLM | Ollama (`localhost:11434`) |
| Cloud LLMs | NVIDIA NIM, Anthropic Claude |
| Python bridge | `labguard_sdk.py`, `labguard_tail.py` (stdlib only) |

## Project structure

```
labguard/
├── electron/               # Main process + IPC handlers
│   ├── index.ts            # Window setup, handler registration
│   ├── preload.ts          # contextBridge → window.api
│   └── ipc/                # ollama, process, registry, nim, claude, notify, screen
├── src/                    # React renderer
│   ├── App.tsx
│   ├── store/              # Zustand persisted state
│   ├── components/         # Terminal, Metrics, Watchdog, Chat, Video, Models, …
│   ├── hooks/              # useWatchdog
│   └── lib/                # metricsParser, runContext, tools
├── labguard_sdk.py         # @action decorator + connect() for training scripts
├── labguard_tail.py        # Pipe existing process logs into LabGuard
└── demo_*.py               # Synthetic demos for training / watchdog / titration
```

## Getting started

### Prerequisites

- Node.js 18+ (recommended: current LTS)
- npm
- Python 3.10+ (for demos and the SDK; no third-party packages required)
- [Ollama](https://ollama.com/) for local models (the app can help install/start it on first launch)

### Install and run

```bash
npm install
npm run dev
```

Other scripts:

| Script | Description |
| --- | --- |
| `npm run build` | Production build via electron-vite |
| `npm run preview` | Preview the built app |
| `npm run package` | Package with electron-builder → `dist/` |

### First launch

1. Complete Ollama setup if prompted (or skip if you only plan to use cloud models for video later — terminal watchdog still prefers a configured model).
2. Optionally add NVIDIA NIM and/or Claude API keys under **Models / Settings**.
3. Optionally configure SMTP for email alerts.
4. Click **New Run** and launch a command, e.g.:

```bash
python demo_train.py
```

## Python SDK

Connect a training script so LabGuard can list and call safe actions:

```python
from labguard_sdk import action, connect

connect()  # localhost:7821

@action
def reduce_lr(factor=0.5):
    """Reduce learning rate by a factor"""
    for group in optimizer.param_groups:
        group["lr"] *= factor

@action
def save_checkpoint():
    """Save current model state"""
    torch.save(model.state_dict(), "checkpoint.pt")
```

Copy `labguard_sdk.py` next to your script (or put it on `PYTHONPATH`). If LabGuard is not running, `connect()` fails soft and training continues normally.

### Attach an existing process

Pipe logs through `labguard_tail.py`:

```bash
python train.py 2>&1 | python labguard_tail.py "my-run"
```

## Demo scripts

| Script | Purpose |
| --- | --- |
| `demo_train.py` | Simulated training with metrics + `reduce_lr` / `save_checkpoint` / `stop_training` |
| `demo_train_simple.py` | Short fake run, no SDK actions |
| `demo_train_monitor.py` | Longer run with instability phases for watchdog testing |
| `demo_monitor_trigger.py` | Deterministic anomalies (`nan`, `oom`, `crash`, `plateau`, `mixed`) |
| `demo_titration_test.py` | Non-ML lab telemetry (pH / flow) with pump actions |

## Architecture (high level)

```
┌─────────────────┐     IPC      ┌──────────────────┐
│  React renderer │◄────────────►│  Electron main   │
│  (Zustand UI)   │  window.api   │  process spawn   │
└────────┬────────┘              │  Ollama / NIM /  │
         │                       │  Claude / SMTP   │
         │                       └────────┬─────────┘
         │                                │ TCP :7821
         │                       ┌────────▼─────────┐
         │                       │  Python training │
         │                       │  + labguard_sdk  │
         │                       └──────────────────┘
         ▼
   Watchdog / Chat / Metrics / Video tabs
```

1. Renderer spawns or attaches a run via `window.api.lab`.
2. Main process streams stdout/stderr and listens for SDK registrations on port `7821`.
3. Metrics are parsed from log lines; the watchdog periodically asks the selected LLM for analysis.
4. Suggested actions require explicit approval before LabGuard calls back into the Python process.

## Configuration notes

| Setting | Where |
| --- | --- |
| Ollama models | First-run setup + Models view |
| NVIDIA NIM API key & models | Models / Settings (`electron-store`: `nim`) |
| Claude API key & models | Models / Settings (`electron-store`: `claude`) |
| SMTP alerts | Models / Settings (`electron-store`: `notify`) |
| Persisted UI state | `labguard-storage` (experiments, metrics, chat, etc.) |

Local ports used:

- `11434` — Ollama
- `7821` — LabGuard Python registry / attach bridge

## Status / known gaps

This is an early `0.1.0` prototype. Notable WIP areas:

- Gmail and filesystem “Connections” UI/IPC exist in the tree but are not fully wired into the main process / preload bridge yet
- Attach-command helper in the UI currently builds a Windows-style `cmd` pipe; Unix users can use the `labguard_tail.py` example above directly
- Video MP4 sources use session blob URLs and do not persist across app restarts

## License

ISC — see `package.json`.
