#!/usr/bin/env bash
# Installs the APK on the running emulator, starts it and checks that the app booted:
# "[Nomadic] host ready" in logcat (Capacitor logs the WebView console in debug builds), no
# "[Nomadic] start failed", and the sign-in screen on screen. Leaves logcat, a UI dump and a screenshot.
set -u
APK="$1"
PKG=com.nomadic.career
adb install -r "$APK" || exit 1
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
ready=0
for i in $(seq 1 60); do
  if adb logcat -d -s Capacitor/Console:* | grep -q '\[Nomadic\] host ready'; then ready=1; break; fi
  sleep 2
done
sleep 3
adb logcat -d -v threadtime > smoke-logcat.txt
adb exec-out screencap -p > smoke-screen.png || true
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml smoke-ui.xml >/dev/null 2>&1 || true
echo '----- app console -----'
grep -E 'Capacitor/Console|Capacitor:|chromium|AndroidRuntime' smoke-logcat.txt | grep -v 'frame-ancestors' | tail -n 60 | cut -c1-300
status=0
if [ "$ready" != 1 ]; then echo '::error::The app did not log "[Nomadic] host ready".'; status=1; fi
if grep -q '\[Nomadic\] start failed' smoke-logcat.txt; then echo '::error::The app logged "[Nomadic] start failed".'; status=1; fi
# Only a crash of our own process fails the run; the emulator's preinstalled Google apps (Gmail, GMS) crash on
# their own now and then, and AndroidRuntime prints "Process: <package>, PID: …" right after "FATAL EXCEPTION".
if grep -A1 'FATAL EXCEPTION' smoke-logcat.txt | grep -q "Process: $PKG,"; then echo '::error::The app crashed (FATAL EXCEPTION in logcat).'; status=1;
elif grep -q 'FATAL EXCEPTION' smoke-logcat.txt; then echo "::warning::Another app on the emulator crashed (not $PKG); see smoke-logcat.txt."; fi
if [ -f smoke-ui.xml ]; then
  if grep -q 'Sign in to Nomadic' smoke-ui.xml; then echo 'Sign-in screen is on screen.'; else echo '::warning::"Sign in to Nomadic" not found in the UI dump (WebView text may not be exposed); see smoke-screen.png.'; fi
fi
exit $status
