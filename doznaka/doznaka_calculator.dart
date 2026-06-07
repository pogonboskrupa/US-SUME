// lib/services/doznaka_calculator.dart
//
// Algoritam za računanje zona (pojaseva) doznake
// ─────────────────────────────────────────────────────────────
// Svaka trasa dobija zonu omeđenu:
//   • Donja granica: midline prema trasi ispod (ili granica poligona)
//   • Gornja granica: midline prema trasi iznad (ili granica poligona ako je zadnji pojas)
//   • Lijevo/desno:   granica odjela
//
// Trase se sortiraju po centroid_lat (od juga prema sjeveru).
// Midline = simetrala između centroida dva susjedna traga,
// proširena perpendikulrano do granica poligona.

import 'dart:math';
import 'package:latlong2/latlong.dart';
import '../models/models.dart';
import '../core/constants.dart';
import 'area_calculator.dart';

class DoznakaCalculator {
  // ============================================================
  // Izračunaj zone za sve trase u projektu
  // Vraća mapu: trasaId → zona polygon
  // ============================================================
  static List<({
    String trasaId,
    String userId,
    List<LatLng> zona,
    double areaHa,
    double areaPct,
  })> calculateZone({
    required List<LatLng> odjelBoundary,
    required List<DoznakaTrasa> trase,  // Samo 'finished' trase
    required double totalAreaHa,
  }) {
    if (trase.isEmpty || odjelBoundary.isEmpty) return [];

    // Sortiraj trase po latitude centroidu (dno → vrh)
    final sorted = List<DoznakaTrasa>.from(trase)
      ..sort((a, b) {
        final la = a.centroidLat ?? _trackCentroidLat(a.track);
        final lb = b.centroidLat ?? _trackCentroidLat(b.track);
        return la.compareTo(lb);
      });

    final n = sorted.length;
    final results = <({
      String trasaId,
      String userId,
      List<LatLng> zona,
      double areaHa,
      double areaPct,
    })>[];

    // Izračunaj midline za svaki par susjednih trasa
    final cuts = <List<LatLng>>[];
    for (int i = 0; i < n - 1; i++) {
      final cut = _midline(
        trackA: sorted[i].track,
        trackB: sorted[i + 1].track,
        boundary: odjelBoundary,
      );
      cuts.add(cut);
    }

    final totalHa = totalAreaHa > 0 ? totalAreaHa : _polygonAreaHa(odjelBoundary);

    for (int i = 0; i < n; i++) {
      final lowerCut = i == 0 ? null : cuts[i - 1];
      // Zadnji pojas (is_last_strip = true) ide do gornje granice
      final upperCut = (i == n - 1 || sorted[i].isLastStrip) ? null : cuts[i];

      final zona = _clipZone(
        boundary: odjelBoundary,
        lowerCut: lowerCut,
        upperCut: upperCut,
      );

      final areaHa = _polygonAreaHa(zona);
      final areaPct = totalHa > 0 ? (areaHa / totalHa) * 100 : 0.0;

      results.add((
        trasaId: sorted[i].id,
        userId: sorted[i].userId,
        zona: zona,
        areaHa: areaHa,
        areaPct: areaPct,
      ));
    }

    return results;
  }

  // ============================================================
  // Provjeri je li GPS pozicija blizu gornje granice odjela
  // Vraća true ako je unutar doznakaNearBoundaryM metara
  // ============================================================
  static bool isNearUpperBoundary({
    required LatLng position,
    required List<LatLng> odjelBoundary,
    required List<DoznakaTrasa> existingTrase,
  }) {
    if (odjelBoundary.isEmpty) return false;

    // "Gornja granica" = segment poligona sa najvećom prosječnom lat
    final upperSegments = _upperBoundarySegments(odjelBoundary, existingTrase);

    // Izračunaj minimalnu udaljenost od pozicije do gornje granice
    double minDist = double.infinity;
    for (int i = 0; i < upperSegments.length - 1; i++) {
      final d = _distToSegment(
        position,
        upperSegments[i],
        upperSegments[i + 1],
      );
      if (d < minDist) minDist = d;
    }

    return minDist <= AppConstants.doznakaNearBoundaryM;
  }

  // ── Privatne metode ──────────────────────────────────────

  static List<LatLng> _upperBoundarySegments(
    List<LatLng> boundary,
    List<DoznakaTrasa> existingTrase,
  ) {
    if (boundary.isEmpty) return boundary;
    if (existingTrase.isEmpty) return boundary;

    // Gornja granica = dio poligona iznad zadnje trase
    final lastTraseLat = existingTrase
        .where((t) => t.centroidLat != null)
        .map((t) => t.centroidLat!)
        .fold(double.negativeInfinity, max);

    // Uzmi segmente poligona koji su iznad zadnje trase
    final upper = boundary.where((p) => p.latitude > lastTraseLat).toList();
    return upper.isNotEmpty ? upper : boundary;
  }

