"""Dataset access.

Source
------
PneumoniaMNIST from MedMNIST v2 / MedMNIST+ (Zenodo record 10519652), CC BY 4.0.
Downloaded reproducibly through the official `medmnist` package API — no scraping,
no manual downloads, MD5-verified by the package itself.

The raw ``.npz`` files land in ``data/`` and are git-ignored. Nothing in this
module writes patient-identifiable content: MedMNIST images are already
de-identified, cropped and resampled by the dataset authors.
"""

from __future__ import annotations

import numpy as np
import torch
from torch.utils.data import Dataset

from .config import DATA_DIR, DATASET, MODEL_SIZE, NORM_MEAN, NORM_STD, OOD_PROBE_DATASET, SOURCE_SIZE

SPLITS = ("train", "val", "test")


def dataset_metadata(flag: str = DATASET) -> dict:
    """License / provenance metadata straight from the medmnist package."""
    from medmnist import INFO

    info = INFO[flag]
    return {
        "flag": flag,
        "python_class": info["python_class"],
        "description": info["description"],
        "license": info["license"],
        "n_samples": info["n_samples"],
        "labels": info["label"],
        "source_url": info[f"url_{SOURCE_SIZE}"],
        "md5": info[f"MD5_{SOURCE_SIZE}"],
    }


