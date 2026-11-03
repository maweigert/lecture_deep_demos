"""Train a small CNN on MNIST and store it in docs/cnn_viewer/models.json for the CNN viewer.

The architecture is a comma-separated spec read by both this script and the viewer:
  c{k}x{C}[p{p}]  conv k x k to C channels with padding p (default 0), followed by ReLU
  m2              max pooling 2 x 2, stride 2
  g               global average pooling
  d{n}            dense layer with n units, ReLU except for the last layer (the logits)
The default is the LeNet-5 of the slides (61,706 parameters), e.g.
  python scripts/train_cnn_viewer.py --raw_dir data/MNIST/raw
  python scripts/train_cnn_viewer.py --raw_dir data/MNIST/raw --name "2 × conv 7×7, GAP" --spec c7x8p3,m2,c7x16p3,g,d10
The raw folder holds the uncompressed idx files train-images-idx3-ubyte, train-labels-idx1-ubyte,
t10k-images-idx3-ubyte and t10k-labels-idx1-ubyte (torchvision.datasets.MNIST(root, download=True) writes them
to <root>/MNIST/raw). Needs numpy and torch.
Inputs in [0, 1] without normalization, so the browser forward pass stays simple; random shifts of up to
3 pixels make the classifier tolerate drawn and shifted digits. Training uses 50,000 images of the
official training set, validation the other 10,000, and the test set is evaluated once at the end. Each
model (spec, float32 weights, accuracy) is stored under its name in models.json, replacing a model of the same
name; the examples (first correctly classified test image per class) are written by the first model trained, or
again with --examples.
"""

import argparse
import base64
import json
import logging
import re
from pathlib import Path

import numpy as np
import torch
from torch import nn

logger = logging.getLogger(__name__)

MODELS = Path(__file__).parent.parent / "docs" / "cnn_viewer" / "models.json"
LENET5 = "c5x6p2,m2,c5x16,m2,d120,d84,d10"


def load_idx(raw_dir: Path, split: str) -> tuple[np.ndarray, np.ndarray]:
    """Images (N, 28, 28) uint8 and labels (N,) of the uncompressed MNIST idx files."""
    prefix = "train" if split == "train" else "t10k"
    x = np.fromfile(raw_dir / f"{prefix}-images-idx3-ubyte", dtype=np.uint8, offset=16).reshape(-1, 28, 28)
    y = np.fromfile(raw_dir / f"{prefix}-labels-idx1-ubyte", dtype=np.uint8, offset=8)
    return x, y


def build(spec: str) -> nn.Sequential:
    """Model from a spec such as c5x6p2,m2,c5x16,m2,d120,d84,d10 for 1 x 28 x 28 inputs."""
    tokens, layers = spec.split(","), []
    c, n, flat = 1, 28, None  # channels and size of the current feature maps, or the vector length
    for i, tok in enumerate(tokens):
        if m := re.fullmatch(r"c(\d+)x(\d+)(?:p(\d+))?", tok):
            k, cout, p = int(m[1]), int(m[2]), int(m[3] or 0)
            layers += [nn.Conv2d(c, cout, k, padding=p), nn.ReLU()]
            c, n = cout, n + 2 * p - k + 1
        elif tok == "m2":
            layers.append(nn.MaxPool2d(2))
            n //= 2
        elif tok == "g":
            layers += [nn.AdaptiveAvgPool2d(1), nn.Flatten()]
            flat = c
        elif m := re.fullmatch(r"d(\d+)", tok):
            if flat is None:
                layers.append(nn.Flatten())
                flat = c * n * n
            layers.append(nn.Linear(flat, int(m[1])))
            flat = int(m[1])
            if i < len(tokens) - 1:
                layers.append(nn.ReLU())
        else:
            raise ValueError(f"unknown spec token {tok!r} in {spec!r}")
        if n < 1:
            raise ValueError(f"feature maps vanish at {tok!r} in {spec!r}")
    if flat != 10 or not tokens[-1].startswith("d"):
        raise ValueError(f"spec must end with d10 (logits), got {spec!r}")
    return nn.Sequential(*layers)


