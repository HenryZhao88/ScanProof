"""Controlled, label-preserving perturbations.

Every perturbation here mimics benign acquisition or display variation that a
reporting radiologist would not consider a different study: exposure and
windowing shifts, detector noise, focus/motion softness, small patient
rotation, and lossy storage. The ground-truth label is invariant to all of
them, so *any* change in the model's prediction is model instability, not a
change in the underlying evidence.

Perturbations are deterministic (fixed noise seed per variant) so a case
analysed twice yields byte-identical evidence — important for a recorded demo.

Design tradeoff: we use classical image operations rather than a learned or
adversarial attack. Adversarial robustness is a different (and much more
expensive) question; naturalistic corruption at graded severity is the
scientifically defensible signal we can compute in real time.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
import torch
import torch.nn.functional as F

SEVERITIES = (1, 2, 3)


@dataclass(frozen=True)
class PerturbationFamily:
    key: str
    label: str
    description: str
    unit: str
    #: severity -> human readable magnitude, e.g. "+12%"
    magnitudes: tuple[str, str, str]
    fn: Callable[[np.ndarray, int], np.ndarray]

    def apply(self, img: np.ndarray, severity: int) -> np.ndarray:
        if severity not in SEVERITIES:
            raise ValueError(f"severity must be one of {SEVERITIES}")
        return self.fn(img, severity)

    def magnitude(self, severity: int) -> str:
        return self.magnitudes[severity - 1]


def _as_float(img: np.ndarray) -> np.ndarray:
    return np.asarray(img, dtype=np.float32) / 255.0


def _as_uint8(x: np.ndarray) -> np.ndarray:
    return np.clip(x * 255.0 + 0.5, 0, 255).astype(np.uint8)


def _torch_img(x: np.ndarray) -> torch.Tensor:
    return torch.from_numpy(x)[None, None]


# ------------------------------------------------------------------ families

_BRIGHTNESS = (0.12, 0.24, 0.36)


def _brightness(img: np.ndarray, s: int) -> np.ndarray:
    return _as_uint8(_as_float(img) + _BRIGHTNESS[s - 1])


_CONTRAST = (0.85, 0.72, 0.60)


def _contrast(img: np.ndarray, s: int) -> np.ndarray:
    x = _as_float(img)
    return _as_uint8((x - x.mean()) * _CONTRAST[s - 1] + x.mean())


_GAMMA = (1.25, 1.55, 1.90)


def _gamma(img: np.ndarray, s: int) -> np.ndarray:
    """Windowing / display-curve variation."""
    return _as_uint8(np.power(_as_float(img), _GAMMA[s - 1]))


_NOISE_SIGMA = (0.02, 0.045, 0.08)


def _noise(img: np.ndarray, s: int) -> np.ndarray:
    rng = np.random.default_rng(1000 + s)  # deterministic per severity
    x = _as_float(img)
    return _as_uint8(x + rng.normal(0.0, _NOISE_SIGMA[s - 1], size=x.shape).astype(np.float32))


_BLUR_SIGMA = (0.8, 1.6, 2.6)


def _gaussian_kernel(sigma: float) -> torch.Tensor:
    radius = max(1, int(round(3 * sigma)))
    t = torch.arange(-radius, radius + 1, dtype=torch.float32)
    k = torch.exp(-(t**2) / (2 * sigma**2))
    return k / k.sum()


def _blur(img: np.ndarray, s: int) -> np.ndarray:
    k = _gaussian_kernel(_BLUR_SIGMA[s - 1])
    r = (len(k) - 1) // 2
    x = _torch_img(_as_float(img))
    x = F.pad(x, (r, r, r, r), mode="reflect")
    x = F.conv2d(x, k.view(1, 1, 1, -1))
    x = F.conv2d(x, k.view(1, 1, -1, 1))
    return _as_uint8(x[0, 0].numpy())


_ROTATION_DEG = (3.0, 6.0, 10.0)


def _rotate(img: np.ndarray, s: int) -> np.ndarray:
    """Small patient/detector rotation, reflect-padded to avoid black corners
    that would themselves be an out-of-distribution cue."""
    deg = _ROTATION_DEG[s - 1]
    th = np.deg2rad(deg)
    x = _torch_img(_as_float(img))
    h, w = x.shape[-2:]
    pad = int(0.15 * max(h, w))
    x = F.pad(x, (pad, pad, pad, pad), mode="reflect")
    theta = torch.tensor([[[np.cos(th), -np.sin(th), 0.0], [np.sin(th), np.cos(th), 0.0]]],
                         dtype=torch.float32)
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    x = F.grid_sample(x, grid, mode="bilinear", padding_mode="reflection", align_corners=False)
    x = x[..., pad : pad + h, pad : pad + w]
    return _as_uint8(x[0, 0].numpy())


_RESAMPLE_SCALE = (0.70, 0.50, 0.35)


def _resample(img: np.ndarray, s: int) -> np.ndarray:
    """Downsample-then-upsample: stands in for lossy storage / lower-resolution
    acquisition without needing a JPEG codec in the inference path."""
    x = _torch_img(_as_float(img))
    h, w = x.shape[-2:]
    small = max(8, int(h * _RESAMPLE_SCALE[s - 1]))
    x = F.interpolate(x, size=(small, small), mode="bilinear", align_corners=False, antialias=True)
    x = F.interpolate(x, size=(h, w), mode="bilinear", align_corners=False)
    return _as_uint8(x[0, 0].numpy())


FAMILIES: tuple[PerturbationFamily, ...] = (
    PerturbationFamily("brightness", "Brightness", "Additive exposure shift", "%",
                       ("+12%", "+24%", "+36%"), _brightness),
    PerturbationFamily("contrast", "Contrast", "Contrast reduction about the mean", "%",
                       ("-15%", "-28%", "-40%"), _contrast),
    PerturbationFamily("gamma", "Gamma / windowing", "Display transfer-curve change", "γ",
                       ("γ 1.25", "γ 1.55", "γ 1.90"), _gamma),
    PerturbationFamily("noise", "Detector noise", "Additive Gaussian sensor noise", "σ",
                       ("σ 0.02", "σ 0.045", "σ 0.08"), _noise),
    PerturbationFamily("blur", "Blur", "Gaussian focus / motion softness", "px",
                       ("σ 0.8px", "σ 1.6px", "σ 2.6px"), _blur),
    PerturbationFamily("rotation", "Rotation", "Small patient/detector rotation", "°",
                       ("3°", "6°", "10°"), _rotate),
    PerturbationFamily("resample", "Resolution loss", "Down/up-sampling round trip", "×",
                       ("0.70x", "0.50x", "0.35x"), _resample),
)

FAMILY_BY_KEY = {f.key: f for f in FAMILIES}
N_VARIANTS = len(FAMILIES) * len(SEVERITIES)


def build_variants(img: np.ndarray) -> tuple[np.ndarray, list[tuple[str, int]]]:
    """Return ``(stack [V,H,W] uint8, keys [(family, severity), ...])``."""
    stack, keys = [], []
    for fam in FAMILIES:
        for sev in SEVERITIES:
            stack.append(fam.apply(img, sev))
            keys.append((fam.key, sev))
    return np.stack(stack), keys


def family_catalogue() -> list[dict]:
    """Serialisable description of the test battery, for the API/docs."""
    return [
        {
            "key": f.key,
            "label": f.label,
            "description": f.description,
            "severities": [
                {"severity": s, "magnitude": f.magnitude(s)} for s in SEVERITIES
            ],
        }
        for f in FAMILIES
    ]
