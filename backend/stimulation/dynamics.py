"""
Continuous-time recurrent network (CTRNN) dynamics for the 8-channel stimulation system.

Update rule (Euler integration):
    τ_i * dx_i/dt = -x_i + tanh(Σ_j W_ij * x_j + I_i + bias_i)

Where:
    x_i  ∈ [-1, 1]  activation of node i
    τ_i              time constant (decay rate)
    W_ij             lateral connection weight from j → i
    I_i              external stimulus input for this tick
    bias_i           baseline bias

Channel indices:
    0=reward  1=distress  2=curiosity  3=attachment
    4=arousal  5=fatigue  6=threat  7=familiarity
"""
from __future__ import annotations
import math
import numpy as np

N = 8   # number of stimulation channels

CHANNEL_NAMES = [
    "reward", "distress", "curiosity", "attachment",
    "arousal", "fatigue", "threat", "familiarity",
]

# Time constants (seconds). Smaller = faster decay.
TAU = np.array([
    2.0,   # reward       — fades relatively quickly
    3.0,   # distress     — lingers
    1.5,   # curiosity    — quick
    5.0,   # attachment   — slow, persistent
    1.0,   # arousal      — fast transient
    6.0,   # fatigue      — very slow buildup and decay
    1.5,   # threat       — quick spike
    8.0,   # familiarity  — very slow, long memory
], dtype=float)

# Baseline biases (resting activation tendency)
BIAS = np.array([
    -0.2,  # reward:    slight negative (need stimulation to feel good)
    -0.5,  # distress:  negative (default calm)
    0.1,   # curiosity: slight positive (always a little curious)
    -0.3,  # attachment
    -0.1,  # arousal:   slight negative (resting)
    -0.3,  # fatigue:   negative (default energetic)
    -0.6,  # threat:    strongly negative (safe by default)
    -0.2,  # familiarity
], dtype=float)

# Lateral connection weight matrix W[i, j] = weight from j to i
# Rows = target channel, Columns = source channel
W = np.zeros((N, N), dtype=float)

def _w(src: str, dst: str, weight: float) -> None:
    i = CHANNEL_NAMES.index(dst)
    j = CHANNEL_NAMES.index(src)
    W[i, j] = weight

# Reward connections
_w("reward",      "familiarity", 0.3)   # familiar things feel rewarding
_w("reward",      "attachment",  0.4)   # attachment → more rewarding
_w("curiosity",   "reward",     -0.15)  # reward slightly reduces curiosity (satiation)
_w("curiosity",   "fatigue",    -0.4)   # fatigue suppresses curiosity

# Distress connections
_w("distress",    "threat",      0.6)   # threat causes distress
_w("distress",    "fatigue",     0.2)   # distress builds fatigue
_w("arousal",     "distress",    0.3)   # arousal amplifies distress

# Curiosity connections
_w("curiosity",   "arousal",     0.2)   # curiosity is arousing
_w("curiosity",   "familiarity",-0.2)   # familiar things are less novel
_w("familiarity", "curiosity",  -0.3)   # familiarity reduces curiosity

# Threat connections
_w("threat",      "arousal",     0.5)   # threat is very arousing
_w("threat",      "distress",    0.4)   # threat → distress
_w("familiarity", "threat",     -0.3)   # familiar context reduces threat

# Attachment connections
_w("attachment",  "reward",      0.3)   # attachment amplifies reward
_w("attachment",  "familiarity", 0.2)   # attachment builds familiarity

# Fatigue connections
_w("fatigue",     "arousal",    -0.4)   # fatigue suppresses arousal
_w("fatigue",     "curiosity",  -0.3)   # see above


def step(x: np.ndarray, stimuli: np.ndarray, dt: float) -> np.ndarray:
    """
    Euler step of CTRNN.
    x:        current activations (N,)
    stimuli:  external inputs this tick (N,)
    dt:       seconds
    Returns:  new activations (N,)
    """
    net_input = W @ np.tanh(x) + stimuli + BIAS
    dx = (-x + np.tanh(net_input)) / TAU
    x_new = x + dx * dt
    # Soft clip to [-1, 1] via tanh rescaling
    return np.clip(x_new, -1.0, 1.0)


def compute_ambient_stimulus(time_of_day: float, ambient_light: float) -> np.ndarray:
    """Background stimulus from environment (day/night, weather)."""
    s = np.zeros(N)
    # Night → slight fatigue and reduced curiosity
    if time_of_day >= 20 or time_of_day < 6:
        s[CHANNEL_NAMES.index("fatigue")] += 0.05
        s[CHANNEL_NAMES.index("curiosity")] -= 0.03
        s[CHANNEL_NAMES.index("familiarity")] += 0.02
    # Dawn/dusk → arousal spike
    elif 5 <= time_of_day < 8 or 17 <= time_of_day < 20:
        s[CHANNEL_NAMES.index("arousal")] += 0.04
        s[CHANNEL_NAMES.index("curiosity")] += 0.02
    return s
