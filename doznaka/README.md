# 🌲 Šumarstvo Tracker

GPS aplikacija za praćenje kretanja inženjera šumarstva pri doznaci unutar šumskog odjela.

---

## ✨ Funkcionalnosti

| Funkcija | Opis |
|---|---|
| 📍 GPS trag | Snimanje traga u pozadini, čak i pri isključenom ekranu |
| 🗺️ Import granica | Import odjela iz KML ili GeoJSON fajla |
| 👥 Više inženjera | Svaki inženjer ima svoju boju traga vidljivu svima u realnom vremenu |
| 📐 Automatski proračun zona | Svaki inženjer dobija svoju zonu (od granice/midpoint do midpoint/granice) |
| 🔋 Battery optimizacija | Isključivanje Android battery optimizacije za neprekidan GPS signal |
| 📡 Realtime sync | Sve pozicije se vide uživo putem Supabase Realtime |
| 🏗️ Projektant + inženjeri | Projektant kreira odjel, dodaje inženjere i određuje redosljed |

---

## 🏗️ Arhitektura

```
Flutter (Dart)
├── flutter_map         → OSM karta + tragovi + zone
├── flutter_riverpod    → State management
├── geolocator          → GPS praćenje
├── flutter_background_service → Background GPS
└── supabase_flutter    → Auth + DB + Realtime

Backend: Supabase
├── PostgreSQL + PostGIS → Prostorna baza podataka
├── Auth                → Korisnici i sesije
└── Realtime            → Live pozicije inženjera
```

---

## 🚀 Postavljanje projekta

### 1. Supabase

1. Kreiraj besplatni projekat na [supabase.com](https://supabase.com)
2. Idi na **SQL Editor** i pokreni cijeli sadržaj fajla:
   ```
   supabase/migrations/001_initial.sql
   ```
3. Kopiraj `Project URL` i `anon public` ključ iz **Settings → API**

### 2. Flutter konfiguracija

Otvori `lib/core/constants.dart` i zamijeni:

```dart
static const supabaseUrl = 'https://TVOJ_PROJECT_ID.supabase.co';
static const supabaseAnonKey = 'TVOJ_ANON_KEY';
```

### 3. GitHub Secrets (za CI/CD)

Idi na **GitHub repo → Settings → Secrets and variables → Actions** i dodaj:

| Secret | Vrijednost |
|---|---|
| `SUPABASE_URL` | Tvoj Supabase URL |
| `SUPABASE_ANON_KEY` | Tvoj anon ključ |

### 4. Pokretanje lokalno

```bash
flutter pub get
flutter run
```

---

## 📱 Korištenje aplikacije

### Projektant (kreator odjela)

1. **Registruj se** i prijavi u aplikaciju
2. Tap **"Novi odjel"** → unesi naziv
3. **Uvezi granicu** odjela (KML ili GeoJSON fajl iz QGIS/GPS uređaja)
4. Unesi **površinu iz katastra** (ha) za precizne proračune
5. **Dodaj inženjere** pretragom po emailu
6. Postavi **redosljed** inženjera (povlačenjem) — određuje koji je "prvi"
7. Svaki inženjer dobija automatski **boju traga** (može se promijeniti)

### Inženjer

1. Prijavi se u aplikaciju
2. Odaberi odjel na koji si pozvan
3. Tap **"Pokreni snimanje"** — GPS trag se snima u pozadini
4. Na mapi vidiš:
   - Svoju putanju (boja dodjeljena od projektanta)
   - Putanje ostalih inženjera (uživo)
   - Svoju zonu — prostor koji "pokriva" tvoj trag
   - Površinu tvoje zone u hektarima
5. Tap **"Zaustavi"** po završetku

### Isključivanje battery optimizacije

Pri prvom pokretanju snimanja, aplikacija će predložiti isključivanje battery optimizacije. **Preporučujemo prihvatiti** — bez toga Android može prekinuti GPS signal u pozadini.

Ručno: **Postavke → Aplikacije → Šumarstvo Tracker → Baterija → Bez ograničenja**

---

## 📐 Algoritam podjele zona

```
Odjel:
┌────────────────────────────────────────┐
│                                        │
│  Inž. 1 ──────────────►               │
│                                        │
│ ··············· MIDLINE 1-2 ·········· │
│                                        │
│      Inž. 2 ──────────────────►        │
│                                        │
│ ··············· MIDLINE 2-3 ·········· │
│                                        │
│            Inž. 3 ───────────────────► │
│                                        │
└────────────────────────────────────────┘
```

- **Inženjer 1** → zona od granice odjela do MIDLINE(1,2)
- **Inženjer 2** → zona od MIDLINE(1,2) do MIDLINE(2,3)
- **Inženjer N** → zona od MIDLINE(N-1,N) do granice odjela

MIDLINE se računa kao simetrala između centroida tragova dva inženjera, klipovana unutar granica odjela (Sutherland-Hodgman algoritam).

---

## 📁 Struktura projekta

```
forestry_tracker/
├── lib/
│   ├── core/
│   │   ├── constants.dart      ← Supabase config, boje, GPS parametri
│   │   └── theme.dart          ← Zelena šumarska tema
│   ├── models/
│   │   └── models.dart         ← UserProfile, Project, TrackPoint, Zone...
│   ├── services/
│   │   ├── gps_service.dart    ← Background GPS snimanje
│   │   ├── supabase_service.dart ← Sve DB operacije
│   │   ├── geo_parser.dart     ← KML + GeoJSON parser
│   │   ├── area_calculator.dart ← Algoritam podjele zona
│   │   └── battery_service.dart ← Battery optimizacija
│   ├── providers/
│   │   └── providers.dart      ← Riverpod state management
│   ├── screens/
│   │   ├── auth/               ← Login + registracija
│   │   ├── home/               ← Lista projekata
│   │   ├── project/            ← Kreiranje odjela
│   │   ├── map/                ← Glavna mapa
│   │   └── widgets/            ← EngineerCard, AreaStatsPanel
│   └── main.dart
├── android/
│   └── app/src/main/
│       ├── kotlin/.../MainActivity.kt  ← Native battery kanal
│       └── AndroidManifest.xml         ← Sve dozvole
├── supabase/
│   └── migrations/001_initial.sql      ← PostGIS shema
├── .github/
│   └── workflows/build.yml             ← CI/CD → APK
└── pubspec.yaml
```

---

## 🔧 Razvoj i doprinos

```bash
# Kloniraj repozitorij
git clone https://github.com/TVOJ_USERNAME/forestry-tracker.git
cd forestry-tracker

# Instaliraj zavisnosti
flutter pub get

# Generiraj Riverpod kod
dart run build_runner build

# Pokreni u debug modu
flutter run

# Build release APK
flutter build apk --release
```

### Kreiranje novog release-a

```bash
git tag v1.0.0
git push origin v1.0.0
# GitHub Actions automatski gradi i objavljuje APK
```

---

## 📄 Licenca

MIT — slobodno koristi i prilagodi za potrebe šumarskih organizacija.
