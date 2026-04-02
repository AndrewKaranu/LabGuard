"""
Long-running synthetic training script for testing LabGuard + LLM watchdog.

Designed to emit realistic logs over time:
- Gradual loss improvement
- Occasional instability spikes
- Throughput drops and recovery
- Metric JSON lines parseable by LabGuard metrics parser

Examples:
  python demo_train_monitor.py
  python demo_train_monitor.py --epochs 40 --steps-per-epoch 80 --sleep 0.35
  python demo_train_monitor.py --epochs 20 --steps-per-epoch 60 --sleep 0.5 --seed 7
"""

from __future__ import annotations

import argparse
import json
import math
import random
import time

lr_multiplier = 1.0
noise_multiplier = 1.0
forced_spikes = 0
pause_steps = 0
stop_requested = False

try:
    from labguard_sdk import action, connect

    connect()

    @action
    def reduce_lr(factor: float = 0.5):
        """Reduce effective learning rate multiplier (0 < factor < 1)."""
        global lr_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        lr_multiplier *= factor
        print(f"[action] reduce_lr applied; lr_multiplier={lr_multiplier:.4f}", flush=True)
        return f"lr_multiplier={lr_multiplier:.4f}"

    @action
    def increase_noise(factor: float = 1.3):
        """Increase training noise to simulate instability and trigger watchdog."""
        global noise_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        noise_multiplier *= factor
        print(f"[action] increase_noise applied; noise_multiplier={noise_multiplier:.4f}", flush=True)
        return f"noise_multiplier={noise_multiplier:.4f}"

    @action
    def inject_loss_spike(count: int = 3):
        """Force the next N steps to include large loss spikes."""
        global forced_spikes
        if count < 1:
            raise ValueError('count must be >= 1')
        forced_spikes += int(count)
        print(f"[action] queued {count} forced loss spikes", flush=True)
        return f"forced_spikes={forced_spikes}"

    @action
    def pause_training(steps: int = 5):
        """Pause training progress for N steps to emulate dataloader stalls."""
        global pause_steps
        if steps < 1:
            raise ValueError('steps must be >= 1')
        pause_steps += int(steps)
        print(f"[action] training pause queued for {steps} steps", flush=True)
        return f"pause_steps={pause_steps}"

    @action
    def stop_training():
        """Request graceful stop at next loop boundary."""
        global stop_requested
        stop_requested = True
        print('[action] graceful stop requested', flush=True)
        return 'stop requested'

