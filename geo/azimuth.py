"""
Azimuth module — forward & back azimuth, compass label, magnetic declination.

Magnetic declination uses a tilted-geocentric-dipole approximation
(accuracy ±3–5° globally). For survey-grade accuracy, use the full
WMM via the `geomag` package.
"""
from math import radians, degrees, sin, cos, atan2
import datetime

from geo.distance import compass_label

# IGRF-13 north magnetic pole position (epoch 2025 estimate)
_POLE_LAT = radians(80.65)
_POLE_LON = radians(-72.68)


def forward_azimuth(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Forward azimuth from (lat1,lon1) → (lat2,lon2), normalised 0–360°."""
    phi1, phi2 = radians(lat1), radians(lat2)
    dlam = radians(lon2 - lon1)
    y = sin(dlam) * cos(phi2)
    x = cos(phi1) * sin(phi2) - sin(phi1) * cos(phi2) * cos(dlam)
    return (degrees(atan2(y, x)) + 360) % 360


def back_azimuth(az: float) -> float:
    """Back (reverse) azimuth — add 180°, normalise 0–360°."""
    return (az + 180) % 360


def magnetic_declination(lat: float, lon: float, year: int | None = None) -> float:
    """
    Approximate magnetic declination at (lat, lon) in decimal degrees.
    Positive = east of true north, negative = west.

    Uses a tilted-dipole model — good for orientation, not for survey.
    """
    if year is None:
        year = datetime.date.today().year

    phi, lam = radians(lat), radians(lon)

    # Great-circle bearing from observer to magnetic pole
    y = sin(_POLE_LON - lam) * cos(_POLE_LAT)
    x = (cos(phi) * sin(_POLE_LAT)
         - sin(phi) * cos(_POLE_LAT) * cos(_POLE_LON - lam))
    bearing_to_pole = (degrees(atan2(y, x)) + 360) % 360

    # Declination ≈ difference between bearing to pole and true north (0°)
    decl = bearing_to_pole  # bearing_to_pole IS the declination angle
    # Normalise to –180…+180
    if decl > 180:
        decl -= 360
    return round(decl, 1)


def measure(
    lat1: float, lon1: float,
    lat2: float, lon2: float,
    include_declination: bool = False,
) -> dict:
    """
    Full azimuth measurement between two points.

    Returns:
        forward_deg   – forward azimuth 0–360° (1 decimal)
        forward_label – compass label
        back_deg      – back azimuth 0–360° (1 decimal)
        back_label    – compass label
        [mag_declination_deg]  – if include_declination=True
        [magnetic_bearing_deg] – true bearing corrected for declination
    """
    fwd = forward_azimuth(lat1, lon1, lat2, lon2)
    bck = back_azimuth(fwd)
    result = {
        'forward_deg': round(fwd, 1),
        'forward_label': compass_label(fwd),
        'back_deg': round(bck, 1),
        'back_label': compass_label(bck),
    }
    if include_declination:
        mid_lat = (lat1 + lat2) / 2
        mid_lon = (lon1 + lon2) / 2
        decl = magnetic_declination(mid_lat, mid_lon)
        result['mag_declination_deg'] = decl
        result['magnetic_bearing_deg'] = round((fwd - decl + 360) % 360, 1)
    return result
