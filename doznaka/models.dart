// lib/models/models.dart

import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

// ============================================================
// UserProfile
// ============================================================
class UserProfile {
  final String id;
  final String fullName;
  final String email;

  const UserProfile({required this.id, required this.fullName, required this.email});

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        id: j['id'],
        fullName: j['full_name'] ?? '',
        email: j['email'] ?? '',
      );

  String get initials {
    final parts = fullName.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    if (parts.isNotEmpty && parts[0].isNotEmpty) return parts[0][0].toUpperCase();
    return '?';
  }
}

// ============================================================
// Project
// ============================================================
class Project {
  final String id;
  final String name;
  final String? description;
  final String createdBy;
  final Map<String, dynamic>? boundaryGeojson;
  final double? knownAreaHa;
  final String status;
  final DateTime createdAt;

  const Project({
    required this.id,
    required this.name,
    this.description,
    required this.createdBy,
    this.boundaryGeojson,
    this.knownAreaHa,
    this.status = 'active',
    required this.createdAt,
  });

  factory Project.fromJson(Map<String, dynamic> j) => Project(
        id: j['id'],
        name: j['name'],
        description: j['description'],
        createdBy: j['created_by'],
        boundaryGeojson: j['boundary_geojson'] as Map<String, dynamic>?,
        knownAreaHa: (j['known_area_ha'] as num?)?.toDouble(),
        status: j['status'] ?? 'active',
        createdAt: DateTime.parse(j['created_at']),
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        'description': description,
        'created_by': createdBy,
        'boundary_geojson': boundaryGeojson,
        'known_area_ha': knownAreaHa,
        'status': status,
      };

  bool get hasBoundary => boundaryGeojson != null;

  List<LatLng> get boundaryPoints {
    if (boundaryGeojson == null) return [];
    try {
      final coords = (boundaryGeojson!['coordinates'][0] as List).cast<List<dynamic>>();
      return coords
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
    } catch (_) {
      return [];
    }
  }
}

// ============================================================
// ProjectMember
// ============================================================
class ProjectMember {
  final String id;
  final String projectId;
  final String userId;
  final String role;
  final String trackColor;
  final int orderIndex;
  final bool isActive;
  final DateTime joinedAt;
  final UserProfile? profile;

  const ProjectMember({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.role,
    required this.trackColor,
    required this.orderIndex,
    this.isActive = true,
    required this.joinedAt,
    this.profile,
  });

  factory ProjectMember.fromJson(Map<String, dynamic> j) => ProjectMember(
        id: j['id'],
        projectId: j['project_id'],
        userId: j['user_id'],
        role: j['role'] ?? 'engineer',
        trackColor: j['track_color'] ?? '#3B8BD4',
        orderIndex: j['order_index'] ?? 0,
        isActive: j['is_active'] ?? true,
        joinedAt: DateTime.tryParse(j['joined_at'] ?? '') ?? DateTime.now(),
        profile: j['profiles'] != null
            ? UserProfile.fromJson(j['profiles'])
            : (j['full_name'] != null
                ? UserProfile(
                    id: j['user_id'] ?? '',
                    fullName: j['full_name'],
                    email: j['email'] ?? '')
                : null),
      );

  bool get isManager => role == 'manager';

