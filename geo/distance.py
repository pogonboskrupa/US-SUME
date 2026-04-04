"""
Distance module — Haversine formula on a spherical Earth.
Precision matches AlpineQuest: metres rounded to 0 decimals, degrees to 1.
"""
from math import radians, sin, cos, sqrt, atan2, degrees

EARTH_R = 6_371_000  # metres (mean spherical radius)

_COMPASS = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres between two WGS84 points."""
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlam = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlam / 2) ** 2
    return 2 * EARTH_R * atan2(sqrt(a), sqrt(1 - a))


def bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Forward bearing from point 1 to point 2, normalised 0–360°."""
    phi1, phi2 = radians(lat1), radians(lat2)
    dlam = radians(lon2 - lon1)
    y = sin(dlam) * cos(phi2)
    x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dlam)
    return (degrees(atan2(y, x)) + 360) % 360


def compass_label(bearing_deg: float) -> str:
    """Convert a bearing in degrees to the nearest 16-point compass label."""
    return _COMPASS[round(bearing_deg / 22.5) % 16]


def measure(lat1: float, lon1: float, lat2: float, lon2: float) -> dict:
    """
    Full distance measurement between two points.

    Returns:
        metres       – distance rounded to nearest metre
        km           – distance in kilometres (3 decimal places)
        bearing_deg  – forward bearing 0–360° (1 decimal)
        bearing_label – compass rose label (N, NNE, …)
    """
    d = haversine(lat1, lon1, lat2, lon2)
    b = bearing(lat1, lon1, lat2, lon2)
    return {
        'metres': round(d),
        'km': round(d / 1000, 3),
        'bearing_deg': round(b, 1),
        'bearing_label': compass_label(b),
    }