except ImportError:
    # Script still works without LabGuard SDK; actions just won't be available.
    pass


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthetic long training run")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--steps-per-epoch", type=int, default=60)
    parser.add_argument("--sleep", type=float, default=0.35, help="seconds per step")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--run-name", type=str, default="monitor-demo")
    args = parser.parse_args()

    random.seed(args.seed)

    total_steps = args.epochs * args.steps_per_epoch
    current_step = 0

    base_loss = 2.8
    base_lr = 1.2e-3
    best_val = float("inf")
    bad_epochs = 0

    print(f"[init] run={args.run_name} epochs={args.epochs} steps_per_epoch={args.steps_per_epoch} sleep={args.sleep}", flush=True)
    print("[init] starting synthetic training loop", flush=True)

    wall_start = time.time()

    for epoch in range(1, args.epochs + 1):
        if stop_requested:
            print('[done] stop requested before epoch start', flush=True)
            break

        epoch_loss_sum = 0.0

        # Introduce occasional "bad" phases to test monitor behavior.
        is_bad_epoch = (epoch % 9 == 0) or (random.random() < 0.08)
        if is_bad_epoch:
            print(f"[event] epoch={epoch} entering instability phase", flush=True)

        for step in range(1, args.steps_per_epoch + 1):
            if stop_requested:
                print('[done] graceful stop requested', flush=True)
                break

            current_step += 1
            progress = current_step / total_steps

            # Smoothly decaying baseline with random noise.
            trend = base_loss * math.exp(-2.4 * progress)
            noise = random.gauss(0.0, (0.06 + 0.05 * (1.0 - progress)) * noise_multiplier)
            loss = trend + noise

            if is_bad_epoch:
                # Mild degradation during bad phases.
                loss *= random.uniform(1.08, 1.35)

            # Rare sharp spikes to emulate gradient explosions / bad batches.
            if random.random() < 0.015:
                spike = random.uniform(1.8, 3.8)
                loss *= spike
                print(f"[warn] step={current_step} transient loss spike detected factor={spike:.2f}", flush=True)

            global forced_spikes
            if forced_spikes > 0:
                spike = random.uniform(2.4, 4.2)
                forced_spikes -= 1
                loss *= spike
                print(f"[warn] step={current_step} forced loss spike factor={spike:.2f}", flush=True)

            loss = max(0.03, loss)

            # Synthetic metrics.
            lr = (base_lr * (0.985 ** max(0, epoch - 1))) * lr_multiplier
            grad_norm = clamp(0.8 + loss * random.uniform(0.7, 1.6), 0.1, 25.0)
            acc = clamp(0.22 + 0.72 * (1.0 - loss / base_loss) + random.uniform(-0.03, 0.03), 0.0, 0.995)
            throughput = clamp(92.0 - 18.0 * progress + random.uniform(-3.5, 2.0), 24.0, 110.0)
            gpu_mem_gb = clamp(7.8 + random.uniform(-0.5, 0.9), 6.5, 9.8)

            if is_bad_epoch and random.random() < 0.25:
                throughput *= random.uniform(0.6, 0.86)
                print(f"[warn] step={current_step} dataloader lag detected", flush=True)

            epoch_loss_sum += loss

            # Frequent human-readable logs.
            if step == 1 or step % 5 == 0:
                eta_steps = total_steps - current_step
                eta_sec = int(eta_steps * args.sleep)
                eta_min = eta_sec // 60
                eta_rem = eta_sec % 60
                print(
                    "Epoch [{}/{}] Step [{}/{}] Loss: {:.4f} Acc: {:.2f}% lr: {:.6f} "
                    "grad_norm: {:.3f} throughput: {:.1f} samples/s gpu_mem: {:.2f}GB eta: {:02d}:{:02d}".format(
                        epoch,
                        args.epochs,
                        step,
                        args.steps_per_epoch,
                        loss,
                        acc * 100.0,
                        lr,
                        grad_norm,
                        throughput,
                        gpu_mem_gb,
                        eta_min,
                        eta_rem,
                    ),
                    flush=True,
                )

            # Parse-friendly key=value line for parser fallback.
            if step % 10 == 0:
                print(
                    f"metrics: loss={loss:.4f}, acc={acc:.4f}, lr={lr:.6f}, epoch={epoch}, step={current_step}",
                    flush=True,
                )

            global pause_steps
            if pause_steps > 0:
                pause_steps -= 1
                extra = max(0.4, args.sleep * 2.5)
                print(f"[warn] step={current_step} artificial pause +{extra:.2f}s", flush=True)
                time.sleep(extra)

            time.sleep(args.sleep)

        train_loss = epoch_loss_sum / args.steps_per_epoch
        val_noise = random.uniform(-0.03, 0.06)
        val_loss = max(0.03, train_loss * (1.0 + val_noise))

        if is_bad_epoch:
            val_loss *= random.uniform(1.05, 1.22)

        improved = val_loss < best_val
        if improved:
            best_val = val_loss
            bad_epochs = 0
        else:
            bad_epochs += 1

        # HF-style JSON line recognized by LabGuard parser.
        summary = {
            "loss": round(train_loss, 5),
            "eval_loss": round(val_loss, 5),
            "learning_rate": round(base_lr * (0.985 ** max(0, epoch - 1)), 8),
            "epoch": float(epoch),
        }
        print(json.dumps(summary), flush=True)

        if improved:
            print(f"[info] epoch={epoch} new best eval_loss={val_loss:.5f}", flush=True)
        else:
            print(f"[info] epoch={epoch} no improvement bad_epochs={bad_epochs}", flush=True)

        # Periodic monitor-worthy message.
        if bad_epochs >= 3:
            print("[alert] validation has not improved for 3+ epochs", flush=True)

        print("-" * 72, flush=True)

        if stop_requested:
            print('[done] training stopped by action', flush=True)
            break

    elapsed = time.time() - wall_start
    print(f"[done] training complete in {elapsed/60.0:.1f} min", flush=True)


if __name__ == "__main__":
    main()