  Color get color {
    try {
      return Color(int.parse('FF${trackColor.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.blue;
    }
  }

  String get displayName => profile?.fullName ?? 'Inženjer ${orderIndex + 1}';
  String get displayEmail => profile?.email ?? '';
  String get initials => profile?.initials ?? '?';
}

// ============================================================
// TrackPoint
// ============================================================
class TrackPoint {
  final int? id;
  final String projectId;
  final String userId;
  final double latitude;
  final double longitude;
  final double? altitude;
  final double? accuracy;
  final double? speed;
  final DateTime recordedAt;

  const TrackPoint({
    this.id,
    required this.projectId,
    required this.userId,
    required this.latitude,
    required this.longitude,
    this.altitude,
    this.accuracy,
    this.speed,
    required this.recordedAt,
  });

  factory TrackPoint.fromJson(Map<String, dynamic> j) => TrackPoint(
        id: j['id'],
        projectId: j['project_id'],
        userId: j['user_id'],
        latitude: (j['latitude'] as num).toDouble(),
        longitude: (j['longitude'] as num).toDouble(),
        altitude: (j['altitude'] as num?)?.toDouble(),
        accuracy: (j['accuracy'] as num?)?.toDouble(),
        speed: (j['speed'] as num?)?.toDouble(),
        recordedAt: DateTime.parse(j['recorded_at']),
      );

  Map<String, dynamic> toJson() => {
        'project_id': projectId,
        'user_id': userId,
        'latitude': latitude,
        'longitude': longitude,
        'altitude': altitude,
        'accuracy': accuracy,
        'speed': speed,
        'recorded_at': recordedAt.toIso8601String(),
      };

  LatLng get latLng => LatLng(latitude, longitude);
}

// ============================================================
// EngineerZone
// ============================================================
class EngineerZone {
  final String id;
  final String projectId;
  final String userId;
  final List<LatLng> polygon;
  final double areaHa;
  final double areaPct;
  final DateTime calculatedAt;

  const EngineerZone({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.polygon,
    required this.areaHa,
    required this.areaPct,
    required this.calculatedAt,
  });

  factory EngineerZone.fromJson(Map<String, dynamic> j) {
    final gj = j['zone_geojson'] as Map<String, dynamic>?;
    return EngineerZone(
      id: j['id'],
      projectId: j['project_id'],
      userId: j['user_id'],
      polygon: gj != null ? _parse(gj) : [],
      areaHa: (j['area_ha'] as num?)?.toDouble() ?? 0,
      areaPct: (j['area_pct'] as num?)?.toDouble() ?? 0,
      calculatedAt: DateTime.parse(j['calculated_at']),
    );
  }

  static List<LatLng> _parse(Map<String, dynamic> gj) {
    try {
      return (gj['coordinates'][0] as List)
          .cast<List<dynamic>>()
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
    } catch (_) {
      return [];
    }
  }
}

// ============================================================
// EngineerTrack
// ============================================================
class EngineerTrack {
  final ProjectMember member;
  final List<TrackPoint> points;

  const EngineerTrack({required this.member, required this.points});

  List<LatLng> get polyline => points.map((p) => p.latLng).toList();
  LatLng? get lastPoint => points.isNotEmpty ? points.last.latLng : null;
}

// ============================================================
// AreaMarking — Obilježena ploha u odjelu
// ============================================================
enum MarkingType {
  unsuitableFelling,
  cleaning,
  protection,
  seedTrees,
  priorityFelling,
  done,
  custom;

  static MarkingType fromString(String s) => switch (s) {
        'unsuitable_felling' => MarkingType.unsuitableFelling,
        'cleaning'           => MarkingType.cleaning,
        'protection'         => MarkingType.protection,
        'seed_trees'         => MarkingType.seedTrees,
        'priority_felling'   => MarkingType.priorityFelling,
        'done'               => MarkingType.done,
        _                    => MarkingType.custom,
      };

  String get dbValue => switch (this) {
        MarkingType.unsuitableFelling => 'unsuitable_felling',
        MarkingType.cleaning          => 'cleaning',
        MarkingType.protection        => 'protection',
        MarkingType.seedTrees         => 'seed_trees',
        MarkingType.priorityFelling   => 'priority_felling',
        MarkingType.done              => 'done',
        MarkingType.custom            => 'custom',
      };

  String get label => switch (this) {
        MarkingType.unsuitableFelling => 'Nepogodno za sječu',
        MarkingType.cleaning          => 'Čišćenje podmlatka',
        MarkingType.protection        => 'Zaštitna zona',
        MarkingType.seedTrees         => 'Stabla sjemenjaci',
        MarkingType.priorityFelling   => 'Prioritet doznake',
        MarkingType.done              => 'Završeno',
        MarkingType.custom            => 'Ostalo',
      };

  String get description => switch (this) {
        MarkingType.unsuitableFelling => 'Kamen, nagib, vlažno tlo, nepristupačno',
        MarkingType.cleaning          => 'Potrebno čišćenje podmlatka / šiblja',
        MarkingType.protection        => 'Vodotok, zaštitno stanište, rubna zona',
        MarkingType.seedTrees         => 'Odabrana stabla — NE sjeći!',
        MarkingType.priorityFelling   => 'Ova ploha se doznauje prva',
        MarkingType.done              => 'Doznaka završena u ovoj plohi',
        MarkingType.custom            => 'Korisnički definisana napomena',
      };

  String get emoji => switch (this) {
        MarkingType.unsuitableFelling => '🚫',
        MarkingType.cleaning          => '🌿',
        MarkingType.protection        => '🛡️',
        MarkingType.seedTrees         => '🌰',
        MarkingType.priorityFelling   => '⭐',
        MarkingType.done              => '✅',
        MarkingType.custom            => '📍',
      };

  Color get color => switch (this) {
        MarkingType.unsuitableFelling => const Color(0xFFE63946),
        MarkingType.cleaning          => const Color(0xFF52B788),
        MarkingType.protection        => const Color(0xFF3B8BD4),
        MarkingType.seedTrees         => const Color(0xFFFF9F1C),
        MarkingType.priorityFelling   => const Color(0xFFFFBE0B),
        MarkingType.done              => const Color(0xFF8D99AE),
        MarkingType.custom            => const Color(0xFF9B5DE5),
      };

  Color get fillColor => color.withOpacity(0.22);
  Color get borderColor => color;
}

class AreaMarking {
  final String id;
  final String projectId;
  final String createdBy;
  final MarkingType type;
  final String? label;
  final String? note;
  final List<LatLng> polygon;
  final double? areaHa;
  final bool isVisible;
  final DateTime createdAt;

  const AreaMarking({
    required this.id,
    required this.projectId,
    required this.createdBy,
    required this.type,
    this.label,
    this.note,
    required this.polygon,
    this.areaHa,
    this.isVisible = true,
    required this.createdAt,
  });

  factory AreaMarking.fromJson(Map<String, dynamic> j) {
    final gj = j['boundary_geojson'] as Map<String, dynamic>?;
    List<LatLng> coords = [];
    if (gj != null) {
      try {
        coords = (gj['coordinates'][0] as List)
            .cast<List<dynamic>>()
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
      } catch (_) {}
    }
    return AreaMarking(
      id: j['id'],
      projectId: j['project_id'],
      createdBy: j['created_by'],
      type: MarkingType.fromString(j['marking_type'] ?? 'custom'),
      label: j['label'],
      note: j['note'],
      polygon: coords,
      areaHa: (j['area_ha'] as num?)?.toDouble(),
      isVisible: j['is_visible'] ?? true,
      createdAt: DateTime.tryParse(j['created_at'] ?? '') ?? DateTime.now(),
    );
  }

  String get displayLabel => label?.isNotEmpty == true ? label! : type.label;
}

// ============================================================
// DoznakaProjekat — odabrani GJ+Odjel sa granicom
// ============================================================
class DoznakaProjekat {
  final String id;
  final String createdBy;
  final String gj;
  final String odjel;
  final Map<String, dynamic> boundaryGeojson;
  final double? totalAreaHa;
  final DateTime createdAt;

  const DoznakaProjekat({
    required this.id,
    required this.createdBy,
    required this.gj,
    required this.odjel,
    required this.boundaryGeojson,
    this.totalAreaHa,
    required this.createdAt,
  });

  factory DoznakaProjekat.fromJson(Map<String, dynamic> j) => DoznakaProjekat(
        id: j['id'],
        createdBy: j['created_by'],
        gj: j['gj'],
        odjel: j['odjel'],
        boundaryGeojson: j['boundary_geojson'] as Map<String, dynamic>,
        totalAreaHa: (j['total_area_ha'] as num?)?.toDouble(),
        createdAt: DateTime.parse(j['created_at']),
      );

  String get displayName => '$gj — Odjel $odjel';

  List<LatLng> get boundaryPoints {
    try {
      final type = boundaryGeojson['type'] as String;
      List<dynamic> rings;
      if (type == 'Polygon') {
        rings = [boundaryGeojson['coordinates'][0]];
      } else if (type == 'MultiPolygon') {
        // Uzmi sve prstene prvog poligona (aproksimacija za prikaz)
        rings = [boundaryGeojson['coordinates'][0][0]];
      } else {
        return [];
      }
      return (rings[0] as List)
          .cast<List<dynamic>>()
          .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
          .toList();
    } catch (_) {
      return [];
    }
  }

  // Svi prstenovi (za MultiPolygon prikaz na mapi)
  List<List<LatLng>> get allRings {
    try {
      final type = boundaryGeojson['type'] as String;
      if (type == 'Polygon') {
        final ring = (boundaryGeojson['coordinates'][0] as List)
            .cast<List<dynamic>>()
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
        return [ring];
      } else if (type == 'MultiPolygon') {
        return (boundaryGeojson['coordinates'] as List).map((poly) {
          return ((poly[0] as List).cast<List<dynamic>>())
              .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
              .toList();
        }).toList();
      }
    } catch (_) {}
    return [];
  }
}

// ============================================================
// DoznakaTrasa — jedna GPS šetnja (pojas)
// ============================================================
class DoznakaTrasa {
  final String id;
  final String projekatId;
  final String userId;
  final List<LatLng> track;       // GPS trag (polyline)
  final List<LatLng>? zona;       // Izračunata zona (buffer)
  final double? areaHa;
  final double? areaPct;
  final bool isLastStrip;
  final String status;            // 'active' | 'finished'
  final DateTime startedAt;
  final DateTime? finishedAt;
  final double? centroidLat;      // Za sortiranje pojaseva

  const DoznakaTrasa({
    required this.id,
    required this.projekatId,
    required this.userId,
    required this.track,
    this.zona,
    this.areaHa,
    this.areaPct,
    this.isLastStrip = false,
    required this.status,
    required this.startedAt,
    this.finishedAt,
    this.centroidLat,
  });

  factory DoznakaTrasa.fromJson(Map<String, dynamic> j) {
    List<LatLng> track = [];
    final tgj = j['track_geojson'] as Map<String, dynamic>?;
    if (tgj != null) {
      try {
        track = (tgj['coordinates'] as List)
            .cast<List<dynamic>>()
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
      } catch (_) {}
    }

    List<LatLng>? zona;
    final zgj = j['zona_geojson'] as Map<String, dynamic>?;
    if (zgj != null) {
      try {
        zona = (zgj['coordinates'][0] as List)
            .cast<List<dynamic>>()
            .map((c) => LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()))
            .toList();
      } catch (_) {}
    }

    return DoznakaTrasa(
      id: j['id'],
      projekatId: j['projekat_id'],
      userId: j['user_id'],
      track: track,
      zona: zona,
      areaHa: (j['area_ha'] as num?)?.toDouble(),
      areaPct: (j['area_pct'] as num?)?.toDouble(),
      isLastStrip: j['is_last_strip'] ?? false,
      status: j['status'] ?? 'active',
      startedAt: DateTime.parse(j['started_at']),
      finishedAt: j['finished_at'] != null ? DateTime.parse(j['finished_at']) : null,
      centroidLat: (j['centroid_lat'] as num?)?.toDouble(),
    );
  }

  bool get isFinished => status == 'finished';
}

// ============================================================
// KorisnikProfile — red iz korisnici tabele (sa sumarija poljem)
// ============================================================
class KorisnikProfile {
  final String id;
  final String ime;
  final String prezime;
  final String sumarija;
  final String boja;

