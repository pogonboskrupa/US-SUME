#!/usr/bin/env bash
# Jedan shell: emulator-runner inače svaku liniju script ulaza pokreće zasebno.
set -euo pipefail
adb root
adb wait-for-device
adb shell settings put global airplane_mode_on 1
adb shell am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true
adb shell svc wifi disable
adb shell svc data disable
# Emulator može zadržati VALIDATED Ethernet poslije gašenja Wi-Fi/mobilne veze.
adb shell 'if ip link show eth0 >/dev/null 2>&1; then ip link set eth0 down; fi'
adb logcat -c
mkdir -p outputs/android-test
set +e
timeout 180s gradle -p android --no-daemon connectedDebugAndroidTest
TEST_RC=$?
set -e
adb logcat -d > outputs/android-test/logcat.txt
# Mjerenje pokretanja (izdvajanje inline JS-a) — poslije testova, jer
# connectedAndroidTest na kraju deinstalira APK; skripta ga instalira sama.
echo "=== Mjerenje pokretanja u WebView-u ==="
timeout 420s bash tests/android/startup-timing.sh || true
if [ "$TEST_RC" -ne 0 ]; then
  # Zadnjih 500 redova logcata počinje tek ~45 s poslije prvog pada (ostali
  # testovi nastave raditi), pa iz njih nije vidljivo ŠTA je palo. Prvo
  # ispiši test/WebView/renderer redove iz CIJELOG zapisa.
  echo "=== Ključni redovi iz cijelog logcata ==="
  grep -E 'TestRunner|ExplorerCI|OfflineImportCI|DendroRender|chromium|cr_AwContents|AndroidRuntime|FATAL|RenderProcessGone' \
    outputs/android-test/logcat.txt | tail -n 400 || true
  echo "=== Kraj logcata ==="
  tail -n 200 outputs/android-test/logcat.txt
fi
exit "$TEST_RC"
