"""
Simple fake training script for testing LabGuard streaming/attach.

Usage:
  python demo_train_simple.py
"""

import random
import time

EPOCHS = 5
STEPS_PER_EPOCH = 20
BASE_LOSS = 2.0

print("Starting demo training...", flush=True)
print(f"epochs={EPOCHS} steps_per_epoch={STEPS_PER_EPOCH}", flush=True)

for epoch in range(1, EPOCHS + 1):
    epoch_loss = 0.0
    for step in range(1, STEPS_PER_EPOCH + 1):
        progress = ((epoch - 1) * STEPS_PER_EPOCH + step) / (EPOCHS * STEPS_PER_EPOCH)
        loss = max(0.05, BASE_LOSS * (1.0 - 0.85 * progress) + random.uniform(-0.06, 0.06))
        acc = min(99.5, 45 + progress * 50 + random.uniform(-1.5, 1.5))
        lr = 0.001 * (0.98 ** (epoch - 1))

        epoch_loss += loss

        if step == 1 or step % 5 == 0:
            print(
                f"Epoch [{epoch}/{EPOCHS}] Step [{step}/{STEPS_PER_EPOCH}] "
                f"Loss: {loss:.4f} Acc: {acc:.2f}% lr: {lr:.6f}",
                flush=True,
            )

        # Send occasional warnings to stderr so both streams can be tested.
        if random.random() < 0.03:
            print("[warn] dataloader lag spike", flush=True)

        time.sleep(0.2)

    avg_loss = epoch_loss / STEPS_PER_EPOCH
    val_loss = avg_loss * random.uniform(0.95, 1.10)

    # JSON-style metric line similar to common trainers.
    print(
        {
            "epoch": epoch,
            "loss": round(avg_loss, 4),
            "val_loss": round(val_loss, 4),
            "lr": round(lr, 7),
        },
        flush=True,
    )
    print(f"Epoch {epoch} done", flush=True)

print("Training complete.", flush=True)
