// lib/services/geo_parser.dart
// Parser za KML i GeoJSON fajlove granica odjela

import 'dart:convert';
import 'package:latlong2/latlong.dart';
import 'package:xml/xml.dart';

class GeoParser {
  // ============================================================
  // Auto-detect format i parsiraj
  // ============================================================
  static GeoParseResult? parse(String content, String filename) {
    final ext = filename.toLowerCase().split('.').last;
    try {
      if (ext == 'kml') return parseKml(content);
      if (ext == 'geojson' || ext == 'json') return parseGeoJson(content);
    } catch (e) {
      // Pokušaj automatski detect
      if (content.trimLeft().startsWith('<')) return parseKml(content);
      if (content.trimLeft().startsWith('{')) return parseGeoJson(content);
    }
    return null;
  }

  // ============================================================
  // KML Parser
  // ============================================================
  static GeoParseResult parseKml(String kmlContent) {
    final doc = XmlDocument.parse(kmlContent);
    final polygons = <GeoPolygon>[];

    // Traži sve Placemark elemente
    for (final placemark in doc.findAllElements('Placemark')) {
      final name = placemark.findElements('name').firstOrNull?.innerText ?? 'Odjel';

      // Polygon koordinate
      for (final polygon in placemark.findAllElements('Polygon')) {
        final outerRing = polygon
            .findAllElements('outerBoundaryIs')
            .firstOrNull
            ?.findAllElements('LinearRing')
            .firstOrNull
            ?.findAllElements('coordinates')
            .firstOrNull
            ?.innerText;

        if (outerRing != null) {
          final coords = _parseKmlCoordinates(outerRing);
          if (coords.isNotEmpty) {
            polygons.add(GeoPolygon(name: name, coordinates: coords));
          }
        }
      }

      // LineString (ako nije polygon, konvertuj)
      for (final line in placemark.findAllElements('LineString')) {
        final coordsText = line.findAllElements('coordinates').firstOrNull?.innerText;
        if (coordsText != null) {
          final coords = _parseKmlCoordinates(coordsText);
          if (coords.length >= 3) {
            polygons.add(GeoPolygon(name: name, coordinates: coords));
          }
        }
      }
    }

    if (polygons.isEmpty) {
      throw const FormatException('KML ne sadrži poligone');
    }

    return GeoParseResult(polygons: polygons, format: 'KML');
  }

  static List<LatLng> _parseKmlCoordinates(String raw) {
    final result = <LatLng>[];
    for (final triplet in raw.trim().split(RegExp(r'\s+'))) {
      final parts = triplet.split(',');
      if (parts.length >= 2) {
        final lng = double.tryParse(parts[0].trim());
        final lat = double.tryParse(parts[1].trim());
        if (lat != null && lng != null) {
          result.add(LatLng(lat, lng));
        }
      }
    }
    return result;
  }

  // ============================================================
  // GeoJSON Parser
  // ============================================================
  static GeoParseResult parseGeoJson(String jsonContent) {
    final data = jsonDecode(jsonContent) as Map<String, dynamic>;
    final polygons = <GeoPolygon>[];

    if (data['type'] == 'FeatureCollection') {
      final features = (data['features'] as List).cast<Map<String, dynamic>>();
      for (final feature in features) {
        final parsed = _parseGeoJsonFeature(feature);
        polygons.addAll(parsed);
      }
    } else if (data['type'] == 'Feature') {
      polygons.addAll(_parseGeoJsonFeature(data));
    } else if (data['type'] == 'Polygon') {
      final coords = _parseGeoJsonPolygonCoords(data['coordinates']);
      if (coords.isNotEmpty) {
        polygons.add(GeoPolygon(name: 'Odjel', coordinates: coords));
      }
    }

    if (polygons.isEmpty) {
      throw const FormatException('GeoJSON ne sadrži poligone');
    }

    return GeoParseResult(polygons: polygons, format: 'GeoJSON');
  }

  static List<GeoPolygon> _parseGeoJsonFeature(Map<String, dynamic> feature) {
    final result = <GeoPolygon>[];
    final props = feature['properties'] as Map<String, dynamic>? ?? {};
    final name = props['name']?.toString() ??
        props['naziv']?.toString() ??
        props['odjel']?.toString() ??
        'Odjel';
    final geometry = feature['geometry'] as Map<String, dynamic>?;
    if (geometry == null) return result;

    if (geometry['type'] == 'Polygon') {
      final coords = _parseGeoJsonPolygonCoords(geometry['coordinates']);
      if (coords.isNotEmpty) {
        result.add(GeoPolygon(name: name, coordinates: coords));
      }
    } else if (geometry['type'] == 'MultiPolygon') {
      final multiCoords =
          (geometry['coordinates'] as List).cast<List<dynamic>>();
      for (final poly in multiCoords) {
        final coords = _parseGeoJsonPolygonCoords(poly);
        if (coords.isNotEmpty) {
          result.add(GeoPolygon(name: name, coordinates: coords));
        }
      }
    }

    return result;
  }

  static List<LatLng> _parseGeoJsonPolygonCoords(dynamic rawCoords) {
    try {
      // Uzmi vanjski ring (index 0)
      final ring = (rawCoords as List)[0] as List;
      return ring.map((c) {
        final coord = c as List;
        return LatLng(
          (coord[1] as num).toDouble(),
          (coord[0] as num).toDouble(),
        );
      }).toList();
    } catch (_) {
      return [];
    }
  }

  // ============================================================
  // Konvertuj GeoPolygon u GeoJSON format za Supabase
  // ============================================================
  static Map<String, dynamic> toGeoJson(List<LatLng> polygon) {
    final coords = [
      [
        ...polygon.map((p) => [p.longitude, p.latitude]),
        // Zatvori polygon (prvi = zadnji)
        [polygon.first.longitude, polygon.first.latitude],
      ]
    ];
    return {'type': 'Polygon', 'coordinates': coords};
  }
}

// ============================================================
// Result klase
// ============================================================
class GeoParseResult {
  final List<GeoPolygon> polygons;
  final String format;

  const GeoParseResult({required this.polygons, required this.format});

  GeoPolygon get first => polygons.first;
  bool get hasSingle => polygons.length == 1;
}

class GeoPolygon {
  final String name;
  final List<LatLng> coordinates;

  const GeoPolygon({required this.name, required this.coordinates});

  // Aproksimativna površina u hektarima
  double get approximateAreaHa {
    if (coordinates.length < 3) return 0;
    // Grubo: bounding box
    double minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (final c in coordinates) {
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
      if (c.longitude < minLng) minLng = c.longitude;
      if (c.longitude > maxLng) maxLng = c.longitude;
    }
    const mPerDeg = 111320.0;
    final w = (maxLng - minLng) * mPerDeg;
    final h = (maxLat - minLat) * mPerDeg;
    return (w * h) / 10000;
  }
}
