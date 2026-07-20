"""End-to-end analysis: image bytes / array → ReliabilityResult.

One ``Analyzer`` instance holds the ensemble, the temperatures and the OOD
statistics. Both the API and the offline audit use this same object, so a demo
case shown in the UI and the same case in the aggregate audit are produced by
identical code.

Batching note: for one image we run ``1 + 21 = 22`` forward passes per member
(66 total). The evaluation loop batches whole groups of images so the full
624-image test audit is ~41k forward passes in a couple of minutes on MPS.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np
import torch

from .config import ENSEMBLE, FEATURE_MEMBER, SOURCE_SIZE, ReliabilityConfig, device
from .data import to_model_tensor
from .models import load_ensemble, member_features, member_logits
from .ood import MahalanobisOOD
from .perturbations import build_variants
from .reliability import ReliabilityResult, SignalBundle, assess


def prepare_image(raw: bytes) -> np.ndarray:
    """Decode an uploaded file into the canonical uint8 ``[224,224]`` grayscale
    array the rest of the pipeline expects: convert to luminance, centre-crop
    to square (chest films are near-square after MedMNIST preprocessing), then
    resample. Raises ValueError on anything Pillow cannot open."""
    from PIL import Image, UnidentifiedImageError

    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Could not decode the uploaded file as an image.") from exc

    img = img.convert("L")
    w, h = img.size
    if w == 0 or h == 0:
        raise ValueError("Uploaded image has zero size.")
    side = min(w, h)
    left, top = (w - side) // 2, (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((SOURCE_SIZE, SOURCE_SIZE), Image.BILINEAR)
    return np.asarray(img, dtype=np.uint8)


def image_to_png_data_uri(img: np.ndarray, size: int = SOURCE_SIZE) -> str:
    import base64

    from PIL import Image

    pil = Image.fromarray(np.asarray(img, dtype=np.uint8), mode="L")
    if pil.size != (size, size):
        pil = pil.resize((size, size), Image.BILINEAR)
    buf = io.BytesIO()
    pil.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@dataclass
class Measurement:
    """Per-image raw measurements, before the reliability engine interprets
    them. Kept as a separate value so the evaluation sweep can re-score the
    same forward passes under many candidate thresholds without re-running the
    network."""

    member_probs: np.ndarray  # [M, 2] temperature-scaled, original image
    ensemble_prob: np.ndarray  # [2]   temperature-scaled ensemble mean
    ensemble_prob_raw: np.ndarray  # [2]   T = 1, for calibration comparison
    variant_probs: np.ndarray  # [V, 2]
    variant_keys: list[tuple[str, int]]
    ood_percentile: float
    ood_distance: float

    def bundle(self, member_names: list[str]) -> SignalBundle:
        return SignalBundle(
            member_probs=self.member_probs,
            member_names=member_names,
            ensemble_prob=self.ensemble_prob,
            variant_probs=self.variant_probs,
            variant_keys=self.variant_keys,
            ood_percentile=self.ood_percentile,
            ood_distance=self.ood_distance,
        )


class Analyzer:
    def __init__(self, dev: torch.device | None = None):
        self.device = dev or device()
        self.models, self.temperatures, self.specs = load_ensemble(self.device)
        self.member_names = [s.name for s in self.specs]
        self.feature_index = self.member_names.index(FEATURE_MEMBER)
        self.ood = MahalanobisOOD.load()
        self.config = ReliabilityConfig.load()

    def reload_config(self) -> None:
        """Pick up thresholds written by a later `scanproof.evaluate` run."""
        self.config = ReliabilityConfig.load()

    # ------------------------------------------------------------- measure
    def _measure_chunk(self, imgs: np.ndarray) -> list[Measurement]:
        """imgs: uint8 [N, 224, 224]. One Measurement per image."""
        if imgs.ndim == 2:
            imgs = imgs[None]
        n = len(imgs)

        stacks, keys = [], None
        for img in imgs:
            variants, keys = build_variants(img)
            stacks.append(np.concatenate([img[None], variants]))  # original first
        per_image = stacks[0].shape[0]  # 1 + V
        flat = np.concatenate(stacks)  # [N*(1+V), 224, 224]

        x = to_model_tensor(flat)
        logits = torch.stack([member_logits(m, x) for m in self.models])  # [M, N*(1+V), 2]
        temps = torch.tensor(self.temperatures).view(-1, 1, 1)
        probs = torch.softmax(logits / temps, dim=-1).numpy()
        probs_raw = torch.softmax(logits, dim=-1).numpy()

        shape = (len(self.models), n, per_image, 2)
        probs = probs.reshape(shape)
        probs_raw = probs_raw.reshape(shape)

        feats = member_features(self.models[self.feature_index], to_model_tensor(imgs)).numpy()
        distances = self.ood.distance(feats)
        percentiles = self.ood.percentile(feats)

        out = []
        for i in range(n):
            ens_all = probs[:, i, :, :].mean(axis=0)  # [1+V, 2]
            out.append(
                Measurement(
                    member_probs=probs[:, i, 0, :],
                    ensemble_prob=ens_all[0],
                    ensemble_prob_raw=probs_raw[:, i, 0, :].mean(axis=0),
                    variant_probs=ens_all[1:],
                    variant_keys=list(keys or []),
                    ood_percentile=float(percentiles[i]),
                    ood_distance=float(distances[i]),
                )
            )
        return out

    def measure_batch(self, imgs: np.ndarray, chunk: int = 16, progress=None) -> list[Measurement]:
        out: list[Measurement] = []
        for i in range(0, len(imgs), chunk):
            out.extend(self._measure_chunk(imgs[i : i + chunk]))
            if progress is not None:
                progress(min(i + chunk, len(imgs)), len(imgs))
        return out

    # ------------------------------------------------------------- analyse
    def analyze(self, img: np.ndarray) -> ReliabilityResult:
        return self.analyze_batch(img[None])[0]

    def analyze_batch(self, imgs: np.ndarray, chunk: int = 16) -> list[ReliabilityResult]:
        return [
            assess(m.bundle(self.member_names), self.config)
            for m in self.measure_batch(imgs, chunk=chunk)
        ]

    def model_card(self) -> dict:
        return {
            "members": [
                {"name": s.name, "arch": s.arch, "seed": s.seed, "augment": s.augment,
                 "temperature": round(t, 4)}
                for s, t in zip(self.specs, self.temperatures)
            ],
            "feature_member": FEATURE_MEMBER,
            "device": str(self.device),
            "thresholds": {
                "pass": self.config.pass_threshold,
                "review": self.config.review_threshold,
                "ood_hard_percentile": self.config.ood_hard_pct,
                "source": self.config.source,
            },
            "weights": self.config.weights,
        }
