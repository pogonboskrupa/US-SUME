#!/bin/bash
# Pokrenite ovaj script JEDNOM da generišete potpisni ključ za APK.
# Čuvajte keystore.jks na sigurnom — bez njega ne možete updatovati aplikaciju!

set -e

KEYSTORE="uss-vlake-release.jks"
ALIAS="uss-vlake"

echo "=== Generisanje keystore-a za ŠPD USS Vlake APK ==="
keytool -genkeypair \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 9125 \
  -dname "CN=SPD USS, OU=Vlake, O=SPD Unsko-sanske sume, L=Bihac, ST=USK, C=BA"

echo ""
echo "=== SHA-256 fingerprint (kopirati u .well-known/assetlinks.json) ==="
keytool -list -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  | grep "SHA256:" \
  | awk '{print $2}'

echo ""
echo "Keystore sačuvan u: $KEYSTORE"
echo "Dodajte u android/app/build.gradle → signingConfigs.release:"
echo "  storeFile     file('../$KEYSTORE')"
echo "  storePassword 'LOZINKA_KOJU_STE_UNIJELI'"
echo "  keyAlias      '$ALIAS'"
echo "  keyPassword   'LOZINKA_KOJU_STE_UNIJELI'"
