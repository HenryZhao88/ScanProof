"""Ensemble members and feature extraction.

Backbones are ImageNet-pretrained torchvision models (BSD-3-Clause, weights
published by the PyTorch team). Only the classifier head is replaced; the whole
network is then fine-tuned on PneumoniaMNIST.

Each member exposes ``forward`` (logits) and ``features`` (penultimate
embedding) so the same object serves classification, calibration and the
embedding-distance OOD detector.
"""

from __future__ import annotations

from pathlib import Path

import torch
import torch.nn as nn

from .config import ENSEMBLE, MODEL_DIR, MemberSpec

_ARCH_WEIGHTS = {
    "resnet18": ("ResNet18_Weights", "IMAGENET1K_V1"),
    "densenet121": ("DenseNet121_Weights", "IMAGENET1K_V1"),
    "efficientnet_b0": ("EfficientNet_B0_Weights", "IMAGENET1K_V1"),
}


class CXRMember(nn.Module):
    """A single binary chest-film classifier with an exposed embedding."""

    def __init__(self, arch: str, pretrained: bool = True, n_classes: int = 2):
        super().__init__()
        import torchvision.models as tvm

        if arch not in _ARCH_WEIGHTS:
            raise ValueError(f"unsupported arch {arch!r}")

        weights = None
        if pretrained:
            enum_name, member = _ARCH_WEIGHTS[arch]
            weights = getattr(getattr(tvm, enum_name), member)
        net = getattr(tvm, arch)(weights=weights)

        self.arch = arch
        if arch.startswith("resnet"):
            self.feature_dim = net.fc.in_features
            net.fc = nn.Identity()
        elif arch.startswith("densenet"):
            self.feature_dim = net.classifier.in_features
            net.classifier = nn.Identity()
        else:  # efficientnet: classifier is Sequential(Dropout, Linear)
            self.feature_dim = net.classifier[-1].in_features
            net.classifier = nn.Identity()
        self.backbone = net
        self.head = nn.Linear(self.feature_dim, n_classes)

    def features(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.backbone(x))


def member_path(spec: MemberSpec) -> Path:
    return MODEL_DIR / f"{spec.name}.pt"


def build_member(spec: MemberSpec, pretrained: bool = True) -> CXRMember:
    torch.manual_seed(spec.seed)
    return CXRMember(spec.arch, pretrained=pretrained)


def load_member(spec: MemberSpec, device: torch.device) -> tuple[CXRMember, float]:
    """Load trained weights. Returns ``(model, temperature)``."""
    path = member_path(spec)
    if not path.exists():
        raise FileNotFoundError(
            f"missing weights for {spec.name} at {path}. Run `python -m scanproof.train` first."
        )
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model = build_member(spec, pretrained=False)
    model.load_state_dict(ckpt["state_dict"])
    model.eval().to(device)
    return model, float(ckpt.get("temperature", 1.0))


def load_ensemble(device: torch.device) -> tuple[list[CXRMember], list[float], list[MemberSpec]]:
    models, temps, specs = [], [], []
    for spec in ENSEMBLE:
        m, t = load_member(spec, device)
        models.append(m)
        temps.append(t)
        specs.append(spec)
    return models, temps, specs


@torch.inference_mode()
def member_logits(model: CXRMember, x: torch.Tensor, batch_size: int = 256) -> torch.Tensor:
    """Raw logits ``[N,2]`` on CPU. Kept separate from probabilities so callers
    can derive both the raw and the temperature-scaled distribution from a
    single forward pass — the audit reports calibration before *and* after."""
    device = next(model.parameters()).device
    out = []
    for i in range(0, x.shape[0], batch_size):
        out.append(model(x[i : i + batch_size].to(device)).float().cpu())
    return torch.cat(out) if out else torch.empty(0, 2)


def member_probs(
    model: CXRMember, x: torch.Tensor, temperature: float, batch_size: int = 256
) -> torch.Tensor:
    """Temperature-scaled P(class) for a batch. Returns ``[N,2]`` on CPU."""
    return torch.softmax(member_logits(model, x, batch_size) / temperature, dim=1)


@torch.inference_mode()
def member_features(model: CXRMember, x: torch.Tensor, batch_size: int = 256) -> torch.Tensor:
    device = next(model.parameters()).device
    out = []
    for i in range(0, x.shape[0], batch_size):
        out.append(model.features(x[i : i + batch_size].to(device)).float().cpu())
    return torch.cat(out) if out else torch.empty(0, 0)
