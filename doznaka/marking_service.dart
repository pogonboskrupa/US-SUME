// lib/services/marking_service.dart
// CRUD za obilježene plohe (area markings)

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:latlong2/latlong.dart';
import '../core/constants.dart';
import '../models/models.dart';

class MarkingService {
  static SupabaseClient get _db => Supabase.instance.client;

  static const _table = 'area_markings';

  // ─── Dohvati sve plohe projekta ─────────────────────────
  static Future<List<AreaMarking>> getMarkings(String projectId) async {
    final data = await _db
        .from(_table)
        .select()
        .eq('project_id', projectId)
        .eq('is_visible', true)
        .order('created_at');
    return (data as List).map((j) => AreaMarking.fromJson(j)).toList();
  }

  // ─── Spremi novu plohu ───────────────────────────────────
  static Future<AreaMarking> createMarking({
    required String projectId,
    required MarkingType type,
    required List<LatLng> polygon,
    String? label,
    String? note,
  }) async {
    final userId = _db.auth.currentUser!.id;
    final geojson = _polygonToGeoJson(polygon);

    final data = await _db.from(_table).insert({
      'project_id': projectId,
      'created_by': userId,
      'marking_type': type.dbValue,
      'label': label,
      'note': note,
      'boundary_geojson': geojson,
      'is_visible': true,
    }).select().single();

    return AreaMarking.fromJson(data);
  }

  // ─── Ažuriraj plohu ─────────────────────────────────────
  static Future<void> updateMarking({
    required String id,
    String? label,
    String? note,
    MarkingType? type,
  }) async {
    await _db.from(_table).update({
      if (label != null) 'label': label,
      if (note != null) 'note': note,
      if (type != null) 'marking_type': type.dbValue,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', id);
  }

  // ─── Obriši plohu (soft delete) ──────────────────────────
  static Future<void> deleteMarking(String id) async {
    await _db.from(_table).update({
      'is_visible': false,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('id', id);
  }

  // ─── Tvrdo brisanje ─────────────────────────────────────
  static Future<void> hardDeleteMarking(String id) async {
    await _db.from(_table).delete().eq('id', id);
  }

  // ─── Realtime stream ─────────────────────────────────────
  static Stream<List<Map<String, dynamic>>> markingsStream(
          String projectId) =>
      _db
          .from(_table)
          .stream(primaryKey: ['id'])
          .eq('project_id', projectId)
          .order('created_at');

  // ─── GeoJSON konverzija ──────────────────────────────────
  static Map<String, dynamic> _polygonToGeoJson(List<LatLng> pts) {
    final coords = [
      [
        ...pts.map((p) => [p.longitude, p.latitude]),
        [pts.first.longitude, pts.first.latitude], // zatvori ring
      ]
    ];
    return {'type': 'Polygon', 'coordinates': coords};
  }
}
