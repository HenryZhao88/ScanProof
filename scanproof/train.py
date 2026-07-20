"""Train the ensemble, calibrate it, and fit the OOD statistics.

    python -m scanproof.train              # all members
    python -m scanproof.train --epochs 3   # quick smoke run

Writes ``models/<member>.pt`` (weights + fitted temperature),
``models/ood_mahalanobis.npz`` and ``artifacts/calibration.json``.
Model weights are git-ignored; the calibration summary is committed because it
is small and is real evidence of what the code produced.
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from .calibration import (
    brier_score,
    expected_calibration_error,
    fit_temperature,
    negative_log_likelihood,
)
from .config import (
    ARTIFACT_DIR,
    BATCH_SIZE,
    ENSEMBLE,
    EPOCHS,
    FEATURE_MEMBER,
    LR,
    MODEL_SIZE,
    WEIGHT_DECAY,
    MemberSpec,
    device,
)
from .data import XRaySplit, dataset_metadata
from .models import CXRMember, build_member, member_path
from .ood import MahalanobisOOD


@torch.inference_mode()
def collect_logits(model: nn.Module, loader: DataLoader, dev: torch.device):
    model.eval()
    logits, labels, feats = [], [], []
    for x, y in loader:
        x = x.to(dev)
        f = model.features(x)
        logits.append(model.head(f).float().cpu())
        feats.append(f.float().cpu())
        labels.append(y)
    return torch.cat(logits), torch.cat(labels), torch.cat(feats)


def auroc(scores: np.ndarray, labels: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score

    if len(np.unique(labels)) < 2:
        return float("nan")
    return float(roc_auc_score(labels, scores))


def train_member(spec: MemberSpec, epochs: int, dev: torch.device) -> dict:
    torch.manual_seed(spec.seed)
    np.random.seed(spec.seed)

    train_ds = XRaySplit("train", augment=spec.augment, seed=spec.seed)
    val_ds = XRaySplit("val", augment=None)
    gen = torch.Generator().manual_seed(spec.seed)
    train_ld = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, generator=gen,
                          num_workers=0, drop_last=True)
    val_ld = DataLoader(val_ds, batch_size=256, shuffle=False, num_workers=0)

    model = build_member(spec).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=LR, epochs=epochs, steps_per_epoch=len(train_ld), pct_start=0.25
    )
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.0)

    best = {"auc": -1.0, "state": None, "epoch": -1}
    history = []
    for ep in range(epochs):
        model.train()
        t0, total, seen = time.time(), 0.0, 0
        for x, y in train_ld:
            x, y = x.to(dev), y.to(dev)
            opt.zero_grad(set_to_none=True)
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            sched.step()
            total += float(loss) * len(y)
            seen += len(y)

        logits, labels, _ = collect_logits(model, val_ld, dev)
        probs = torch.softmax(logits, 1).numpy()
        acc = float((probs.argmax(1) == labels.numpy()).mean())
        auc = auroc(probs[:, 1], labels.numpy())
        history.append({"epoch": ep + 1, "train_loss": round(total / seen, 4),
                        "val_acc": round(acc, 4), "val_auc": round(auc, 4),
                        "seconds": round(time.time() - t0, 1)})
        print(f"  [{spec.name}] epoch {ep + 1}/{epochs}  loss {total / seen:.4f}  "
              f"val_acc {acc:.4f}  val_auc {auc:.4f}  ({time.time() - t0:.0f}s)", flush=True)

        if auc > best["auc"]:
            best = {"auc": auc, "epoch": ep + 1,
                    "state": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}}

    model.load_state_dict(best["state"])
    model.to(dev)

    # ---- temperature scaling on the validation split (never on test) ----
    logits, labels, feats = collect_logits(model, val_ld, dev)
    y = labels.numpy()
    raw = torch.softmax(logits, 1).numpy()
    temperature = fit_temperature(logits, labels)
    cal = torch.softmax(logits / temperature, 1).numpy()

    ece_raw, _ = expected_calibration_error(raw, y)
    ece_cal, bins_cal = expected_calibration_error(cal, y)

    torch.save(
        {
            "state_dict": model.state_dict(),
            "temperature": temperature,
            "arch": spec.arch,
            "seed": spec.seed,
            "augment": spec.augment,
            "model_size": MODEL_SIZE,
            "best_epoch": best["epoch"],
        },
        member_path(spec),
    )

    report = {
        "name": spec.name,
        "arch": spec.arch,
        "seed": spec.seed,
        "augment": spec.augment,
        "epochs": epochs,
        "best_epoch": best["epoch"],
        "temperature": round(temperature, 4),
        "val_accuracy": round(float((cal.argmax(1) == y).mean()), 4),
        "val_auroc": round(auroc(cal[:, 1], y), 4),
        "val_ece_raw": round(ece_raw, 4),
        "val_ece_calibrated": round(ece_cal, 4),
        "val_nll_raw": round(negative_log_likelihood(raw, y), 4),
        "val_nll_calibrated": round(negative_log_likelihood(cal, y), 4),
        "val_brier_raw": round(brier_score(raw, y), 4),
        "val_brier_calibrated": round(brier_score(cal, y), 4),
        "reliability_bins": bins_cal,
        "history": history,
    }
    print(f"  [{spec.name}] T={temperature:.3f}  ECE {ece_raw:.4f} → {ece_cal:.4f}  "
          f"val_acc {report['val_accuracy']:.4f}\n", flush=True)
    return report


def fit_ood(dev: torch.device) -> dict:
    """Fit the Mahalanobis detector on the training features of one member."""
    spec = next(s for s in ENSEMBLE if s.name == FEATURE_MEMBER)
    ckpt = torch.load(member_path(spec), map_location="cpu", weights_only=False)
    model = CXRMember(spec.arch, pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.eval().to(dev)

    train_ld = DataLoader(XRaySplit("train"), batch_size=256, shuffle=False, num_workers=0)
    _, labels, feats = collect_logits(model, train_ld, dev)
    det = MahalanobisOOD.fit(feats.numpy(), labels.numpy())
    path = det.save()

    val_ld = DataLoader(XRaySplit("val"), batch_size=256, shuffle=False, num_workers=0)
    _, _, vfeats = collect_logits(model, val_ld, dev)
    vpct = det.percentile(vfeats.numpy())

    # sanity check against genuinely out-of-distribution medical images
    from .data import load_ood_probes, to_model_tensor

    probes = load_ood_probes(24)
    pfeats = []
    with torch.inference_mode():
        for i in range(0, len(probes), 64):
            pfeats.append(model.features(to_model_tensor(probes[i : i + 64]).to(dev)).float().cpu())
    ppct = det.percentile(torch.cat(pfeats).numpy())

    summary = {
        "feature_member": spec.name,
        "feature_dim": int(feats.shape[1]),
        "artifact": str(path.name),
        "val_percentile_mean": round(float(vpct.mean()), 4),
        "val_percentile_p95": round(float(np.quantile(vpct, 0.95)), 4),
        "ood_probe_dataset": "breastmnist (breast ultrasound, CC BY 4.0)",
        "ood_probe_n": int(len(probes)),
        "ood_probe_percentile_mean": round(float(ppct.mean()), 4),
        "ood_probe_frac_above_hard_gate": round(float((ppct >= 0.995).mean()), 4),
    }
    print(f"  [ood] val mean pct {summary['val_percentile_mean']:.3f} | "
          f"OOD probe mean pct {summary['ood_probe_percentile_mean']:.3f} | "
          f"probes caught by hard gate: {summary['ood_probe_frac_above_hard_gate'] * 100:.0f}%\n",
          flush=True)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Train the ScanProof ensemble.")
    ap.add_argument("--epochs", type=int, default=EPOCHS)
    ap.add_argument("--members", type=str, default="", help="comma-separated member names")
    args = ap.parse_args()

    dev = device()
    print(f"device: {dev} | image size: {MODEL_SIZE} | epochs: {args.epochs}\n", flush=True)

    wanted = set(args.members.split(",")) if args.members else None
    specs = [s for s in ENSEMBLE if wanted is None or s.name in wanted]

    reports = [train_member(s, args.epochs, dev) for s in specs]
    ood_summary = fit_ood(dev)

    out = {
        "generated_by": "python -m scanproof.train",
        "device": str(dev),
        "image_size": MODEL_SIZE,
        "dataset": dataset_metadata(),
        "members": reports,
        "ood": ood_summary,
    }
    path = ARTIFACT_DIR / "calibration.json"
    path.write_text(json.dumps(out, indent=2))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
