"""Confidence calibration and calibration metrics.

Temperature scaling (Guo et al., "On Calibration of Modern Neural Networks",
ICML 2017): a single scalar T is fit on a held-out split by minimising NLL of
``softmax(logits / T)``. It cannot change the argmax, so accuracy is untouched —
only the reported confidence becomes meaningful.

Everything the UI labels "calibrated confidence" comes from here; the raw
softmax value is kept alongside so the two can be shown side by side.
"""

from __future__ import annotations

import numpy as np
import torch


def fit_temperature(logits: torch.Tensor, labels: torch.Tensor, max_iter: int = 200) -> float:
    """Fit the scalar temperature by LBFGS on validation NLL."""
    # .clone() strips the inference-mode flag: `collect_logits` runs under
    # torch.inference_mode(), and such tensors cannot participate in autograd.
    logits = logits.detach().float().cpu().clone()
    labels = labels.detach().long().cpu().clone()
    log_t = torch.zeros(1, requires_grad=True)  # optimise log T to keep T > 0
    opt = torch.optim.LBFGS([log_t], lr=0.1, max_iter=max_iter)
    nll = torch.nn.CrossEntropyLoss()

    def closure():
        opt.zero_grad()
        loss = nll(logits / log_t.exp(), labels)
        loss.backward()
        return loss

    opt.step(closure)
    return float(log_t.exp().item())


def expected_calibration_error(
    probs: np.ndarray, labels: np.ndarray, n_bins: int = 15
) -> tuple[float, list[dict]]:
    """Equal-width ECE over the predicted-class confidence.

    Returns ``(ece, bins)`` where each bin carries count / confidence / accuracy
    so the frontend can draw a real reliability diagram instead of a mock-up.
    """
    probs = np.asarray(probs, dtype=np.float64)
    labels = np.asarray(labels).reshape(-1)
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    correct = (pred == labels).astype(np.float64)

    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    bins: list[dict] = []
    n = len(labels)
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (conf > lo) & (conf <= hi) if lo > 0 else (conf >= lo) & (conf <= hi)
        count = int(mask.sum())
        if count == 0:
            bins.append({"lower": float(lo), "upper": float(hi), "count": 0,
                         "confidence": None, "accuracy": None})
            continue
        avg_conf = float(conf[mask].mean())
        acc = float(correct[mask].mean())
        ece += (count / n) * abs(acc - avg_conf)
        bins.append({"lower": float(lo), "upper": float(hi), "count": count,
                     "confidence": avg_conf, "accuracy": acc})
    return float(ece), bins


def brier_score(probs: np.ndarray, labels: np.ndarray) -> float:
    """Binary Brier score on P(positive class)."""
    p = np.asarray(probs, dtype=np.float64)[:, 1]
    y = np.asarray(labels, dtype=np.float64).reshape(-1)
    return float(np.mean((p - y) ** 2))


def negative_log_likelihood(probs: np.ndarray, labels: np.ndarray) -> float:
    p = np.clip(np.asarray(probs, dtype=np.float64), 1e-12, 1.0)
    y = np.asarray(labels).reshape(-1)
    return float(-np.mean(np.log(p[np.arange(len(y)), y])))
