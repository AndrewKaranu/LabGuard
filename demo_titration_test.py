"""
Synthetic titration run for LabGuard dual-stream testing.

Purpose:
- Stream realistic titration telemetry in terminal over time
- Provide parse-friendly metrics for LabGuard graphs/watchdog
- Optionally expose safe LabGuard actions via labguard_sdk

Example:
  python demo_titration_test.py --duration-sec 240 --step-sec 1.0
"""

from __future__ import annotations

import argparse
import json
import math
import random
import time

# Runtime controls modifiable via actions.
flow_multiplier = 1.0
noise_multiplier = 1.0
paused_steps = 0
stop_requested = False
manual_note = ''

try:
    from labguard_sdk import action, connect

    connect()

    @action
    def increase_flow(factor: float = 1.2):
        """Increase titrant flow multiplier to speed up approach to endpoint."""
        global flow_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        flow_multiplier *= factor
        print(f"[action] flow multiplier set to {flow_multiplier:.3f}", flush=True)
        return f"flow_multiplier={flow_multiplier:.3f}"

    @action
    def decrease_flow(factor: float = 0.8):
        """Decrease titrant flow multiplier to reduce overshoot risk near endpoint."""
        global flow_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        flow_multiplier *= factor
        print(f"[action] flow multiplier set to {flow_multiplier:.3f}", flush=True)
        return f"flow_multiplier={flow_multiplier:.3f}"

    @action
    def inject_noise(factor: float = 1.5):
        """Increase sensor noise level to simulate unstable probe readings."""
        global noise_multiplier
        if factor <= 0:
            raise ValueError('factor must be > 0')
        noise_multiplier *= factor
        print(f"[action] noise multiplier set to {noise_multiplier:.3f}", flush=True)
        return f"noise_multiplier={noise_multiplier:.3f}"

    @action
    def pause_pump(steps: int = 5):
        """Pause titrant pump for N sampling steps."""
        global paused_steps
        if steps < 1:
            raise ValueError('steps must be >= 1')
        paused_steps += int(steps)
        print(f"[action] pump paused for {steps} steps", flush=True)
        return f"paused_steps={paused_steps}"

    @action
    def mark_observation(note: str = 'Color shift observed'):
        """Attach a manual observation note to the output stream."""
        global manual_note
        manual_note = note.strip()
        print(f"[note] {manual_note}", flush=True)
        return manual_note

    @action
    def stop_titration():
        """Gracefully stop the titration test at next loop boundary."""
        global stop_requested
        stop_requested = True
        print('[action] stop requested', flush=True)
        return 'stop requested'

except ImportError:
    pass


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def main() -> None:
    parser = argparse.ArgumentParser(description='Synthetic titration telemetry stream')
    parser.add_argument('--duration-sec', type=int, default=180)
    parser.add_argument('--step-sec', type=float, default=1.0)
    parser.add_argument('--seed', type=int, default=123)
    parser.add_argument('--run-name', type=str, default='titration-dual-stream-test')
    args = parser.parse_args()

    random.seed(args.seed)

    # Sim parameters.
    expected_endpoint_ml = 12.4
    volume_ml = 0.0
    ph_start = 2.6
    ph_span = 8.7
    slope = 1.35

    total_steps = max(1, int(args.duration_sec / max(0.05, args.step_sec)))

    print(
        f"[init] run={args.run_name} duration_sec={args.duration_sec} step_sec={args.step_sec} endpoint_ml={expected_endpoint_ml:.2f}",
        flush=True,
    )
    print('[init] titration started', flush=True)

    for step in range(1, total_steps + 1):
        if stop_requested:
            print('[done] stop requested by action', flush=True)
            break

        # Sim pump flow (mL/s).
        base_flow = 0.11 + random.uniform(-0.02, 0.02)

        global paused_steps
        if paused_steps > 0:
            paused_steps -= 1
            flow = 0.0
            print(f"[warn] pump paused at step={step}", flush=True)
        else:
            flow = max(0.0, base_flow * flow_multiplier)

        volume_ml += flow * args.step_sec

        # pH curve around endpoint using logistic response + noise.
        x = (volume_ml - expected_endpoint_ml) * slope
        true_ph = ph_start + ph_span * sigmoid(x)
        noise = random.gauss(0.0, 0.03 * noise_multiplier)
        measured_ph = clamp(true_ph + noise, 0.0, 14.0)

        endpoint_error = abs(volume_ml - expected_endpoint_ml)
        near_endpoint = endpoint_error < 0.8
        overshoot = volume_ml > (expected_endpoint_ml + 0.6)

        status = 'approaching'
        if near_endpoint:
            status = 'near-endpoint'
        if overshoot:
            status = 'overshoot-risk'

        if near_endpoint and flow > 0.14:
            print(
                f"[warn] step={step} near endpoint with high flow ({flow:.3f} mL/s) — consider decrease_flow",
                flush=True,
            )

        if overshoot:
            print(
                f"[alert] step={step} possible overshoot volume={volume_ml:.2f} expected={expected_endpoint_ml:.2f}",
                flush=True,
            )

        # Human-readable process line.
        print(
            "Titration Step [{}/{}] volume_ml={:.3f} pH={:.3f} flow_ml_s={:.3f} status={} endpoint_error_ml={:.3f}".format(
                step,
                total_steps,
                volume_ml,
                measured_ph,
                flow,
                status,
                endpoint_error,
            ),
            flush=True,
        )

        # Parse-friendly key=value metrics.
        print(
            "metrics: step={}, val_ph={:.4f}, val_endpoint_error={:.4f}, val_flow={:.4f}".format(
                step,
                measured_ph,
                endpoint_error,
                flow,
            ),
            flush=True,
        )

        # HF-style JSON so parser always captures something.
        print(
            json.dumps(
                {
                    'loss': round(endpoint_error, 5),
                    'eval_loss': round(endpoint_error * (1.0 + random.uniform(-0.03, 0.03)), 5),
                    'learning_rate': round(flow, 6),
                    'epoch': float(step),
                }
            ),
            flush=True,
        )

        if manual_note:
            print(f"[note] {manual_note}", flush=True)

        time.sleep(args.step_sec)

    print('[done] titration test complete', flush=True)


if __name__ == '__main__':
    main()
