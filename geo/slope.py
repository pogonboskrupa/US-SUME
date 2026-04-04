"""
Slope module — terrain gradient analysis between two elevation points.

Grade classification follows international trail/road standards:
  flat      0–2 %
  gentle    2–5 %
  moderate  5–15 %
  steep     15–30 %
  cliff     > 30 %
"""
from math import degrees, atan2, sqrt

_GRADES = [
    (2.0,   'flat'),
    (5.0,   'gentle'),
    (15.0,  'moderate'),
    (30.0,  'steep'),
    (float('inf'), 'cliff'),
]


def classify_grade(slope_pct: float) -> str:
    """Map a slope percentage (absolute value) to a grade label."""
    for threshold, label in _GRADES:
        if abs(slope_pct) <= threshold:
            return label
    return 'cliff'


def measure(dist_m: float, z1: float, z2: float) -> dict:
    """
    Slope analysis between two points.

    Args:
        dist_m  – horizontal (plan) distance in metres
        z1      – elevation at start in metres
        z2      – elevation at end in metres

    Returns:
        dh_m          – elevation change (+ = ascent, – = descent)
        slope_pct     – rise / run × 100 (1 decimal)
        slope_deg     – angle above/below horizontal (1 decimal)
        rise_run      – ratio string e.g. '1:8.3'
        slope_dist_m  – true 3-D distance (hypotenuse)
        grade         – verbal classification
    """
    if dist_m == 0:
        raise ValueError('Horizontal distance must be > 0')

    dh = z2 - z1
    slope_pct = dh / dist_m * 100
    slope_deg = degrees(atan2(dh, dist_m))
    slope_dist = sqrt(dist_m ** 2 + dh ** 2)

    rise = abs(dh)
    if rise > 0:
        rise_run = f'1:{round(dist_m / rise, 1)}'
    else:
        rise_run = 'flat (∞)'

    return {
        'dh_m': round(dh, 1),
        'slope_pct': round(slope_pct, 1),
        'slope_deg': round(slope_deg, 1),
        'rise_run': rise_run,
        'slope_dist_m': round(slope_dist),
        'grade': classify_grade(slope_pct),
    }
