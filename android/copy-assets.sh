#!/bin/bash
# Radi nezavisno od trenutnog direktorija. Python 3, bez dodatnih paketa.
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python3 "$SCRIPT_DIR/assets.py" prepare