def to_tensor(a: np.ndarray) -> torch.Tensor:
    return torch.from_numpy(a).float().div(255).unsqueeze(1)  # (N, 28, 28) uint8 -> (N, 1, 28, 28) in [0, 1]


def random_shift(x: torch.Tensor, max_shift: int, gen: torch.Generator) -> torch.Tensor:
    """Shift each image by up to max_shift pixels per axis, filling with zeros."""
    b, _, h, w = x.shape
    padded = nn.functional.pad(x, (max_shift,) * 4)
    dy, dx = torch.randint(0, 2 * max_shift + 1, (2, b), generator=gen)
    return torch.stack([padded[i, :, dy[i] : dy[i] + h, dx[i] : dx[i] + w] for i in range(b)])


@torch.no_grad()
def predict(model: nn.Module, x: torch.Tensor) -> torch.Tensor:
    model.eval()
    return torch.cat([model(x[i : i + 1000]).argmax(1) for i in range(0, len(x), 1000)])


def encode(arr: np.ndarray, dtype: str) -> str:
    return base64.b64encode(np.ascontiguousarray(arr, dtype=dtype).tobytes()).decode()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-n", "--name", default="LeNet-5", help="Model name shown in the viewer")
    parser.add_argument("--spec", default=LENET5, help="Architecture spec (see above)")
    parser.add_argument("-r", "--raw_dir", type=Path, required=True, help="Folder with the uncompressed MNIST idx files")
    parser.add_argument("-e", "--epochs", type=int, default=10, help="Training epochs")
    parser.add_argument("-s", "--max_shift", type=int, default=3, help="Largest random shift in pixels")
    parser.add_argument("--seed", type=int, default=0, help="Random seed")
    parser.add_argument("--examples", action="store_true", help="Replace the stored examples with ones from this model")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    torch.manual_seed(args.seed)
    gen = torch.Generator().manual_seed(args.seed)

    xs, ys = load_idx(args.raw_dir, "train")
    xt, yt = load_idx(args.raw_dir, "test")
    perm = torch.randperm(len(xs), generator=gen)
    x_all, y_all = to_tensor(xs), torch.from_numpy(ys).long()
    x_tr, y_tr, x_va, y_va = x_all[perm[:50_000]], y_all[perm[:50_000]], x_all[perm[50_000:]], y_all[perm[50_000:]]

    model = build(args.spec)
    n_params = sum(p.numel() for p in model.parameters())
    logger.info("%s: %s, %d parameters", args.name, args.spec, n_params)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    for epoch in range(args.epochs):
        model.train()
        order = torch.randperm(len(x_tr), generator=gen)
        for i in range(0, len(order), 128):
            idx = order[i : i + 128]
            loss = nn.functional.cross_entropy(model(random_shift(x_tr[idx], args.max_shift, gen)), y_tr[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
        logger.info("epoch %d: validation accuracy %.4f", epoch + 1, (predict(model, x_va) == y_va).float().mean().item())
    pred = predict(model, to_tensor(xt)).numpy()
    test_acc = float((pred == yt).mean())
    logger.info("test accuracy %.4f", test_acc)

    data = json.loads(MODELS.read_text()) if MODELS.exists() else {}
    weights = np.concatenate([p.detach().numpy().ravel() for p in model.parameters()])
    entry = {"name": args.name, "spec": args.spec, "weights": encode(weights, "<f4"), "params": n_params, "test_acc": round(test_acc, 4), "epochs": args.epochs}
    data["models"] = [m for m in data.get("models", []) if m["name"] != args.name] + [entry]
    if args.examples or "examples" not in data:
        examples = np.stack([xt[np.flatnonzero((yt == d) & (pred == d))[0]] for d in range(10)])  # first correctly classified per class
        data["examples"] = encode(examples, "u1")
    MODELS.write_text(json.dumps(data))
    logger.info("wrote %s (%d models)", MODELS, len(data["models"]))
