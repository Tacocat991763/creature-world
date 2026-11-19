"""
Optional reward-modulated Hebbian plasticity for the stimulation network.
Not used by default — set ENABLE_PLASTICITY=true to activate.
"""
from __future__ import annotations
import numpy as np
from .dynamics import W, N, CHANNEL_NAMES


LEARNING_RATE = 0.001
MAX_WEIGHT = 1.0


def hebbian_update(x: np.ndarray, reward_signal: float) -> None:
    """
    Simple reward-modulated Hebbian rule:
        ΔW_ij = η * reward * x_i * x_j
    Modifies the shared W matrix in-place.
    Only call this when plasticity is intentionally enabled.
    """
    global W
    delta = LEARNING_RATE * reward_signal * np.outer(x, x)
    W += delta
    # Clip to prevent runaway weights
    np.clip(W, -MAX_WEIGHT, MAX_WEIGHT, out=W)
    # Keep diagonal zero (no self-connections)
    np.fill_diagonal(W, 0.0)
