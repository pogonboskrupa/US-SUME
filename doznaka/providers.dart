// lib/providers/providers.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:latlong2/latlong.dart';
import '../models/models.dart';
import '../services/supabase_service.dart';
import '../services/area_calculator.dart';

// ── AUTH ─────────────────────────────────────────────────
final authStateProvider = StreamProvider<AuthState>((ref) {
  return SupabaseService.authStream;
});

final currentUserProvider = Provider<User?>((ref) {
  return SupabaseService.currentUser;
});

final currentProfileProvider = FutureProvider<UserProfile?>((ref) async {
  final userId = SupabaseService.currentUserId;
  if (userId == null) return null;
  return SupabaseService.getProfile(userId);
});

// ── PROJEKTI ─────────────────────────────────────────────
final projectsProvider = FutureProvider<List<Project>>((ref) async {
  ref.watch(authStateProvider);
  return SupabaseService.getMyProjects();
});

final projectProvider =
    FutureProvider.family<Project?, String>((ref, id) async {
  return SupabaseService.getProject(id);
});

// ── TRACKING STATE ───────────────────────────────────────
class TrackingState {
  final bool isTracking;
  final Map<String, List<TrackPoint>> tracksByUser;
  final Map<String, LatLng> currentPositions;
  final int totalPoints;

  const TrackingState({
    this.isTracking = false,
    this.tracksByUser = const {},
    this.currentPositions = const {},
    this.totalPoints = 0,
  });

  TrackingState copyWith({
    bool? isTracking,
    Map<String, List<TrackPoint>>? tracksByUser,
    Map<String, LatLng>? currentPositions,
    int? totalPoints,
  }) =>
      TrackingState(
        isTracking: isTracking ?? this.isTracking,
        tracksByUser: tracksByUser ?? this.tracksByUser,
        currentPositions: currentPositions ?? this.currentPositions,
        totalPoints: totalPoints ?? this.totalPoints,
      );
}

class TrackingNotifier extends StateNotifier<TrackingState> {
  TrackingNotifier() : super(const TrackingState());

  void loadPoints(List<TrackPoint> all) {
    final byUser = <String, List<TrackPoint>>{};
    final positions = <String, LatLng>{};
    for (final p in all) {
      byUser.putIfAbsent(p.userId, () => []).add(p);
      positions[p.userId] = p.latLng;
    }
    state = state.copyWith(
      tracksByUser: byUser,
      currentPositions: positions,
      totalPoints: all.length,
    );
  }

  void setTracking(bool v) => state = state.copyWith(isTracking: v);
}

final trackingProvider =
    StateNotifierProvider<TrackingNotifier, TrackingState>(
        (_) => TrackingNotifier());

// ── ZONES STATE ──────────────────────────────────────────
class ZoneEntry {
  final String userId;
  final String color;
  final List<LatLng> polygon;
  final double areaHa;
  final double areaPct;

  const ZoneEntry({
    required this.userId,
    required this.color,
    required this.polygon,
    required this.areaHa,
    required this.areaPct,
  });
}

class ZonesState {
  final List<ZoneEntry> zones;
  const ZonesState({this.zones = const []});
}

class ZonesNotifier extends StateNotifier<ZonesState> {
  ZonesNotifier() : super(const ZonesState());

  void recalculate({
    required List<LatLng> boundary,
    required List<ProjectMember> members,
    required Map<String, List<TrackPoint>> tracksByUser,
    required double knownAreaHa,
  }) {
    if (boundary.isEmpty || members.isEmpty) return;

    final sorted = List<ProjectMember>.from(members)
      ..sort((a, b) => a.orderIndex.compareTo(b.orderIndex));

    final activeTracks = sorted
        .where((m) =>
            tracksByUser.containsKey(m.userId) &&
            tracksByUser[m.userId]!.isNotEmpty)
        .map((m) => EngineerTrack(
              member: m,
              points: tracksByUser[m.userId]!,
            ))
        .toList();

    if (activeTracks.isEmpty) return;

    final calculated = AreaCalculator.calculateZones(
      departmentBoundary: boundary,
      tracks: activeTracks,
      departmentAreaHa: knownAreaHa,
    );

    state = ZonesState(
      zones: calculated.map((z) {
        final m = sorted.firstWhere((m) => m.userId == z.userId,
            orElse: () => sorted.first);
        return ZoneEntry(
          userId: z.userId,
          color: m.trackColor,
          polygon: z.polygon,
          areaHa: z.areaHa,
          areaPct: z.areaPct,
        );
      }).toList(),
    );
  }
}

final zonesProvider =
    StateNotifierProvider<ZonesNotifier, ZonesState>(
        (_) => ZonesNotifier());

// ── USER SEARCH ──────────────────────────────────────────
final userSearchProvider =
    FutureProvider.family<List<UserProfile>, String>((ref, q) async {
  if (q.length < 2) return [];
  return SupabaseService.searchUsers(q);
});