  const KorisnikProfile({
    required this.id,
    required this.ime,
    required this.prezime,
    required this.sumarija,
    required this.boja,
  });

  factory KorisnikProfile.fromJson(Map<String, dynamic> j) => KorisnikProfile(
        id: j['id'],
        ime: j['ime'] ?? '',
        prezime: j['prezime'] ?? '',
        sumarija: j['sumarija'] ?? '',
        boja: j['boja'] ?? '#3B8BD4',
      );

  String get punoIme => '$ime $prezime'.trim();

  String get inicijali {
    final i = ime.isNotEmpty ? ime[0] : '';
    final p = prezime.isNotEmpty ? prezime[0] : '';
    return '$i$p'.toUpperCase();
  }

  Color get color {
    try {
      return Color(int.parse('FF${boja.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.blue;
    }
  }
}

// ============================================================
// DoznakaClan — projektant dodijeljen na doznaka projekat
// ============================================================
class DoznakaClan {
  final String id;
  final String projekatId;
  final String userId;
  final String boja;
  final DateTime dodanAt;
  final KorisnikProfile? profil;

  const DoznakaClan({
    required this.id,
    required this.projekatId,
    required this.userId,
    required this.boja,
    required this.dodanAt,
    this.profil,
  });

  factory DoznakaClan.fromJson(Map<String, dynamic> j) => DoznakaClan(
        id: j['id'],
        projekatId: j['projekat_id'],
        userId: j['user_id'],
        boja: j['boja'] ?? '#3B8BD4',
        dodanAt: DateTime.tryParse(j['dodan_at'] ?? '') ?? DateTime.now(),
        profil: j['korisnici'] != null
            ? KorisnikProfile.fromJson(j['korisnici'])
            : null,
      );

  String get displayName => profil?.punoIme ?? 'Projektant';
  String get inicijali => profil?.inicijali ?? '?';

  Color get color {
    try {
      return Color(int.parse('FF${boja.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.teal;
    }
  }
}

// ============================================================
// GeoJSON parser za odjel granice (za dropdown)
// ============================================================
class OdjelFeature {
  final String gj;
  final String odjel;
  final String? odsjek;
  final String? gazKlasa;
  final Map<String, dynamic> geometry;

  const OdjelFeature({
    required this.gj,
    required this.odjel,
    this.odsjek,
    this.gazKlasa,
    required this.geometry,
  });

  bool get isExcluded {
    if (gazKlasa == null) return false;
    return gazKlasa!.contains('8000') || gazKlasa! == '8000';
  }

  static List<OdjelFeature> parseGeojson(Map<String, dynamic> geojson) {
    final features = <OdjelFeature>[];
    try {
      final list = geojson['features'] as List;
      for (final f in list) {
        final props = f['properties'] as Map<String, dynamic>? ?? {};
        final gj = (props['GJ'] ?? props['gj'] ?? '').toString();
        final odjel = (props['ODJEL'] ?? props['odjel'] ?? '').toString();
        final odsjek = (props['ODSJEK'] ?? props['odsjek'])?.toString();
        final gazKlasa = (props['Gaz_Klasa_'] ?? props['GAZ_KLASA_'] ?? props['gaz_klasa'])?.toString();
        if (gj.isEmpty || odjel.isEmpty) continue;
        features.add(OdjelFeature(
          gj: gj,
          odjel: odjel,
          odsjek: odsjek,
          gazKlasa: gazKlasa,
          geometry: f['geometry'] as Map<String, dynamic>,
        ));
      }
    } catch (_) {}
    return features;
  }

  // Grupišu se GJ → lista odjela
  static Map<String, Set<String>> groupByGj(List<OdjelFeature> features) {
    final map = <String, Set<String>>{};
    for (final f in features) {
      map.putIfAbsent(f.gj, () => {}).add(f.odjel);
    }
    return map;
  }
}
