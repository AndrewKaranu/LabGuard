"""
Deterministic ML watchdog trigger script for LabGuard demos.

This script is built to reliably trigger monitor/watchdog behavior by emitting
clear failure patterns in a controlled timeline:
- early training improvement
- loss plateau
- gradient explosion warnings
- optional NaN loss
- optional OOM/crash style terminal events

Examples:
  python demo_monitor_trigger.py
  python demo_monitor_trigger.py --scenario nan
  python demo_monitor_trigger.py --scenario oom
  python demo_monitor_trigger.py --scenario crash
  python demo_monitor_trigger.py --duration-sec 180 --step-sec 0.5
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time

# Runtime knobs exposed as optional actions for demos.
lr_multiplier = 1.0
noise_multiplier = 1.0
force_nan = False
stop_requested = False

try:
    from labguard_sdk import action, connect

    connect()

    @action
    def reduce_lr(factor: float = 0.5):
        """Reduce effective LR multiplier to stabilize training."""
        global lr_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        lr_multiplier *= factor
        print(f"[action] lr multiplier now {lr_multiplier:.4f}", flush=True)
        return f"lr_multiplier={lr_multiplier:.4f}"

    @action
    def add_noise(factor: float = 1.6):
        """Increase optimization noise to force instability."""
        global noise_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        noise_multiplier *= factor
        print(f"[action] noise multiplier now {noise_multiplier:.4f}", flush=True)
        return f"noise_multiplier={noise_multiplier:.4f}"

    @action
    def inject_nan_next():
        """Force NaN loss in the next few steps."""
        global force_nan
        force_nan = True
        print('[action] NaN injection armed', flush=True)
        return 'nan_armed=true'

    @action
    def stop_training():
        """Gracefully stop the run at next step boundary."""
        global stop_requested
        stop_requested = True
        print('[action] graceful stop requested', flush=True)
        return 'stop requested'

except ImportError:
    pass


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def main() -> None:
    parser = argparse.ArgumentParser(description='Watchdog-trigger test run')
    parser.add_argument('--duration-sec', type=int, default=150)
    parser.add_argument('--step-sec', type=float, default=0.6)
    parser.add_argument('--seed', type=int, default=99)
    parser.add_argument(
        '--scenario',
        choices=['mixed', 'nan', 'oom', 'crash', 'plateau'],
        default='mixed',
        help='Failure pattern to emphasize'
    )
    parser.add_argument('--run-name', type=str, default='watchdog-trigger-demo')
    args = parser.parse_args()

    random.seed(args.seed)

    total_steps = max(30, int(args.duration_sec / max(args.step_sec, 0.05)))
    base_lr = 1.1e-3
    best_val = float('inf')
    bad_epochs = 0

    print(
        f"[init] run={args.run_name} scenario={args.scenario} steps={total_steps} step_sec={args.step_sec}",
        flush=True,
    )
    print('[init] starting simulated training loop', flush=True)

    # Treat groups of 20 steps as pseudo-epochs for clearer monitor trends.
    steps_per_epoch = 20

    for step in range(1, total_steps + 1):
        if stop_requested:
            print('[done] graceful stop requested', flush=True)
            break

        epoch = (step - 1) // steps_per_epoch + 1
        progress = step / total_steps

        # Phase 1: healthy improvement.
        if progress < 0.35:
            loss = 2.2 * math.exp(-3.2 * progress)
        # Phase 2: plateau region (designed to trigger monitor concern).
        elif progress < 0.70 or args.scenario == 'plateau':
            loss = 0.82 + random.uniform(-0.03, 0.03)
        # Phase 3: instability ramp.
        else:
            loss = 0.9 + 2.2 * max(0.0, progress - 0.70) + random.uniform(-0.05, 0.05)

        # Noise and occasional spikes.
        loss += random.gauss(0, 0.03 * noise_multiplier)

        grad_norm = 1.2 + loss * random.uniform(0.9, 2.2)
        if progress > 0.72:
            grad_norm *= random.uniform(1.4, 2.2)
            print(f"[warn] step={step} exploding gradient suspected grad_norm={grad_norm:.3f}", flush=True)

        # Scenario-specific faults.
        if args.scenario in ('mixed', 'nan') and (force_nan or progress > 0.88):
            if step % 3 == 0:
                loss = float('nan')
                print(f"[alert] step={step} loss became NaN", flush=True)

        if args.scenario in ('mixed', 'oom') and progress > 0.82 and step % 11 == 0:
            print('RuntimeError: CUDA out of memory. Tried to allocate 512.00 MiB', flush=True)

        if args.scenario == 'crash' and progress > 0.85 and step % 7 == 0:
            print('[fatal] worker process crashed unexpectedly', flush=True)
            # Keep printing a couple lines first so monitor has context.
            print('[fatal] aborting run due to unrecoverable error', flush=True)
            sys.exit(2)

        lr = base_lr * (0.986 ** max(0, epoch - 1)) * lr_multiplier

        if math.isnan(loss):
            acc = 0.0
        else:
            acc = clamp(0.28 + (1.0 - min(loss, 2.4) / 2.4) * 0.62 + random.uniform(-0.02, 0.02), 0.0, 0.995)

        # Human-readable training line.
        print(
            "Epoch [{}] Step [{}/{}] Loss: {} Acc: {:.2f}% lr: {:.6f} grad_norm: {:.3f}".format(
                epoch,
                step,
                total_steps,
                'nan' if math.isnan(loss) else f"{loss:.4f}",
                acc * 100.0,
                lr,
                grad_norm,
            ),
            flush=True,
        )

        # Parse-friendly key=value line.
        loss_for_metrics = 9.999 if math.isnan(loss) else loss
        print(
            f"metrics: loss={loss_for_metrics:.4f}, acc={acc:.4f}, lr={lr:.6f}, epoch={epoch}, step={step}, val_grad_norm={grad_norm:.4f}",
            flush=True,
        )

        # JSON metrics line (HF-like).
        val_loss = loss_for_metrics * random.uniform(0.98, 1.06)
        payload = {
            'loss': round(loss_for_metrics, 5),
            'eval_loss': round(val_loss, 5),
            'learning_rate': round(lr, 8),
            'epoch': float(epoch),
        }
        print(json.dumps(payload), flush=True)

        if payload['eval_loss'] < best_val:
            best_val = payload['eval_loss']
            bad_epochs = 0
            print(f"[info] new best eval_loss={best_val:.5f}", flush=True)
        else:
            bad_epochs += 1
            print(f"[info] no improvement bad_epochs={bad_epochs}", flush=True)

        if bad_epochs >= 3:
            print('[alert] validation plateau detected (3+ consecutive non-improving epochs)', flush=True)

        time.sleep(args.step_sec)

    print('[done] run completed', flush=True)


if __name__ == '__main__':
    main()
