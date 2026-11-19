"""Tests for the stimulation network dynamics."""
import pytest
import numpy as np
from backend.stimulation.dynamics import step, N, CHANNEL_NAMES, TAU
from backend.stimulation.stimuli import StimulusPacket
from backend.world.events import EventType


def test_step_returns_correct_shape():
    x = np.zeros(N)
    stim = np.zeros(N)
    x2 = step(x, stim, dt=0.1)
    assert x2.shape == (N,)


def test_step_stays_bounded():
    x = np.ones(N)
    stim = np.ones(N)
    for _ in range(1000):
        x = step(x, stim, dt=0.1)
    assert np.all(x >= -1.0)
    assert np.all(x <= 1.0)


def test_reward_stimulus_raises_reward():
    x = np.zeros(N)
    stim = np.zeros(N)
    stim[CHANNEL_NAMES.index("reward")] = 1.0
    for _ in range(20):
        x = step(x, stim, dt=0.1)
    assert x[CHANNEL_NAMES.index("reward")] > 0.1


def test_threat_raises_distress_via_connection():
    """Threat channel should propagate to distress via lateral connections."""
    x = np.zeros(N)
    stim = np.zeros(N)
    stim[CHANNEL_NAMES.index("threat")] = 1.0
    for _ in range(30):
        x = step(x, stim, dt=0.1)
    # Distress should be elevated above its resting state (-0.5 bias)
    # due to the threat→distress lateral connection.
    baseline_x = np.zeros(N)
    baseline_stim = np.zeros(N)
    for _ in range(30):
        baseline_x = step(baseline_x, baseline_stim, dt=0.1)
    assert x[CHANNEL_NAMES.index("distress")] > baseline_x[CHANNEL_NAMES.index("distress")]


def test_fatigue_suppresses_curiosity():
    """High fatigue should dampen curiosity over time."""
    x = np.zeros(N)
    # Start with moderate curiosity
    x[CHANNEL_NAMES.index("curiosity")] = 0.5
    stim = np.zeros(N)
    stim[CHANNEL_NAMES.index("fatigue")] = 0.8
    for _ in range(50):
        x = step(x, stim, dt=0.1)
    # Curiosity should be lower than it started
    assert x[CHANNEL_NAMES.index("curiosity")] < 0.5


def test_stimulus_packet_from_event():
    pkt = StimulusPacket.from_event_type(EventType.PERSON_GAVE_GIFT, {})
    assert pkt.reward > 0
    assert pkt.attachment > 0


def test_negative_stimulus_clamps():
    x = np.full(N, -0.9)
    stim = np.full(N, -1.0)
    for _ in range(100):
        x = step(x, stim, dt=0.1)
    assert np.all(x >= -1.0)


def test_state_persists_across_steps():
    """Network state must not reset spontaneously."""
    x = np.zeros(N)
    stim = np.zeros(N)
    stim[CHANNEL_NAMES.index("reward")] = 0.5
    x1 = step(x, stim, dt=0.1)
    stim[:] = 0.0
    x2 = step(x1, stim, dt=0.1)
    # After removing stimulus, reward should still be non-zero (slow decay)
    assert x2[CHANNEL_NAMES.index("reward")] > 0.0
