// lib/services/doznaka_service.dart
// CRUD + stream operacije za doznaka sistem

import 'dart:math';
import 'package:latlong2/latlong.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/constants.dart';
import '../models/models.dart';

class DoznakaService {
  static SupabaseClient get _db => Supabase.instance.client;
  static String? get _uid => _db.auth.currentUser?.id;

  // ── PROJEKTI ─────────────────────────────────────────────

  /// Dohvati sve doznaka projekte trenutnog korisnika
  static Future<List<DoznakaProjekat>> getMojeProjekte() async {
    if (_uid == null) return [];
    final data = await _db
        .from(AppConstants.tDoznakaProj)
        .select()
        .eq('created_by', _uid!)
        .order('created_at', ascending: false);
    return (data as List).map((j) => DoznakaProjekat.fromJson(j)).toList();
  }

  /// Kreiraj novi doznaka projekat (GJ + Odjel sa spojenom granicom)
  static Future<DoznakaProjekat> createProjekat({
    required String gj,
    required String odjel,
    required Map<String, dynamic> boundaryGeojson,
    double? totalAreaHa,
  }) async {
    final data = await _db
        .from(AppConstants.tDoznakaProj)
        .insert({
          'created_by': _uid!,
          'gj': gj,
          'odjel': odjel,
          'boundary_geojson': boundaryGeojson,
          'total_area_ha': totalAreaHa,
        })
        .select()
        .single();
    return DoznakaProjekat.fromJson(data);
  }

  static Future<void> deleteProjekat(String projekatId) async {
    await _db
        .from(AppConstants.tDoznakaProj)
        .delete()
        .eq('id', projekatId);
  }

  // ── TRASA ────────────────────────────────────────────────

  /// Dohvati sve završene trase za projekat (sortirano po latitude centroidu)
  static Future<List<DoznakaTrasa>> getTrase(String projekatId) async {
    final data = await _db
        .from(AppConstants.tDoznakaTrasa)
        .select()
        .eq('projekat_id', projekatId)
        .order('centroid_lat', ascending: true);
    return (data as List).map((j) => DoznakaTrasa.fromJson(j)).toList();
  }

  /// Stream završenih trasa (realtime ažuriranje zone na mapi)
  static Stream<List<Map<String, dynamic>>> traseStream(String projekatId) =>
      _db
          .from(AppConstants.tDoznakaTrasa)
          .stream(primaryKey: ['id'])
          .eq('projekat_id', projekatId);

  /// Pokreni novu trasu — vraća ID nove trase
  static Future<String> startTrasa(String projekatId) async {
    final data = await _db
        .from(AppConstants.tDoznakaTrasa)
        .insert({
          'projekat_id': projekatId,
          'user_id': _uid!,
          'status': 'active',
        })
        .select('id')
        .single();
    return data['id'] as String;
  }

  /// Dodaj GPS tačku na aktivnu trasu
  static Future<void> addTacka({
    required String trasaId,
    required double lat,
    required double lng,
    double? altitude,
    double? accuracy,
    double? speed,
  }) async {
    await _db.from(AppConstants.tDoznakaTacke).insert({
      'trasa_id': trasaId,
      'user_id': _uid!,
      'latitude': lat,
      'longitude': lng,
      'altitude': altitude,
      'accuracy': accuracy,
      'speed': speed,
      'recorded_at': DateTime.now().toIso8601String(),
    });
  }

  /// Dohvati GPS tačke trase
  static Future<List<LatLng>> getTackeTrase(String trasaId) async {
    final data = await _db
        .from(AppConstants.tDoznakaTacke)
        .select('latitude,longitude')
        .eq('trasa_id', trasaId)
        .order('recorded_at');
    return (data as List)
        .map((j) => LatLng(
              (j['latitude'] as num).toDouble(),
              (j['longitude'] as num).toDouble(),
            ))
        .toList();
  }

  /// Završi trasu: sačuvaj track GeoJSON, centroid lat, status
  static Future<void> finishTrasa({
    required String trasaId,
    required List<LatLng> points,
    bool isLastStrip = false,
  }) async {
    if (points.isEmpty) return;

    final trackGj = _toLineStringGeoJson(points);
    final centLat = points.map((p) => p.latitude).reduce((a, b) => a + b) / points.length;

    await _db.from(AppConstants.tDoznakaTrasa).update({
      'track_geojson': trackGj,
      'centroid_lat': centLat,
      'is_last_strip': isLastStrip,
      'status': 'finished',
      'finished_at': DateTime.now().toIso8601String(),
    }).eq('id', trasaId);
  }

  /// Sačuvaj izračunatu zonu na trasi
  static Future<void> saveZona({
    required String trasaId,
    required List<LatLng> zonaPolygon,
    required double areaHa,
    required double areaPct,
  }) async {
    final zonaGj = _toPolygonGeoJson(zonaPolygon);
    await _db.from(AppConstants.tDoznakaTrasa).update({
      'zona_geojson': zonaGj,
      'area_ha': areaHa,
      'area_pct': areaPct,
    }).eq('id', trasaId);
  }

