"""Azimuth module tests — 3 cases."""
import pytest
from geo.azimuth import forward_azimuth, back_azimuth, magnetic_declination, measure

SARAJEVO   = (43.8564, 18.4131)
BANJA_LUKA = (44.7722, 17.1910)
LONDON     = (51.5074, -0.1278)
PARIS      = (48.8566,  2.3522)


class TestForwardAzimuth:
    def test_due_north(self):
        az = forward_azimuth(0, 0, 10, 0)
        assert az == pytest.approx(0, abs=0.5)

    def test_due_south(self):
        az = forward_azimuth(10, 0, 0, 0)
        assert az == pytest.approx(180, abs=0.5)

    def test_due_east(self):
        az = forward_azimuth(0, 0, 0, 10)
        assert az == pytest.approx(90, abs=0.5)


class TestBackAzimuth:
    def test_back_of_north_is_south(self):
        assert back_azimuth(0) == pytest.approx(180)

    def test_back_of_east_is_west(self):
        assert back_azimuth(90) == pytest.approx(270)

    def test_back_wraps_correctly(self):
        # back of 270° (W) should be 90° (E)
        assert back_azimuth(270) == pytest.approx(90)


class TestMagneticDeclination:
    def test_western_europe_negative(self):
        # Western Europe has slight west declination
        decl = magnetic_declination(48.0, 2.0)   # near Paris
        assert -30 < decl < 30  # model is approximate

    def test_returns_float(self):
        decl = magnetic_declination(*SARAJEVO)
        assert isinstance(decl, float)

    def test_symmetric_hemispheres_differ(self):
        decl_n = magnetic_declination(60, 100)
        decl_s = magnetic_declination(-60, 100)
        assert decl_n != decl_s


class TestMeasure:
    def test_returns_required_keys(self):
        r = measure(*SARAJEVO, *BANJA_LUKA)
        assert {'forward_deg', 'forward_label', 'back_deg', 'back_label'} <= r.keys()

    def test_forward_back_differ_by_180(self):
        r = measure(*LONDON, *PARIS)
        diff = abs(r['forward_deg'] - r['back_deg'])
        assert diff == pytest.approx(180, abs=1)

    def test_with_declination(self):
        r = measure(*SARAJEVO, *BANJA_LUKA, include_declination=True)
        assert 'mag_declination_deg' in r
        assert 'magnetic_bearing_deg' in r
        assert 0 <= r['magnetic_bearing_deg'] < 360
