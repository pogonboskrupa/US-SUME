"""Distance module tests — 3 cases."""
import pytest
from geo.distance import haversine, bearing, compass_label, measure

# Known reference: London ↔ Paris ≈ 340 530 m
LONDON = (51.5074, -0.1278)
PARIS  = (48.8566,  2.3522)

# Sarajevo ↔ Banja Luka ≈ 143 000 m, bearing roughly NW
SARAJEVO   = (43.8564, 18.4131)
BANJA_LUKA = (44.7722, 17.1910)

# Same point → 0 m
MOSTAR = (43.3438, 17.8078)


class TestHaversine:
    def test_london_paris_approx(self):
        d = haversine(*LONDON, *PARIS)
        assert 340_000 < d < 345_000, f'Expected ~343 km, got {d:.0f}'

    def test_same_point_is_zero(self):
        assert haversine(*MOSTAR, *MOSTAR) == pytest.approx(0, abs=1e-6)

    def test_sarajevo_banja_luka(self):
        d = haversine(*SARAJEVO, *BANJA_LUKA)
        assert 140_000 < d < 146_000


class TestBearing:
    def test_bearing_north(self):
        # Due north: same longitude, higher latitude
        b = bearing(0, 0, 10, 0)
        assert b == pytest.approx(0, abs=0.5)

    def test_bearing_east(self):
        b = bearing(0, 0, 0, 10)
        assert b == pytest.approx(90, abs=0.5)

    def test_london_to_paris_is_se(self):
        b = bearing(*LONDON, *PARIS)
        # Paris is south-southeast of London
        assert 140 < b < 160


class TestCompassLabel:
    def test_north(self):
        assert compass_label(0) == 'N'
        assert compass_label(360) == 'N'

    def test_east(self):
        assert compass_label(90) == 'E'

    def test_southwest(self):
        assert compass_label(225) == 'SW'


class TestMeasure:
    def test_returns_all_keys(self):
        r = measure(*LONDON, *PARIS)
        assert {'metres', 'km', 'bearing_deg', 'bearing_label'} <= r.keys()

    def test_km_consistent_with_metres(self):
        r = measure(*LONDON, *PARIS)
        assert r['km'] == pytest.approx(r['metres'] / 1000, rel=0.001)

    def test_sarajevo_banja_luka_bearing_label(self):
        r = measure(*SARAJEVO, *BANJA_LUKA)
        # Banja Luka is northwest of Sarajevo
        assert r['bearing_label'] in ('NW', 'NNW', 'WNW')
