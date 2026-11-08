#!/usr/bin/env bash
# Browser testovi za CI. Nezavisni testovi idu po 3 paralelno (runner ima 4
# jezgra) — redom su trajali ~8 min od ~15 ukupno. Testovi koji MJERE vrijeme
# ili su teški (KML 50 000, 5 sati terena, spori render) idu SAMI na kraju,
# da im paralelni Chromiumi ne kvare mjerenje (lažni istek roka).
set -u
cd "$(dirname "$0")/../.."
SAMI="kml-50000 kml-tacke-canvas field-five-hours field-offline-5400 slow-render-289"
PARALELNO=(
  tests/browser/terrain-workspace-243.py
  tests/browser/inline-split-startup.py
  tests/browser/labele-vlaka.py
  tests/browser/offline-import-240.py
  tests/browser/explorer-full-239.py
  tests/browser/explorer-239.py
  tests/browser/access-238.py
  tests/browser/overlays-237.py
  tests/browser/explorer-236.py
  tests/browser/measurements-235.py
  tests/browser/server-confirm-234.py
  tests/browser/load-map-233.py
  tests/browser/labels-offline-265.py
  tests/browser/thematic-files-266.py
  tests/browser/thematic-source-268.py
  tests/browser/manual-draw-270.py
  tests/browser/audit-parts-271.py
  tests/browser/audit-parts-272.py
  tests/browser/device-workflow-273.py
  tests/browser/day-layout-274.py
  tests/browser/day-all-panels-275.py
  tests/browser/doznaka-project-boundary-276.py
  tests/browser/kml-editor-277.py
  tests/browser/department-report-277.py
  tests/browser/navigation-design-278.py
  tests/browser/style-library-280.py
  tests/browser/vlaka-style-286.py
  tests/browser/project-auto-sync-287.py
  tests/browser/doznaka-plan-281.py
  tests/browser/photo-settings-281.py
  tests/browser/offline-preview-266.py
  tests/browser/preferences-266.py
  tests/browser/server-design-232.py
  tests/browser/print-styles-232.py
  tests/browser/print-responsive-274.py
  tests/browser/dem-winter-232.py
  tests/browser/doznaka-sixdays-232.py
  tests/browser/doznaka-boundary-231.py
  tests/browser/menu-print-day.py
  tests/browser/menu-tools.py
  tests/browser/server-map-218.py
  tests/browser/map-library-219.py
  tests/browser/project-vlake-220.py
  tests/browser/project-terrain-222.py
  tests/browser/reference-vlake-224.py
  tests/browser/project-arrows-226.py
  tests/browser/doznaka-restore-227.py
  tests/browser/doznaka-gps-controls-267.py
)
SAMI_LISTA=(
  tests/browser/kml-50000.py
  tests/browser/kml-tacke-canvas.py
  tests/browser/field-five-hours.py
  tests/browser/slow-render-289.py
  tests/browser/field-offline-5400.py
)
LOG=$(mktemp -d)
pokreni() { # $1 = test; izlaz u LOG, kod u .rc
  local ime; ime=$(basename "$1" .py)
  local t0=$SECONDS
  timeout 300s python "$1" >"$LOG/$ime.out" 2>&1; local rc=$?
  echo "$rc" >"$LOG/$ime.rc"
  echo "[$((SECONDS-t0))s] $( [ $rc -eq 0 ] && echo OK || echo "PAO($rc)") $1"
}
export -f pokreni; export LOG
printf '%s\n' "${PARALELNO[@]}" | xargs -P 3 -I{} bash -c 'pokreni "$@"' _ {}
for t in "${SAMI_LISTA[@]}"; do pokreni "$t"; done
pali=0
for rc in "$LOG"/*.rc; do
  if [ "$(cat "$rc")" != 0 ]; then
    pali=$((pali+1)); ime=$(basename "$rc" .rc)
    echo "::group::PAO $ime"; tail -40 "$LOG/$ime.out"; echo "::endgroup::"
    echo "##[error]Browser test pao: $ime"
  fi
done
echo "Browser testova: $(( ${#PARALELNO[@]} + ${#SAMI_LISTA[@]} )), palo: $pali"
[ "$pali" -eq 0 ]