def load_split(
    split: str, flag: str = DATASET, size: int | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(images_uint8 [N,H,W], labels [N] or [N,C])`` at ``size``.

    Downloads on first call. Subsequent calls read the cached ``.npz``.
    ``size`` defaults to SOURCE_SIZE; the domain-shift study passes 128 because
    MedMNIST+ ships ChestMNIST at 224 as a 3.7 GB archive, and 128 is a native
    rendering from the same source pipeline rather than an upscale.
    """
    if split not in SPLITS:
        raise ValueError(f"split must be one of {SPLITS}, got {split!r}")

    import medmnist
    from medmnist import INFO

    cls = getattr(medmnist, INFO[flag]["python_class"])
    ds = cls(split=split, download=True, root=str(DATA_DIR), size=size or SOURCE_SIZE)

    imgs = np.asarray(ds.imgs)
    if imgs.ndim == 4 and imgs.shape[-1] == 1:  # [N,H,W,1] -> [N,H,W]
        imgs = imgs[..., 0]
    elif imgs.ndim == 4:  # RGB probe dataset -> luminance
        imgs = imgs.mean(axis=-1).round().astype(np.uint8)

    # Single-label sets come back as [N,1] and are flattened; ChestMNIST is
    # multi-label [N,14] and must keep its second axis.
    labels = np.asarray(ds.labels).astype(np.int64)
    if labels.ndim == 2 and labels.shape[1] == 1:
        labels = labels.reshape(-1)
    return imgs.astype(np.uint8), labels


#: MedMNIST ships ChestMNIST at 128 as a 1.4 GB archive vs 3.7 GB at 224. Both
#: are native renderings produced by the same MedMNIST pipeline from the source
#: images, so 128 is a resolution choice, not an upscale. `shift.py` puts the
#: pediatric set through the identical 128 -> SOURCE_SIZE path as a control.
SHIFT_SIZE = 128
#: index of "pneumonia" among ChestMNIST's 14 findings
CHEST_PNEUMONIA_IDX = 6


def load_domain_shift_set(
    seed: int = 11, max_per_class: int | None = None
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Adult chest radiographs from a different institution, framed as the same
    binary task the model was trained on.

    Source: ChestMNIST (NIH ChestX-ray14, adult, NIH Clinical Center, USA),
    CC BY 4.0. The training data is PneumoniaMNIST (pediatric, 1-5 years old,
    Guangzhou Women and Children's Medical Center, China). Same modality, same
    view, same question — different population, scanner and institution. This
    is the shift that actually happens when a model is deployed.

    Positives are films labelled ``pneumonia``. Negatives are films with **no
    finding at all** (all 14 labels zero), which is the closest analogue to
    PneumoniaMNIST's ``normal`` class; using "some other pathology" as the
    negative would be a different task. Classes are balanced by subsampling the
    larger side with a fixed seed, so the set is deterministic.

    Caveat carried into the artifact: ChestX-ray14 labels are NLP-mined from
    radiology reports and are known to be noisy, so accuracy on this set is a
    soft number. The headline claims do not depend on it — they are about the
    model's own confidence and ScanProof's response, which need no labels.
    """
    imgs, labels = load_split("test", flag="chestmnist", size=SHIFT_SIZE)
    if labels.ndim != 2:
        raise ValueError("expected multi-label ChestMNIST labels")

    positive = labels[:, CHEST_PNEUMONIA_IDX] == 1
    no_finding = labels.sum(axis=1) == 0

    rng = np.random.default_rng(seed)
    pos_idx = np.flatnonzero(positive)
    neg_idx = np.flatnonzero(no_finding)

    n = min(len(pos_idx), len(neg_idx))
    if max_per_class is not None:
        n = min(n, max_per_class)
    pos_idx = rng.permutation(pos_idx)[:n]
    neg_idx = rng.permutation(neg_idx)[:n]

    idx = np.sort(np.concatenate([pos_idx, neg_idx]))
    y = positive[idx].astype(np.int64)
    x = resize_uint8(imgs[idx], SOURCE_SIZE)

    meta = {
        "source": "ChestMNIST test split (NIH ChestX-ray14), CC BY 4.0",
        "population": "adult, NIH Clinical Center (USA)",
        "training_population": "pediatric 1-5y, Guangzhou Women and Children's Medical Center (China)",
        "positive_rule": "ChestX-ray14 'pneumonia' label = 1",
        "negative_rule": "all 14 ChestX-ray14 findings = 0 ('no finding')",
        "native_size": SHIFT_SIZE,
        "resampled_to": SOURCE_SIZE,
        "n_per_class": int(n),
        "n_total": int(len(idx)),
        "pool_pneumonia": int(positive.sum()),
        "pool_no_finding": int(no_finding.sum()),
        "seed": seed,
        "label_caveat": (
            "ChestX-ray14 labels are NLP-mined from free-text reports and carry known "
            "noise. Accuracy on this arm is indicative, not a clean benchmark."
        ),
    }
    return x, y, meta


def load_resolution_control() -> tuple[np.ndarray, np.ndarray]:
    """The pediatric test split put through the *identical* resampling path as
    the shift set (native 128 -> SOURCE_SIZE).

    Without this arm, any difference measured on the shift set could be an
    artifact of resolution rather than of population. With it, the two are
    treated identically and the comparison isolates domain.
    """
    imgs, labels = load_split("test", size=SHIFT_SIZE)
    return resize_uint8(imgs, SOURCE_SIZE), labels


def load_ood_probes(n: int = 6) -> np.ndarray:
    """A few genuinely out-of-distribution medical images (breast ultrasound,
    CC BY 4.0, also from MedMNIST). Used to sanity-check the OOD detector and
    to ship believable OOD demo cases."""
    imgs, _ = load_split("test", flag=OOD_PROBE_DATASET)
    rng = np.random.default_rng(7)
    idx = rng.choice(len(imgs), size=min(n, len(imgs)), replace=False)
    return imgs[idx]


# ------------------------------------------------------------------ tensors


def to_unit_tensor(imgs: np.ndarray) -> torch.Tensor:
    """uint8 ``[N,H,W]`` (or ``[H,W]``) → float ``[N,3,S,S]`` in ``[0,1]``.

    Photometric augmentation has to happen in this space: torchvision's v2
    photometric transforms assume (and clamp to) unit range, so applying them
    after normalisation silently rescales the tensor and produces a training
    distribution the evaluation path never sees.
    """
    if imgs.ndim == 2:
        imgs = imgs[None]
    arr = np.ascontiguousarray(imgs)
    if not arr.flags.writeable:
        # arrays read straight out of an .npz are read-only; from_numpy would
        # share that buffer and warn. The copy is uint8 and immediately widened
        # to float anyway, so it costs nothing meaningful.
        arr = arr.copy()
    x = torch.from_numpy(arr).float().div_(255.0).unsqueeze(1)
    if x.shape[-1] != MODEL_SIZE:
        x = torch.nn.functional.interpolate(
            x, size=(MODEL_SIZE, MODEL_SIZE), mode="bilinear", align_corners=False, antialias=True
        )
    return x.repeat(1, 3, 1, 1)


def normalize(x: torch.Tensor) -> torch.Tensor:
    """Apply ImageNet statistics. Always the last preprocessing step."""
    shape = (1, 3, 1, 1) if x.ndim == 4 else (3, 1, 1)
    mean = torch.tensor(NORM_MEAN, device=x.device).view(shape)
    std = torch.tensor(NORM_STD, device=x.device).view(shape)
    return (x - mean) / std


def to_model_tensor(imgs: np.ndarray) -> torch.Tensor:
    """uint8 ``[N,H,W]`` → normalised float ``[N,3,S,S]``.

    The single entry point into the network for inference: demo cases, uploads,
    perturbed variants and the evaluation loop all go through it, so there is
    no train/serve preprocessing skew.
    """
    return normalize(to_unit_tensor(imgs))


def resize_uint8(imgs: np.ndarray, size: int = MODEL_SIZE, chunk: int = 512) -> np.ndarray:
    """Batched uint8 resize, used to cache training images at MODEL_SIZE once
    instead of resampling 224px arrays on every epoch."""
    if imgs.shape[-1] == size:
        return imgs
    out = []
    for i in range(0, len(imgs), chunk):
        x = torch.from_numpy(imgs[i : i + chunk]).float().unsqueeze(1)
        x = torch.nn.functional.interpolate(
            x, size=(size, size), mode="bilinear", align_corners=False, antialias=True
        )
        out.append(x.squeeze(1).round().clamp(0, 255).to(torch.uint8).numpy())
    return np.concatenate(out)


class XRaySplit(Dataset):
    """Training-time dataset with optional augmentation.

    Augmentation is intentionally mild and label-preserving for chest films:
    no vertical flips (anatomy is not vertically symmetric) and no horizontal
    flips in the ``light`` profile (situs matters), small affine jitter only.
    """

    def __init__(self, split: str, augment: str | None = None, seed: int = 0):
        imgs, self.labels = load_split(split)
        self.imgs = resize_uint8(imgs, MODEL_SIZE)
        self.augment = augment
        self._unit_tf, self._post_tf = self._build_transforms(augment)

    @staticmethod
    def _build_transforms(augment: str | None):
        """Returns ``(applied in [0,1], applied after normalisation)``.

        Geometric and photometric jitter run in unit range; erasing runs after
        normalisation because it fills with 0, which is the channel mean there.
        """
        if augment is None:
            return None, None
        from torchvision.transforms import v2

        if augment == "light":
            return (
                v2.Compose(
                    [
                        v2.RandomAffine(degrees=7, translate=(0.05, 0.05), scale=(0.95, 1.05)),
                        v2.ColorJitter(brightness=0.10, contrast=0.10),
                    ]
                ),
                None,
            )
        if augment == "strong":
            return (
                v2.Compose(
                    [
                        v2.RandomAffine(degrees=12, translate=(0.09, 0.09), scale=(0.90, 1.10)),
                        v2.ColorJitter(brightness=0.22, contrast=0.22),
                    ]
                ),
                v2.RandomErasing(p=0.25, scale=(0.02, 0.10)),
            )
        raise ValueError(f"unknown augment profile {augment!r}")

    def __len__(self) -> int:
        return len(self.imgs)

    def __getitem__(self, i: int):
        x = to_unit_tensor(self.imgs[i])[0]
        if self._unit_tf is not None:
            x = self._unit_tf(x)
        x = normalize(x)
        if self._post_tf is not None:
            x = self._post_tf(x)
        return x, int(self.labels[i])
