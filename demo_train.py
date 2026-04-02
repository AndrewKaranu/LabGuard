"""
Demo training script for LabGuard.
Simulates an ML training loop with realistic output and metrics.

Run from LabGuard: python demo_train.py
"""

import time
import math
import random
import sys

# Optional: connect to LabGuard for action support
try:
    from labguard_sdk import action, connect
    connect()

    lr = 0.01

    @action
    def reduce_lr(factor: float = 0.5):
        """Reduce the learning rate by a factor"""
        global lr
        lr *= factor
        print(f"[Action] Learning rate reduced to {lr:.6f}", flush=True)

    @action
    def save_checkpoint():
        """Save a model checkpoint"""
        print(f"[Action] Checkpoint saved at step {current_step}", flush=True)

    @action
    def stop_training():
        """Gracefully stop the training run"""
        print("[Action] Stop requested — exiting after this epoch", flush=True)
        sys.exit(0)

except ImportError:
    lr = 0.01

# ── Training simulation ──────────────────────────────────────────────────────

EPOCHS = 20
STEPS_PER_EPOCH = 30
current_step = 0

print("LabGuard Demo Training Script", flush=True)
print(f"Epochs: {EPOCHS}, Steps/epoch: {STEPS_PER_EPOCH}", flush=True)
print("-" * 60, flush=True)

base_loss = 2.5
noise_scale = 0.3

for epoch in range(1, EPOCHS + 1):
    epoch_loss_sum = 0.0

    for step in range(1, STEPS_PER_EPOCH + 1):
        current_step += 1

        # Simulate loss curve: exponential decay with noise
        decay = math.exp(-current_step * 0.008)
        noise = random.gauss(0, noise_scale * decay)
        loss = max(0.05, base_loss * decay + noise)

        # Simulate occasional spike (divergence risk)
        if random.random() < 0.03:
            loss *= random.uniform(2.5, 4.0)

        acc = max(0.0, min(1.0, 1.0 - loss * 0.35 + random.gauss(0, 0.02)))
        epoch_loss_sum += loss

        # Step-level output (every 5 steps)
        if step % 5 == 0 or step == 1:
            print(
                f"Epoch [{epoch}/{EPOCHS}], Step [{step}/{STEPS_PER_EPOCH}], "
                f"Loss: {loss:.4f}, Acc: {acc * 100:.2f}%, lr: {lr:.6f}",
                flush=True
            )

        time.sleep(0.15)

    # End-of-epoch summary (HuggingFace Trainer style JSON)
    avg_loss = epoch_loss_sum / STEPS_PER_EPOCH
    val_loss = avg_loss * random.uniform(0.95, 1.15)
    print(
        {"loss": round(avg_loss, 4), "val_loss": round(val_loss, 4),
         "learning_rate": lr, "epoch": epoch},
        flush=True
    )
    print(f"Epoch {epoch} complete. avg_loss={avg_loss:.4f}", flush=True)
    print("-" * 60, flush=True)
    time.sleep(0.5)

print("Training complete.", flush=True)
