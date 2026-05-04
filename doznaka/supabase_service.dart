// lib/services/supabase_service.dart

import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/constants.dart';
import '../models/models.dart';
import 'geo_parser.dart';

class SupabaseService {
  static SupabaseClient get _db => Supabase.instance.client;

  static User? get currentUser => _db.auth.currentUser;
  static String? get currentUserId => currentUser?.id;

  // ── AUTH ────────────────────────────────────────────────
  static Future<AuthResponse> signIn(String email, String password) =>
      _db.auth.signInWithPassword(email: email, password: password);

  static Future<AuthResponse> signUp({
    required String email,
    required String password,
    required String fullName,
  }) =>
      _db.auth.signUp(
          email: email,
          password: password,
          data: {'full_name': fullName});

  static Future<void> signOut() => _db.auth.signOut();
  static Stream<AuthState> get authStream => _db.auth.onAuthStateChange;

  // ── PROFIL ──────────────────────────────────────────────
  static Future<UserProfile?> getProfile(String userId) async {
    final data = await _db
        .from(AppConstants.tProfiles)
        .select()
        .eq('id', userId)
        .maybeSingle();
    return data != null ? UserProfile.fromJson(data) : null;
  }

  static Future<List<UserProfile>> searchUsers(String query) async {
    final data = await _db
        .from(AppConstants.tProfiles)
        .select()
        .or('email.ilike.%$query%,full_name.ilike.%$query%')
        .neq('id', currentUserId ?? 'none')
        .limit(10);
    return (data as List).map((j) => UserProfile.fromJson(j)).toList();
  }

  // ── PROJEKTI ────────────────────────────────────────────
  static Future<List<Project>> getMyProjects() async {
    if (currentUserId == null) return [];
    final data = await _db
        .from(AppConstants.tProjects)
        .select()
        .order('created_at', ascending: false);
    return (data as List).map((j) => Project.fromJson(j)).toList();
  }

  static Future<Project?> getProject(String projectId) async {
    final data = await _db
        .from(AppConstants.tProjects)
        .select()
        .eq('id', projectId)
        .maybeSingle();
    return data != null ? Project.fromJson(data) : null;
  }

  static Future<Project> createProject({
    required String name,
    String? description,
    Map<String, dynamic>? boundaryGeojson,
    double? knownAreaHa,
  }) async {
    final userId = currentUserId!;
    final data = await _db.from(AppConstants.tProjects).insert({
      'name': name,
      'description': description,
      'created_by': userId,
      'boundary_geojson': boundaryGeojson,
      'known_area_ha': knownAreaHa,
      'status': 'active',
    }).select().single();

    final project = Project.fromJson(data);
    await addMember(
      projectId: project.id,
      userId: userId,
      role: 'manager',
      color: AppConstants.engineerColors[0],
      orderIndex: 0,
    );
    return project;
  }

  static Future<void> updateProjectBoundary(
      String projectId, List<dynamic> coords, double? areaHa) async {
    final geojson = GeoParser.toGeoJson(coords.cast());
    await _db.from(AppConstants.tProjects).update({
      'boundary_geojson': geojson,
      if (areaHa != null) 'known_area_ha': areaHa,
    }).eq('id', projectId);
  }

  // ── ČLANOVI ─────────────────────────────────────────────
  static Future<List<ProjectMember>> getMembers(
      String projectId) async {
    final data = await _db
        .from(AppConstants.tMembers)
        .select('*, profiles(*)')
        .eq('project_id', projectId)
        .order('order_index');
    return (data as List)
        .map((j) => ProjectMember.fromJson(j))
        .toList();
  }

  static Future<void> addMember({
    required String projectId,
    required String userId,
    String role = 'engineer',
    required String color,
    required int orderIndex,
  }) async {
    await _db.from(AppConstants.tMembers).upsert({
      'project_id': projectId,
      'user_id': userId,
      'role': role,
      'track_color': color,
      'order_index': orderIndex,
      'is_active': true,
    });
  }

  static Future<void> removeMember(
      String projectId, String userId) async {
    await _db
        .from(AppConstants.tMembers)
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);
  }

  static Future<void> updateMemberRole(
      String memberId, String role) async {
    await _db
        .from(AppConstants.tMembers)
        .update({'role': role}).eq('id', memberId);
  }

  static Future<void> updateMemberColor(
      String memberId, String colorHex) async {
    await _db
        .from(AppConstants.tMembers)
        .update({'track_color': colorHex}).eq('id', memberId);
  }

  static Future<void> updateMemberOrder(
      String memberId, int newOrder) async {
    await _db
        .from(AppConstants.tMembers)
        .update({'order_index': newOrder}).eq('id', memberId);
  }

  // ── TRACK POINTS ────────────────────────────────────────
  static Future<List<TrackPoint>> getAllTrackPoints(
      String projectId) async {
    final data = await _db
        .from(AppConstants.tTrackPoints)
        .select()
        .eq('project_id', projectId)
        .order('recorded_at');
    return (data as List).map((j) => TrackPoint.fromJson(j)).toList();
  }

  static Stream<List<Map<String, dynamic>>> trackPointsStream(
          String projectId) =>
      _db
          .from(AppConstants.tTrackPoints)
          .stream(primaryKey: ['id'])
          .eq('project_id', projectId)
          .order('recorded_at');

  // ── ZONE ────────────────────────────────────────────────
  static Future<void> upsertZone({
    required String projectId,
    required String userId,
    required Map<String, dynamic> zoneGeojson,
    required double areaHa,
    required double areaPct,
  }) async {
    await _db.from(AppConstants.tZones).upsert({
      'project_id': projectId,
      'user_id': userId,
      'zone_geojson': zoneGeojson,
      'area_ha': areaHa,
      'area_pct': areaPct,
      'calculated_at': DateTime.now().toIso8601String(),
    }, onConflict: 'project_id,user_id');
  }

  static Stream<List<Map<String, dynamic>>> zonesStream(
          String projectId) =>
      _db
          .from(AppConstants.tZones)
          .stream(primaryKey: ['id'])
          .eq('project_id', projectId);
}
