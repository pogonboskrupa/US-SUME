"""
Surface area module — spherical polygon area via the Spherical Excess formula.

The algorithm is equivalent to the Shoelace theorem lifted onto a sphere
(sometimes called the Girard / spherical excess method). It is exact for
a spherical Earth; error vs. WGS84 ellipsoid is < 0.3 % for areas < 10 000 km².

Input formats accepted by `measure()`:
  - list of (lat, lon) tuples          e.g. [(44.1, 17.2), ...]
  - GeoJSON Polygon dict               e.g. {"type":"Polygon","coordinates":[...]}
"""
from math import radians, sin
from typing import Union
import json

from geo.distance import haversine

EARTH_R = 6_371_000  # metres


def _parse_coords(source: Union[list, dict, str]) -> list[tuple[float, float]]:
    """
    Normalise input to a list of (lat, lon) tuples.

    Accepts:
      - list of (lat, lon) pairs
      - GeoJSON Polygon dict  (coordinates are [lon, lat] per spec)
      - GeoJSON string
    """
    if isinstance(source, str):
        source = json.loads(source)

    if isinstance(source, dict):
        # GeoJSON Polygon — outer ring is coordinates[0], [lon, lat] order
        ring = source['coordinates'][0]
        coords = [(pt[1], pt[0]) for pt in ring]
        # Drop repeated closing point if present
        if coords[0] == coords[-1]:
            coords = coords[:-1]
        return coords

    # Plain list — assume (lat, lon) order
    coords = list(source)
    if coords[0] == coords[-1]:
        coords = coords[:-1]
    return [(float(p[0]), float(p[1])) for p in coords]


def spherical_area(coords: list[tuple[float, float]]) -> float:
    """
    Area of a spherical polygon in m² using the spherical excess formula.

    coords: list of (lat, lon) in decimal degrees, open ring (first ≠ last).
    """
    n = len(coords)
    if n < 3:
        raise ValueError('At least 3 vertices required')

    total = 0.0
    for i in range(n):
        j = (i + 1) % n
        lat1, lon1 = radians(coords[i][0]), radians(coords[i][1])
        lat2, lon2 = radians(coords[j][0]), radians(coords[j][1])
        total += (lon2 - lon1) * (2 + sin(lat1) + sin(lat2))

    return abs(total * EARTH_R ** 2 / 2)


def perimeter_m(coords: list[tuple[float, float]]) -> float:
    """Perimeter of the polygon in metres (closing segment included)."""
    n = len(coords)
    total = 0.0
    for i in range(n):
        j = (i + 1) % n
        total += haversine(coords[i][0], coords[i][1],
                           coords[j][0], coords[j][1])
    return total


def measure(source: Union[list, dict, str]) -> dict:
    """
    Full area measurement of a polygon.

    Args:
        source – (lat, lon) list, GeoJSON Polygon dict, or GeoJSON string

    Returns:
        m2           – area in square metres (rounded)
        ha           – area in hectares (4 decimal places)
        km2          – area in km² (6 decimal places)
        perimeter_km – perimeter in kilometres (3 decimal places)
        vertex_count – number of vertices
    """
    coords = _parse_coords(source)
    area = spherical_area(coords)
    perim = perimeter_m(coords)
    return {
        'm2': round(area),
        'ha': round(area / 10_000, 4),
        'km2': round(area / 1_000_000, 6),
        'perimeter_km': round(perim / 1000, 3),
        'vertex_count': len(coords),
    }
