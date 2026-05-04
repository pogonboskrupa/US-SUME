// lib/services/area_calculator.dart
//
// Algoritam za podjelu površine odjela između inženjera
// ─────────────────────────────────────────────────────
// Princip:
//  • Inž. 1 → od granice odjela do MIDLINE(1,2)
//  • Inž. 2 → od MIDLINE(1,2) do MIDLINE(2,3)
//  • Inž. N → od MIDLINE(N-1,N) do granice odjela
//
// MIDLINE između dva inženjera = locus tačaka podjednako
// udaljenih od oba traga (perpendicular bisector traga).
// Pojednostavljena verzija: koristimo konveksni omotač
// svih tačaka jednog inženjera, računamo centroid,
// a midline je simetrala između dva centroida,
// proširena do granica odjela i klipovana.

import 'dart:math';
import 'package:latlong2/latlong.dart';
import '../models/models.dart';

class AreaCalculator {
  // ============================================================
  // Glavna metoda: izračunaj zonu za svakog inženjera
  // ============================================================
  static List<({String userId, List<LatLng> polygon, double areaHa, double areaPct})>
      calculateZones({
    required List<LatLng> departmentBoundary,
    required List<EngineerTrack> tracks, // sortirani po orderIndex
    required double departmentAreaHa,
  }) {
    if (tracks.isEmpty || departmentBoundary.isEmpty) return [];

    // Ukupna površina odjela (ha) — iz katastra ili izračunata
    final totalArea = departmentAreaHa > 0
        ? departmentAreaHa
        : _polygonAreaHa(departmentBoundary);

    final n = tracks.length;
    final results = <({String userId, List<LatLng> polygon, double areaHa, double areaPct})>[];

    // Granice zona — "cuts" između inženjera
    // cuts[i] = linija koja odvaja inženjera i od inženjera i+1
    final cuts = <List<LatLng>>[];
    for (int i = 0; i < n - 1; i++) {
      final cut = _midline(
        trackA: tracks[i].polyline,
        trackB: tracks[i + 1].polyline,
        boundary: departmentBoundary,
      );
      cuts.add(cut);
    }

    // Klipuj svaku zonu
    for (int i = 0; i < n; i++) {
      final leftCut = i == 0 ? null : cuts[i - 1];
      final rightCut = i == n - 1 ? null : cuts[i];

      final zone = _clipZone(
        boundary: departmentBoundary,
        leftCut: leftCut,
        rightCut: rightCut,
      );

      final areaHa = _polygonAreaHa(zone);
      final areaPct = totalArea > 0 ? (areaHa / totalArea) * 100 : 0.0;

      results.add((
        userId: tracks[i].member.userId,
        polygon: zone,
        areaHa: areaHa,
        areaPct: areaPct,
      ));
    }

    return results;
  }

  // ============================================================
  // Midline između dva traga
  // Vraća listu tačaka koje formiraju granicu unutar poligona
  // ============================================================
  static List<LatLng> _midline({
    required List<LatLng> trackA,
    required List<LatLng> trackB,
    required List<LatLng> boundary,
  }) {
    if (trackA.isEmpty || trackB.isEmpty) return [];

    // Centroidi tragova
    final centA = _centroid(trackA);
    final centB = _centroid(trackB);

    // Midpoint između centroida
    final mid = LatLng(
      (centA.latitude + centB.latitude) / 2,
      (centA.longitude + centB.longitude) / 2,
    );

    // Smjer od A prema B
    final dLat = centB.latitude - centA.latitude;
    final dLng = centB.longitude - centA.longitude;

    // Perpendikular (rotacija 90°)
    final perpLat = -dLng;
    final perpLng = dLat;

    // Produži perpendikularan pravac do granica bounding boxa
    final bb = _boundingBox(boundary);
    final scale = max(bb.latSpan, bb.lngSpan) * 2;

    final p1 = LatLng(
      mid.latitude + perpLat * scale,
      mid.longitude + perpLng * scale,
    );
    final p2 = LatLng(
      mid.latitude - perpLat * scale,
      mid.longitude - perpLng * scale,
    );

    // Intersect sa granicom odjela
    return _intersectLineWithPolygon(p1, p2, boundary);
  }

  // ============================================================
  // Klipuj zonu odjela lijevo i desno od reznih linija
  // ============================================================
  static List<LatLng> _clipZone({
    required List<LatLng> boundary,
    List<LatLng>? leftCut,
    List<LatLng>? rightCut,
  }) {
    // Jednostavan pristup: koristimo Sutherland-Hodgman na polu-ravninama
    var polygon = List<LatLng>.from(boundary);

    if (leftCut != null && leftCut.length >= 2) {
      polygon = _clipPolygonByLine(polygon, leftCut[0], leftCut[1], keepRight: true);
    }
    if (rightCut != null && rightCut.length >= 2) {
      polygon = _clipPolygonByLine(polygon, rightCut[0], rightCut[1], keepRight: false);
    }

    return polygon;
  }

  // ============================================================
  // Sutherland-Hodgman: klipuj poligon jednom linijom
  // keepRight=true → zadržava tačke desno od linije (A→B)
  // ============================================================
  static List<LatLng> _clipPolygonByLine(
    List<LatLng> polygon,
    LatLng lineA,
    LatLng lineB, {
    required bool keepRight,
  }) {
    if (polygon.length < 3) return polygon;

    final result = <LatLng>[];
    final n = polygon.length;

    for (int i = 0; i < n; i++) {
      final current = polygon[i];
      final next = polygon[(i + 1) % n];

      final currentSide = _side(current, lineA, lineB);
      final nextSide = _side(next, lineA, lineB);

      final currentInside = keepRight ? currentSide >= 0 : currentSide <= 0;
      final nextInside = keepRight ? nextSide >= 0 : nextSide <= 0;

      if (currentInside) result.add(current);

      if (currentInside != nextInside) {
        final intersection = _lineIntersect(current, next, lineA, lineB);
        if (intersection != null) result.add(intersection);
      }
    }

    return result.length >= 3 ? result : polygon;
  }

