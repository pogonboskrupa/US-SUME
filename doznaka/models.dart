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