  // Midline između dva traga (preuzeto iz AreaCalculator, prilagođeno)
  static List<LatLng> _midline({
    required List<LatLng> trackA,
    required List<LatLng> trackB,
    required List<LatLng> boundary,
  }) {
    if (trackA.isEmpty || trackB.isEmpty) return [];

    final centA = _centroid(trackA);
    final centB = _centroid(trackB);

    final mid = LatLng(
      (centA.latitude + centB.latitude) / 2,
      (centA.longitude + centB.longitude) / 2,
    );

    final dLat = centB.latitude - centA.latitude;
    final dLng = centB.longitude - centA.longitude;

    final perpLat = -dLng;
    final perpLng = dLat;

    final bb = _boundingBox(boundary);
    final scale = max(bb.latSpan, bb.lngSpan) * 2;

    final p1 = LatLng(mid.latitude + perpLat * scale, mid.longitude + perpLng * scale);
    final p2 = LatLng(mid.latitude - perpLat * scale, mid.longitude - perpLng * scale);

    return _intersectLineWithPolygon(p1, p2, boundary);
  }

  static List<LatLng> _clipZone({
    required List<LatLng> boundary,
    List<LatLng>? lowerCut,
    List<LatLng>? upperCut,
  }) {
    var polygon = List<LatLng>.from(boundary);

    if (lowerCut != null && lowerCut.length >= 2) {
      polygon = AreaCalculator.clipPolygonByLine(polygon, lowerCut[0], lowerCut[1], keepRight: true);
    }
    if (upperCut != null && upperCut.length >= 2) {
      polygon = AreaCalculator.clipPolygonByLine(polygon, upperCut[0], upperCut[1], keepRight: false);
    }

    return polygon;
  }

  static double _trackCentroidLat(List<LatLng> track) {
    if (track.isEmpty) return 0;
    return track.map((p) => p.latitude).reduce((a, b) => a + b) / track.length;
  }

  static LatLng _centroid(List<LatLng> pts) {
    if (pts.isEmpty) return const LatLng(0, 0);
    double lat = 0, lng = 0;
    for (final p in pts) {
      lat += p.latitude;
      lng += p.longitude;
    }
    return LatLng(lat / pts.length, lng / pts.length);
  }

  static double _polygonAreaHa(List<LatLng> polygon) {
    if (polygon.length < 3) return 0;
    const earthRadius = 6371000.0;
    final refLat = polygon.first.latitude * pi / 180;
    final cosLat = cos(refLat);
    double area = 0;
    final n = polygon.length;
    for (int i = 0; i < n; i++) {
      final p1 = polygon[i];
      final p2 = polygon[(i + 1) % n];
      final x1 = p1.longitude * pi / 180 * earthRadius * cosLat;
      final y1 = p1.latitude * pi / 180 * earthRadius;
      final x2 = p2.longitude * pi / 180 * earthRadius * cosLat;
      final y2 = p2.latitude * pi / 180 * earthRadius;
      area += x1 * y2 - x2 * y1;
    }
    return (area / 2).abs() / 10000;
  }

  static ({double minLat, double maxLat, double minLng, double maxLng,
      double latSpan, double lngSpan}) _boundingBox(List<LatLng> pts) {
    double minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (final p in pts) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    return (
      minLat: minLat, maxLat: maxLat,
      minLng: minLng, maxLng: maxLng,
      latSpan: maxLat - minLat,
      lngSpan: maxLng - minLng,
    );
  }

  static List<LatLng> _intersectLineWithPolygon(
      LatLng p1, LatLng p2, List<LatLng> polygon) {
    final intersections = <LatLng>[];
    final n = polygon.length;
    for (int i = 0; i < n; i++) {
      final a = polygon[i];
      final b = polygon[(i + 1) % n];
      final pt = _lineIntersect(p1, p2, a, b);
      if (pt != null) intersections.add(pt);
    }
    if (intersections.length < 2) {
      final bb = _boundingBox(polygon);
      return [
        LatLng(bb.minLat, (bb.minLng + bb.maxLng) / 2),
        LatLng(bb.maxLat, (bb.minLng + bb.maxLng) / 2),
      ];
    }
    return intersections.take(2).toList();
  }

  static LatLng? _lineIntersect(LatLng a1, LatLng a2, LatLng b1, LatLng b2) {
    final dax = a2.longitude - a1.longitude;
    final day = a2.latitude - a1.latitude;
    final dbx = b2.longitude - b1.longitude;
    final dby = b2.latitude - b1.latitude;
    final denom = dax * dby - day * dbx;
    if (denom.abs() < 1e-10) return null;
    final t = ((b1.longitude - a1.longitude) * dby -
            (b1.latitude - a1.latitude) * dbx) /
        denom;
    return LatLng(a1.latitude + t * day, a1.longitude + t * dax);
  }

  // Udaljenost tačke P od segmenta AB (u metrima, Haversine aproksimacija)
  static double _distToSegment(LatLng p, LatLng a, LatLng b) {
    final ax = a.longitude, ay = a.latitude;
    final bx = b.longitude, by = b.latitude;
    final px = p.longitude, py = p.latitude;

    final dx = bx - ax, dy = by - ay;
    if (dx == 0 && dy == 0) return _haversineDist(p, a);

    final t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    final tc = t.clamp(0.0, 1.0);
    final closest = LatLng(ay + tc * dy, ax + tc * dx);
    return _haversineDist(p, closest);
  }

  static double _haversineDist(LatLng a, LatLng b) {
    const r = 6371000.0;
    final dLat = (b.latitude - a.latitude) * pi / 180;
    final dLng = (b.longitude - a.longitude) * pi / 180;
    final sinDLat = sin(dLat / 2);
    final sinDLng = sin(dLng / 2);
    final h = sinDLat * sinDLat +
        cos(a.latitude * pi / 180) * cos(b.latitude * pi / 180) * sinDLng * sinDLng;
    return 2 * r * asin(sqrt(h));
  }
}
