# Android APK Build Setup

## Automatski build (GitHub Actions)

Workflow `.github/workflows/build-android.yml` automatski gradi APK pri svakom pushu na `main`.

### GitHub Secrets koji trebaju biti postavljeni

Idi na: **GitHub → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Vrijednost |
|-------------|-----------|
| `KEYSTORE_BASE64` | Base64 sadržaj `keystore.jks` (vidi ispod) |
| `KEY_STORE_PASSWORD` | `sumarija2024!` |
| `KEY_ALIAS` | `sumarija` |
| `KEY_PASSWORD` | `sumarija2024!` |

### Kako dobiti KEYSTORE_BASE64

```bash
base64 android/app/keystore.jks | tr -d '\n'
```

Kopiraj cijeli output i zalijepi kao vrijednost `KEYSTORE_BASE64` secretа.

### Kako pokrenuti build

**Automatski**: Push na `main` branch pokreće build.

**Ručno**: GitHub → Actions → "Build Android APK" → Run workflow

**Release**: Napravi tag:
```bash
git tag v1.0.0
git push origin v1.0.0
```
GitHub automatski kreira Release sa APK fajlom.

---

## Lokalni build (Android Studio)

1. Instaliraj [Android Studio](https://developer.android.com/studio)
2. Otvori folder `android/` u Android Studiju
3. Build → Generate Signed Bundle/APK → APK
4. Odaberi `android/app/keystore.jks` (password: `sumarija2024!`, alias: `sumarija`)
5. Build release APK

**Ili via command line (ako imaš Android SDK):**
```bash
npm run sync              # kopiraj www/ → android assets
cd android
./gradlew assembleRelease \
  KEYSTORE_BASE64=$(base64 app/keystore.jks | tr -d '\n') \
  KEY_STORE_PASSWORD=sumarija2024! \
  KEY_ALIAS=sumarija \
  KEY_PASSWORD=sumarija2024!
# APK se nalazi u: android/app/build/outputs/apk/release/
```

---

## Instalacija APK-a na Android

1. Prenesi APK na telefon (USB, Google Drive, direktan download)
2. Otvori APK → dozvoliti "Instaliraj iz nepoznatih izvora"
3. Instaliraj

Pri prvom pokretanju:
- Dozvoli GPS
- Dozvoli "Sve vrijeme" za GPS (background tracking)

---

## Struktura projekta

```
├── index.html          ← Web app (radi i kao PWA i u APK-u)
├── www/                ← Build output za Capacitor (generisano, ne editovati)
├── capacitor.config.json
├── package.json
├── build.js            ← Build script (kopira web fajlove u www/)
├── android/            ← Native Android projekat
│   ├── app/
│   │   ├── build.gradle
│   │   ├── keystore.jks   ← NE commitovati u public repo!
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/ba/pogonboskrupa/sumarija/
│   │       │   ├── MainActivity.java
│   │       │   └── GpsTrackingService.java
│   │       └── res/
└── .github/workflows/build-android.yml
```

---

## Capacitor Plugins

| Plugin | Svrha |
|--------|-------|
| `@capacitor/geolocation` | Native GPS, background location |
| `@capacitor-community/keep-awake` | Ekran upaljen tokom snimanja |
| `@capacitor/app` | App lifecycle (foreground/background) |
| `@capacitor/splash-screen` | Splash screen pri pokretanju |
| `@capacitor/status-bar` | Boja status bara |
