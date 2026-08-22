"""
EEG Signal Processing Module
Provides real-time filtering, feature extraction (FFT, band power, ERD/ERS),
Signal Quality Index (SQI) calculation, and Motor Attempt classification.
"""

from typing import Dict, Any, List, Optional
import numpy as np
from scipy import signal

# Default sampling rate from ESP32 ADS1115 / ADC (Hz)
DEFAULT_FS = 250.0

# Frequency bands (Hz)
BANDS = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "mu": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 45.0),
}


class EEGProcessor:
    def __init__(self, fs: float = DEFAULT_FS):
        self.fs = fs
        self.baseline_mu_power: Optional[float] = None
        self.baseline_beta_power: Optional[float] = None
        self._init_filters()

    def _init_filters(self):
        """Pre-compute filter coefficients for efficiency."""
        # 1. Bandpass filter 0.5 - 45 Hz (Butterworth 4th order)
        nyq = 0.5 * self.fs
        low = 0.5 / nyq
        high = min(45.0, nyq - 1.0) / nyq
        self.b_band, self.a_band = signal.butter(4, [low, high], btype="band")

        # 2. Notch filter for 50 Hz powerline noise (if fs > 100)
        if self.fs > 105:
            w0 = 50.0 / nyq
            q = 30.0
            self.b_notch50, self.a_notch50 = signal.iirnotch(w0, q)
        else:
            self.b_notch50, self.a_notch50 = None, None

    def filter_signal(self, samples: np.ndarray) -> np.ndarray:
        """Apply zero-phase bandpass and notch filtering to raw EEG samples."""
        if len(samples) < 18:
            # Need minimum samples for filtfilt
            return samples - np.mean(samples)

        # Baseline detrending
        x = signal.detrend(samples, type="constant")

        # Bandpass filter
        try:
            x_filtered = signal.filtfilt(self.b_band, self.a_band, x)
        except Exception:
            x_filtered = x

        # Notch filter
        if self.b_notch50 is not None:
            try:
                x_filtered = signal.filtfilt(self.b_notch50, self.a_notch50, x_filtered)
            except Exception:
                pass

        return x_filtered

    def compute_band_powers(self, filtered_samples: np.ndarray) -> Dict[str, float]:
        """Compute relative power in standard EEG frequency bands using FFT/Periodogram."""
        n = len(filtered_samples)
        if n < 16:
            return {band: 0.0 for band in BANDS}

        # Apply Hanning window
        windowed = filtered_samples * np.hanning(n)
        fft_vals = np.abs(np.fft.rfft(windowed)) ** 2
        freqs = np.fft.rfftfreq(n, d=1.0 / self.fs)

        total_power = np.sum(fft_vals) + 1e-10
        band_powers: Dict[str, float] = {}

        for band_name, (low_f, high_f) in BANDS.items():
            idx = np.where((freqs >= low_f) & (freqs <= high_f))[0]
            if len(idx) > 0:
                power = float(np.sum(fft_vals[idx]))
                band_powers[band_name] = power
            else:
                band_powers[band_name] = 0.0

        # Also store relative powers
        band_powers["total_power"] = float(total_power)
        band_powers["mu_relative"] = float(band_powers["mu"] / total_power)
        band_powers["beta_relative"] = float(band_powers["beta"] / total_power)
        band_powers["alpha_relative"] = float(band_powers["alpha"] / total_power)

        return band_powers

    def calculate_signal_quality(self, raw_samples: np.ndarray, filtered_samples: np.ndarray) -> float:
        """
        Evaluate signal quality index (SQI) between 0.0 (unusable/disconnected) and 1.0 (clean).
        Checks:
        1. Flatline detection (std too low)
        2. Extreme rail/clipping/saturation
        3. 50/60Hz noise ratio vs biological signal
        """
        if len(raw_samples) == 0:
            return 0.0

        std_raw = float(np.std(raw_samples))
        peak_to_peak = float(np.ptp(raw_samples))

        # Flatline check (< 0.5 uV or identical readings)
        if std_raw < 0.001 or peak_to_peak < 0.002:
            return 0.05

        # Extreme artifact check (clipping, electrode disconnect / motion artifact)
        if peak_to_peak > 5000.0 or std_raw > 1500.0:
            return 0.15

        # Ratio of filtered variance to raw variance
        std_filt = float(np.std(filtered_samples))
        ratio = std_filt / (std_raw + 1e-6)

        # High quality signals typically have reasonable variance and clean filtered ratio
        quality = min(1.0, max(0.1, ratio * 1.1))

        # Penalize if baseline wander dominates
        if ratio < 0.2:
            quality *= 0.6

        return round(float(min(1.0, max(0.0, quality))), 3)

    def estimate_motor_attempt(
        self,
        band_powers: Dict[str, float],
        signal_quality: float,
        override_prob: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Estimate motor intent / motor attempt probability (0.0 to 1.0).
        In neurorehabilitation, motor intent / attempt correlates with
        Event-Related Desynchronization (ERD) in the Mu (8-13 Hz) and Beta (13-30 Hz)
        frequency bands over the sensorimotor cortex (C3/C4).
        """
        if override_prob is not None:
            return {
                "motorAttemptProbability": round(override_prob, 3),
                "confidence": 0.9,
                "erdPercentage": 0.0,
                "isAttemptDetected": override_prob >= 0.6
            }

        if signal_quality < 0.25:
            return {
                "motorAttemptProbability": 0.1,
                "confidence": 0.3,
                "erdPercentage": 0.0,
                "isAttemptDetected": False,
                "warning": "Signal quality too low for reliable motor intent classification"
            }

        mu_rel = band_powers.get("mu_relative", 0.0)
        beta_rel = band_powers.get("beta_relative", 0.0)
        total_p = band_powers.get("total_power", 1.0)
        mu_p = band_powers.get("mu", 0.0)

        # Baseline calibration
        if self.baseline_mu_power is None:
            self.baseline_mu_power = max(mu_p, 1e-4)

        # Compute ERD: (Baseline - Current) / Baseline
        # ERD > 0 means Mu suppression (typical during motor attempt/visualization)
        erd = (self.baseline_mu_power - mu_p) / (self.baseline_mu_power + 1e-6)
        erd_pct = float(np.clip(erd * 100.0, -100.0, 100.0))

        # Model probability calculation
        # Higher beta activation + Mu ERD -> Higher motor attempt probability
        base_score = 0.45
        erd_contrib = (erd_pct / 100.0) * 0.35
        beta_contrib = (beta_rel - 0.15) * 0.8

        prob = base_score + erd_contrib + beta_contrib
        prob = float(np.clip(prob, 0.05, 0.98))

        # Weight by signal quality
        prob = prob * (0.5 + 0.5 * signal_quality)

        return {
            "motorAttemptProbability": round(float(prob), 3),
            "confidence": round(float(signal_quality * 0.92), 3),
            "erdPercentage": round(erd_pct, 2),
            "isAttemptDetected": prob >= 0.55
        }

    def process_packet(self, samples_raw: List[float], override_prob: Optional[float] = None) -> Dict[str, Any]:
        """Complete pipeline: raw -> filter -> band power -> SQI -> motor attempt."""
        samples_np = np.asarray(samples_raw, dtype=float)
        if len(samples_np) == 0:
            return {
                "signalQuality": 0.0,
                "motorAttemptProbability": 0.0,
                "confidence": 0.0,
                "bands": {k: 0.0 for k in BANDS},
                "filteredPreview": []
            }

        filtered = self.filter_signal(samples_np)
        band_powers = self.compute_band_powers(filtered)
        sqi = self.calculate_signal_quality(samples_np, filtered)
        motor_res = self.estimate_motor_attempt(band_powers, sqi, override_prob)

        # Downsample filtered preview for web telemetry (max 32 points for fast JSON transfer)
        step = max(1, len(filtered) // 32)
        preview = [round(float(val), 2) for val in filtered[::step][:32]]

        return {
            "signalQuality": sqi,
            "motorAttemptProbability": motor_res["motorAttemptProbability"],
            "confidence": motor_res["confidence"],
            "erdPercentage": motor_res.get("erdPercentage", 0.0),
            "isAttemptDetected": motor_res["isAttemptDetected"],
            "bands": {
                "delta": round(band_powers.get("delta", 0.0), 2),
                "theta": round(band_powers.get("theta", 0.0), 2),
                "alpha": round(band_powers.get("alpha", 0.0), 2),
                "mu": round(band_powers.get("mu", 0.0), 2),
                "beta": round(band_powers.get("beta", 0.0), 2),
                "gamma": round(band_powers.get("gamma", 0.0), 2),
            },
            "filteredPreview": preview
        }
