from __future__ import annotations

import json
import pickle
from pathlib import Path

import torch


def extract_code_cells(nb_path: Path) -> list[str]:
    data = json.loads(nb_path.read_text(encoding="utf-8"))
    cells = data.get("cells", [])
    code_blocks: list[str] = []
    for cell in cells:
        if cell.get("cell_type") != "code":
            continue
        source = cell.get("source", [])
        if isinstance(source, list):
            code = "".join(source)
        else:
            code = str(source)
        if code.strip():
            code_blocks.append(code)
    return code_blocks


def main() -> None:
    model_dir = Path(__file__).resolve().parent
    nb_path = model_dir / "Untitled.ipynb"
    if not nb_path.exists():
        raise FileNotFoundError(f"Notebook not found: {nb_path}")

    code_blocks = extract_code_cells(nb_path)
    if not code_blocks:
        raise RuntimeError("No code cells found in notebook")

    namespace: dict = {"__name__": "__main__"}

    # Notebook expects cwd=./model for ./datasets glob
    prev_cwd = Path.cwd()
    try:
        import os

        os.chdir(model_dir)
        for i, block in enumerate(code_blocks, start=1):
            exec(compile(block, f"Untitled.ipynb::cell_{i}", "exec"), namespace)
    finally:
        os.chdir(prev_cwd)

    model = namespace.get("model")
    scaler = namespace.get("scaler")
    x_cols = namespace.get("X_cols")

    if model is None or scaler is None or x_cols is None:
        raise RuntimeError(
            "Notebook did not expose required objects: model, scaler, X_cols. "
            "Check model/Untitled.ipynb"
        )

    artifacts_dir = model_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    model_path = artifacts_dir / "notebook_mlp.pt"
    scaler_path = artifacts_dir / "notebook_scaler.pkl"
    metadata_path = artifacts_dir / "notebook_metadata.json"

    in_dim = int(namespace.get("X_train").shape[1]) if namespace.get("X_train") is not None else len(x_cols)
    hidden = int(model.net[0].out_features) if hasattr(model, "net") else 128

    torch.save(
        {
            "state_dict": model.state_dict(),
            "in_dim": in_dim,
            "hidden": hidden,
            "classes": ["HomeWin", "Draw", "AwayWin"],
        },
        model_path,
    )

    with scaler_path.open("wb") as f:
        pickle.dump(scaler, f)

    metadata = {
        "x_cols": list(x_cols),
        "window": int(namespace.get("WINDOW", 20)),
        "generated_from": str(nb_path.name),
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Export complete")
    print(f"- {model_path}")
    print(f"- {scaler_path}")
    print(f"- {metadata_path}")


if __name__ == "__main__":
    main()