  // ── GeoJSON helpers ──────────────────────────────────────

  static Map<String, dynamic> _toLineStringGeoJson(List<LatLng> pts) => {
        'type': 'LineString',
        'coordinates': pts.map((p) => [p.longitude, p.latitude]).toList(),
      };

  static Map<String, dynamic> _toPolygonGeoJson(List<LatLng> pts) {
    final coords = pts.map((p) => [p.longitude, p.latitude]).toList();
    if (coords.isNotEmpty &&
        (coords.first[0] != coords.last[0] || coords.first[1] != coords.last[1])) {
      coords.add(coords.first); // zatvori prsten
    }
    return {
      'type': 'Polygon',
      'coordinates': [coords],
    };
  }

  // ── Merge odsjeka u odjel granicu ────────────────────────

  /// Spoji sve odsjeke jednog odjela u jedan MultiPolygon GeoJSON
  /// Isključuje odsjeke gdje Gaz_Klasa_ sadrži '8000'
  static Map<String, dynamic> mergeOdsjeci(List<OdjelFeature> odsjeci) {
    final filtered = odsjeci.where((f) => !f.isExcluded).toList();
    if (filtered.isEmpty) {
      return {'type': 'MultiPolygon', 'coordinates': []};
    }

    // Ako je samo jedan — vrati kao Polygon (lakše za obradu)
    if (filtered.length == 1) {
      final geom = filtered.first.geometry;
      if (geom['type'] == 'Polygon') return geom;
      return geom;
    }

    // Više odsjeka → MultiPolygon
    final polys = <List<dynamic>>[];
    for (final f in filtered) {
      final geom = f.geometry;
      if (geom['type'] == 'Polygon') {
        polys.add(geom['coordinates']);
      } else if (geom['type'] == 'MultiPolygon') {
        for (final p in geom['coordinates'] as List) {
          polys.add(p as List<dynamic>);
        }
      }
    }

    return {'type': 'MultiPolygon', 'coordinates': polys};
  }

  /// Izračunaj ukupnu površinu svih odsjeka (ha) koristeći Shoelace formulu
  static double calcTotalAreaHa(List<OdjelFeature> odsjeci) {
    double total = 0;
    for (final f in odsjeci.where((f) => !f.isExcluded)) {
      total += _geomAreaHa(f.geometry);
    }
    return total;
  }

  static double _geomAreaHa(Map<String, dynamic> geom) {
    try {
      if (geom['type'] == 'Polygon') {
        final ring = (geom['coordinates'][0] as List).cast<List<dynamic>>();
        return _ringAreaHa(ring);
      } else if (geom['type'] == 'MultiPolygon') {
        double a = 0;
        for (final poly in geom['coordinates'] as List) {
          final ring = ((poly as List)[0] as List).cast<List<dynamic>>();
          a += _ringAreaHa(ring);
        }
        return a;
      }
    } catch (_) {}
    return 0;
  }

  // ── CLANOVI ──────────────────────────────────────────────

  /// Lista projektanata na projektu (sa profilom iz korisnici)
  static Future<List<DoznakaClan>> getClanove(String projekatId) async {
    final data = await _db
        .from(AppConstants.tDoznakaClanovi)
        .select('*, korisnici(*)')
        .eq('projekat_id', projekatId)
        .order('dodan_at');
    return (data as List).map((j) => DoznakaClan.fromJson(j)).toList();
  }

  static Stream<List<Map<String, dynamic>>> clanoviStream(String projekatId) =>
      _db
          .from(AppConstants.tDoznakaClanovi)
          .stream(primaryKey: ['id'])
          .eq('projekat_id', projekatId);

  static Future<void> addClan({
    required String projekatId,
    required String userId,
    required String boja,
  }) async {
    await _db.from(AppConstants.tDoznakaClanovi).insert({
      'projekat_id': projekatId,
      'user_id': userId,
      'boja': boja,
    });
  }

  static Future<void> removeClan(String projekatId, String userId) async {
    await _db
        .from(AppConstants.tDoznakaClanovi)
        .delete()
        .eq('projekat_id', projekatId)
        .eq('user_id', userId);
  }

  static double _ringAreaHa(List<List<dynamic>> ring) {
    const earthRadius = 6371000.0;
    final refLat = (ring.first[1] as num).toDouble() * pi / 180;
    final cosLat = cos(refLat);
    double area = 0;
    final n = ring.length;
    for (int i = 0; i < n; i++) {
      final p1 = ring[i];
      final p2 = ring[(i + 1) % n];
      final x1 = (p1[0] as num).toDouble() * pi / 180 * earthRadius * cosLat;
      final y1 = (p1[1] as num).toDouble() * pi / 180 * earthRadius;
      final x2 = (p2[0] as num).toDouble() * pi / 180 * earthRadius * cosLat;
      final y2 = (p2[1] as num).toDouble() * pi / 180 * earthRadius;
      area += x1 * y2 - x2 * y1;
    }
    return (area / 2).abs() / 10000;
  }
}
