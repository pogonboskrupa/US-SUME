# ŠPD USS Vlake — Android APK

WebView omotač koji pakuje PWA aplikaciju kao offline Android APK.

## Preduvjeti

- **Android Studio** (Hedgehog 2023.1+ ili noviji)
- **JDK 17** (dolazi uz Android Studio)
- Android SDK 34

## Koraci za build

### 1. Kopiraj web assete

Iz korijenskog direktorija projekta:

```bash
bash android/copy-assets.sh
```

Ovo kopira `index.html`, ikone, geo podatke i ostale fajlove u
`android/app/src/main/assets/`.

### 2. Otvori u Android Studiju

1. Pokreni Android Studio
2. **File → Open** → izaberi folder `android/`
3. Čekaj da se Gradle sinhronizuje (prvi put traje 2-5 min)

### 3. Debug APK

- **Run → Run 'app'** ili zeleni play dugme
- Izaberi emulatora ili povezani uređaj
- Debug APK se automatski gradi i instalira

### 4. Release APK (za distribuciju)

#### a) Generiši potpisni ključ (samo jednom)

```bash
cd android
bash generate-keystore.sh
```

Zapamti lozinku! Bez ključa ne možeš updatovati aplikaciju.

#### b) Konfiguriši potpis

Otvori `android/app/build.gradle` i popuni `signingConfigs.release`:

```groovy
signingConfigs {
    release {
        storeFile     file('../uss-vlake-release.jks')
        storePassword 'TVOJA_LOZINKA'
        keyAlias      'uss-vlake'
        keyPassword   'TVOJA_LOZINKA'
    }
}
```

Otkomentiraj `signingConfig signingConfigs.release` u `buildTypes.release`.

#### c) Build release APK

```bash
cd android
bash copy-assets.sh   # ako nisi već
./gradlew assembleRelease
```

APK se nalazi u: `android/app/build/outputs/apk/release/app-release.apk`

Ili iz Android Studia: **Build → Generate Signed Bundle / APK**.

## Struktura

```
android/
├── app/
│   ├── build.gradle              # App-level Gradle config
│   └── src/main/
│       ├── AndroidManifest.xml   # Dozvole i aktivnost
│       ├── assets/               # Web fajlovi (generisani sa copy-assets.sh)
│       ├── java/.../MainActivity.java  # WebView wrapper
│       └── res/
│           ├── drawable/         # Splash ikona
│           ├── mipmap-*/         # Launcher ikone
│           ├── values/           # Stringovi, boje, stilovi
│           └── xml/              # FileProvider putanje
├── build.gradle                  # Root Gradle config
├── settings.gradle
├── gradle.properties
├── gradle/wrapper/               # Gradle wrapper
├── copy-assets.sh                # Skripta za kopiranje web fajlova
├── generate-keystore.sh          # Skripta za potpisni ključ
└── .gitignore
```

## Dozvole

Aplikacija traži:
- **GPS** — snimanje vlaka
- **Internet** — učitavanje tile-ova karata
- **Wake Lock** — ekran budan tokom snimanja
- **Notifikacije** — obavještenja o GPS snimanju