  // ============================================================
  // Strana tačke P u odnosu na pravac A→B (cross product)
  // Pozitivno = lijevo, negativno = desno
  // ============================================================
  static double _side(LatLng p, LatLng a, LatLng b) {
    return (b.longitude - a.longitude) * (p.latitude - a.latitude) -
        (b.latitude - a.latitude) * (p.longitude - a.longitude);
  }

  // ============================================================
  // Presjek dva dužna odsječka
  // ============================================================
  static LatLng? _lineIntersect(
    LatLng a1, LatLng a2, LatLng b1, LatLng b2) {
    final dax = a2.longitude - a1.longitude;
    final day = a2.latitude - a1.latitude;
    final dbx = b2.longitude - b1.longitude;
    final dby = b2.latitude - b1.latitude;

    final denom = dax * dby - day * dbx;
    if (denom.abs() < 1e-10) return null; // Paralelni

    final t = ((b1.longitude - a1.longitude) * dby -
            (b1.latitude - a1.latitude) * dbx) /
        denom;

    return LatLng(
      a1.latitude + t * day,
      a1.longitude + t * dax,
    );
  }

  // ============================================================
  // Intersect beskonačnog pravca sa poligonom (vrati ulaz i izlaz)
  // ============================================================
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

    // Ako nema presjeka, vrati midpoint kao fallback
    if (intersections.length < 2) {
      final bb = _boundingBox(polygon);
      return [
        LatLng(bb.minLat, (bb.minLng + bb.maxLng) / 2),
        LatLng(bb.maxLat, (bb.minLng + bb.maxLng) / 2),
      ];
    }

    return intersections.take(2).toList();
  }

  // ============================================================
  // Centroid liste LatLng tačaka
  // ============================================================
  static LatLng _centroid(List<LatLng> points) {
    if (points.isEmpty) return const LatLng(0, 0);
    double lat = 0, lng = 0;
    for (final p in points) {
      lat += p.latitude;
      lng += p.longitude;
    }
    return LatLng(lat / points.length, lng / points.length);
  }

  // ============================================================
  // Površina poligona u hektarima (Shoelace formula)
  // Radi sa geografskim koordinatama (WGS84 aproksimacija)
  // ============================================================
  static double _polygonAreaHa(List<LatLng> polygon) {
    if (polygon.length < 3) return 0;

    // Pretvorba u metričke koordinate (Mercator aproksimacija)
    const earthRadius = 6371000.0; // m
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

    final areaSqM = (area / 2).abs();
    return areaSqM / 10000; // m² → ha
  }

  // ============================================================
  // Bounding box
  // ============================================================
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

  // ============================================================
  // Javna metoda za prikaz: površina traga inženjera
  // (konveksni omotač svih tačaka traga klipovan na odjel)
  // ============================================================
  static double trackCoveredAreaHa(List<LatLng> track, List<LatLng> boundary) {
    if (track.length < 3) return 0;
    final hull = _convexHull(track);
    final clipped = _clipPolygonByBoundary(hull, boundary);
    return _polygonAreaHa(clipped);
  }

  // ============================================================
  // Graham Scan konveksni omotač
  // ============================================================
  static List<LatLng> _convexHull(List<LatLng> points) {
    if (points.length < 3) return points;

    final sorted = List<LatLng>.from(points)
      ..sort((a, b) {
        final c = a.longitude.compareTo(b.longitude);
        return c != 0 ? c : a.latitude.compareTo(b.latitude);
      });

    final lower = <LatLng>[];
    for (final p in sorted) {
      while (lower.length >= 2 &&
          _cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.removeLast();
      }
      lower.add(p);
    }

    final upper = <LatLng>[];
    for (final p in sorted.reversed) {
      while (upper.length >= 2 &&
          _cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.removeLast();
      }
      upper.add(p);
    }

    lower.removeLast();
    upper.removeLast();
    return [...lower, ...upper];
  }

  static double _cross(LatLng o, LatLng a, LatLng b) {
    return (a.longitude - o.longitude) * (b.latitude - o.latitude) -
        (a.latitude - o.latitude) * (b.longitude - o.longitude);
  }

  static List<LatLng> _clipPolygonByBoundary(
      List<LatLng> subject, List<LatLng> clip) {
    var output = List<LatLng>.from(subject);
    final n = clip.length;

    for (int i = 0; i < n; i++) {
      if (output.isEmpty) return [];
      final input = List<LatLng>.from(output);
      output.clear();

      final edgeA = clip[i];
      final edgeB = clip[(i + 1) % n];

      for (int j = 0; j < input.length; j++) {
        final current = input[j];
        final prev = input[(j + input.length - 1) % input.length];

        final currentInside = _side(current, edgeA, edgeB) >= 0;
        final prevInside = _side(prev, edgeA, edgeB) >= 0;

        if (currentInside) {
          if (!prevInside) {
            final pt = _lineIntersect(prev, current, edgeA, edgeB);
            if (pt != null) output.add(pt);
          }
          output.add(current);
        } else if (prevInside) {
          final pt = _lineIntersect(prev, current, edgeA, edgeB);
          if (pt != null) output.add(pt);
        }
      }
    }

    return output;
  }
}
