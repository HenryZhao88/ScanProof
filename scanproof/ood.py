"""Embedding-distance out-of-distribution / atypicality detector.

Method: class-conditional Mahalanobis distance in the penultimate feature space
of one ensemble member, following Lee et al., "A Simple Unified Framework for
Detecting Out-of-Distribution Samples and Adversarial Attacks" (NeurIPS 2018).
We fit one mean per class plus a single tied covariance (Ledoit-Wolf shrunk,
which is well-conditioned for a 512-dim embedding fit on ~4.7k samples), then
score an image by the smallest Mahalanobis distance to any class centroid.

The raw distance is not interpretable on its own, so we convert it to an
**empirical percentile against the training distribution**. "99.4th percentile"
means: only 0.6% of training chest films sat this far from every class centre.
That is the number the UI shows, and it is what the hard OOD gate is defined on.

Tradeoff: a single-layer Mahalanobis score is weaker than multi-layer ensembled
variants or a dedicated OOD model, but it needs no extra training, no OOD data
at fit time, and runs in one forward pass — the right point on the curve here.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch

from .config import MODEL_DIR


class MahalanobisOOD:
    def __init__(self, means: np.ndarray, precision: np.ndarray, train_distances: np.ndarray):
        self.means = np.asarray(means, dtype=np.float64)  # [C, D]
        self.precision = np.asarray(precision, dtype=np.float64)  # [D, D]
        #: sorted training distances, used as the empirical reference CDF
        self.reference = np.sort(np.asarray(train_distances, dtype=np.float64))

    # ------------------------------------------------------------------ fit
    @classmethod
    def fit(cls, features: torch.Tensor | np.ndarray, labels: np.ndarray) -> "MahalanobisOOD":
        from sklearn.covariance import LedoitWolf

        X = np.asarray(features, dtype=np.float64)
        y = np.asarray(labels).reshape(-1)
        classes = np.unique(y)

        means = np.stack([X[y == c].mean(axis=0) for c in classes])
        centred = np.concatenate([X[y == c] - means[i] for i, c in enumerate(classes)])
        precision = LedoitWolf(assume_centered=True).fit(centred).precision_

        obj = cls(means, precision, np.zeros(1))
        obj.reference = np.sort(obj.distance(X))
        return obj

    # ---------------------------------------------------------------- score
    def distance(self, features: torch.Tensor | np.ndarray) -> np.ndarray:
        """Minimum class-conditional Mahalanobis distance, ``[N]``."""
        X = np.asarray(features, dtype=np.float64)
        if X.ndim == 1:
            X = X[None]
        dists = np.empty((X.shape[0], self.means.shape[0]))
        for i, mu in enumerate(self.means):
            d = X - mu
            dists[:, i] = np.einsum("ij,jk,ik->i", d, self.precision, d)
        return np.sqrt(np.maximum(dists.min(axis=1), 0.0))

    def percentile(self, features: torch.Tensor | np.ndarray) -> np.ndarray:
        """Fraction of training images closer to their class centre than this
        image is. 0 = maximally typical, 1 = beyond every training image."""
        d = self.distance(features)
        idx = np.searchsorted(self.reference, d, side="right")
        return idx / len(self.reference)

    # ------------------------------------------------------------------- io
    def save(self, path: Path | None = None) -> Path:
        path = path or MODEL_DIR / "ood_mahalanobis.npz"
        # Sub-sample the reference CDF: 2000 quantiles reproduce the percentile
        # to <0.05% while keeping the artifact tiny.
        q = np.linspace(0, 1, 2000)
        np.savez_compressed(
            path,
            means=self.means,
            precision=self.precision,
            reference=np.quantile(self.reference, q),
        )
        return path

    @classmethod
    def load(cls, path: Path | None = None) -> "MahalanobisOOD":
        path = path or MODEL_DIR / "ood_mahalanobis.npz"
        if not path.exists():
            raise FileNotFoundError(
                f"missing OOD statistics at {path}. Run `python -m scanproof.train` first."
            )
        z = np.load(path)
        return cls(z["means"], z["precision"], z["reference"])
