#!/usr/bin/env bash
# Mjerenje pokretanja u STVARNOM Android WebView-u (APK kroz WebViewAssetLoader).
# Desktop Chromium ne dokazuje ništa o APK-u: tamo HTTP keš/code cache radi drugačije.
# Svaki krug (12): force-stop (novi proces, kao hladan start na terenu) pa am start;
# app sam ispiše [DENDRO-START] {di,dcl,restore...} u konzolu → logcat (chromium).
# 1. krug je poslije pm clear (bez ikakvog keša), ostali "topli" (code cache ako ga
# WebView za appassets uopšte pravi — upravo to poređenje 1. i ostalih krugova kaže).
# Nikad ne ruši job: mjerenje je informacija, ne test.
set -uo pipefail
OUT=outputs/android-test/startup-timing.txt
PKG=ba.spd.uss.vlake.debug
APK=$(find android/app/build/outputs/apk/debug -name '*.apk' | head -1)
mkdir -p outputs/android-test
: > "$OUT"
if [ -z "$APK" ]; then echo "startup-timing: nema APK-a" | tee -a "$OUT"; exit 0; fi
adb install -r -g "$APK" >/dev/null 2>&1 || { echo "startup-timing: instalacija pala" | tee -a "$OUT"; exit 0; }
adb shell pm clear "$PKG" >/dev/null 2>&1
adb shell pm grant "$PKG" android.permission.ACCESS_FINE_LOCATION >/dev/null 2>&1
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1
for i in $(seq 1 12); do
  adb shell am force-stop "$PKG"
  sleep 2
  adb logcat -c
  TOTAL=$(adb shell am start -W -n "$PKG/ba.spd.uss.vlake.MainActivity" 2>/dev/null | tr -d '\r' | awk -F': ' '/TotalTime/{print $2}')
  LINE=""
  for _ in $(seq 1 60); do
    LINE=$(adb logcat -d 2>/dev/null | grep -o '\[DENDRO-START\] {[^}]*}' | tail -1)
    [ -n "$LINE" ] && break
    sleep 1
  done
  echo "krug=$i activityTotalMs=${TOTAL:-?} ${LINE:-[DENDRO-START] nije stiglo za 60 s}" | tee -a "$OUT"
done
adb shell am force-stop "$PKG"
exit 0
