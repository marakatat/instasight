"""
Synthetic ESP32 EEG Data Generator for local testing and demonstration.
Generates realistic multi-frequency brainwave signals with Mu/Beta desynchronization.
"""

import asyncio
import time
import math
import random
from typing import List, Callable, Optional


class EEGSyntheticGenerator:
    def __init__(self, sample_rate: int = 250, batch_size: int = 25):
        self.sample_rate = sample_rate
        self.batch_size = batch_size
        self.is_running = False
        self.sequence = 0
        self._task: Optional[asyncio.Task] = None
        self._t = 0.0

    def generate_batch(self, simulating_attempt: bool = False) -> List[float]:
        """
        Generate a batch of microvolt (uV) EEG samples.
        Mu rhythm (10 Hz) attenuates when motor attempt is simulated.
        """
        dt = 1.0 / self.sample_rate
        samples: List[float] = []

        mu_amplitude = 8.0 if not simulating_attempt else 2.5
        beta_amplitude = 5.0 if not simulating_attempt else 9.0

        for _ in range(self.batch_size):
            self._t += dt
            t = self._t

            # Alpha / Mu rhythm (10 Hz)
            mu = mu_amplitude * math.sin(2 * math.pi * 10.0 * t + 0.3)

            # Beta rhythm (20 Hz)
            beta = beta_amplitude * math.sin(2 * math.pi * 20.0 * t + 1.2)

            # Theta rhythm (6 Hz) background
            theta = 4.0 * math.sin(2 * math.pi * 6.0 * t + 2.1)

            # Pink / Gaussian noise
            noise = random.gauss(0, 3.0)

            # Slight baseline wander (0.3 Hz)
            wander = 6.0 * math.sin(2 * math.pi * 0.3 * t)

            # 50 Hz powerline hum (small)
            hum = 1.5 * math.sin(2 * math.pi * 50.0 * t)

            val = mu + beta + theta + noise + wander + hum
            samples.append(round(val, 3))

        return samples

    async def start(self, callback: Callable[[dict], None], device_id: str = "esp32-simulated-01"):
        """Runs the simulator loop and calls `callback(packet)` every batch interval."""
        self.is_running = True
        interval = self.batch_size / self.sample_rate

        while self.is_running:
            self.sequence += 1
            # Periodically simulate motor attempt cycles (e.g. 5 seconds attempt, 5 seconds rest)
            sim_attempt = (int(time.time()) // 5) % 2 == 1

            samples = self.generate_batch(simulating_attempt=sim_attempt)
            packet = {
                "deviceId": device_id,
                "sequence": self.sequence,
                "timestamp": time.time(),
                "simulatedAttempt": sim_attempt,
                "samples": samples
            }

            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(packet)
                else:
                    callback(packet)
            except Exception as e:
                print(f"Simulator callback error: {e}")

            await asyncio.sleep(interval)

    def stop(self):
        self.is_running = False
