"""Slope module tests — 3 cases."""
import pytest
from geo.slope import measure, classify_grade


class TestClassifyGrade:
    def test_flat(self):
        assert classify_grade(1.5) == 'flat'

    def test_moderate(self):
        assert classify_grade(10) == 'moderate'

    def test_cliff(self):
        assert classify_grade(45) == 'cliff'


class TestMeasure:
    def test_10pct_ascent(self):
        # 100 m horizontal, 10 m rise → 10 %
        r = measure(100, 0, 10)
        assert r['slope_pct'] == pytest.approx(10.0)
        assert r['dh_m'] == pytest.approx(10.0)
        assert r['grade'] == 'moderate'

    def test_descent_negative_slope(self):
        # Going down 30 m over 200 m → −15 % → boundary moderate/steep
        r = measure(200, 100, 70)
        assert r['slope_pct'] == pytest.approx(-15.0)
        assert r['dh_m'] == pytest.approx(-30.0)
        assert r['grade'] == 'moderate'  # 15 % hits the ≤15 threshold

    def test_flat_ground(self):
        r = measure(500, 850, 850)
        assert r['slope_pct'] == pytest.approx(0.0)
        assert r['slope_deg'] == pytest.approx(0.0)
        assert r['grade'] == 'flat'
        assert r['rise_run'] == 'flat (∞)'

    def test_3d_distance_pythagorean(self):
        # 3 m horizontal, 4 m vertical → hypotenuse 5
        r = measure(3, 0, 4)
        assert r['slope_dist_m'] == 5

    def test_zero_distance_raises(self):
        with pytest.raises(ValueError):
            measure(0, 100, 200)

    def test_angle_45_degrees(self):
        r = measure(100, 0, 100)
        assert r['slope_deg'] == pytest.approx(45.0, abs=0.1)
