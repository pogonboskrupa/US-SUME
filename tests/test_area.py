"""Area module tests — 3 cases."""
import pytest
import json
from geo.area import spherical_area, perimeter_m, measure, _parse_coords

# 1° × 1° square near equator ≈ 12 308 km²
EQUATOR_SQUARE = [(0, 0), (0, 1), (1, 1), (1, 0)]

# Small forest parcel near Sarajevo (~4 ha roughly)
PARCEL = [
    (43.856, 18.413),
    (43.856, 18.417),
    (43.859, 18.417),
    (43.859, 18.413),
]

# GeoJSON polygon (lon, lat order per spec)
GEOJSON_SQUARE = {
    'type': 'Polygon',
    'coordinates': [[
        [0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]
    ]]
}


class TestSphericalArea:
    def test_equator_square_approx_12300_km2(self):
        a = spherical_area(EQUATOR_SQUARE)
        km2 = a / 1_000_000
        assert 12_000 < km2 < 12_700

    def test_small_parcel_hectares(self):
        a = spherical_area(PARCEL)
        ha = a / 10_000
        assert 10 < ha < 30  # rough sanity for ~350 m × ~430 m rectangle

    def test_requires_3_vertices(self):
        with pytest.raises(ValueError):
            spherical_area([(0, 0), (1, 1)])


class TestPerimeter:
    def test_equator_square_approx_440_km(self):
        p = perimeter_m(EQUATOR_SQUARE)
        assert 440_000 < p < 445_000

    def test_returns_float(self):
        assert isinstance(perimeter_m(PARCEL), float)

    def test_parcel_perimeter_reasonable(self):
        p = perimeter_m(PARCEL)
        assert 1_000 < p < 3_000   # rough 350+430+350+430 m ≈ 1560 m


class TestParseCoords:
    def test_plain_list(self):
        coords = _parse_coords([(1.0, 2.0), (3.0, 4.0), (5.0, 6.0)])
        assert coords == [(1.0, 2.0), (3.0, 4.0), (5.0, 6.0)]

    def test_geojson_dict_swaps_lonlat(self):
        coords = _parse_coords(GEOJSON_SQUARE)
        # GeoJSON is [lon, lat]; parsed should be (lat, lon)
        assert coords[0] == (0.0, 0.0)
        assert coords[1] == (0.0, 1.0)   # lat=0, lon=1

    def test_geojson_string(self):
        coords = _parse_coords(json.dumps(GEOJSON_SQUARE))
        assert len(coords) == 4  # closing point dropped


class TestMeasure:
    def test_all_keys_present(self):
        r = measure(PARCEL)
        assert {'m2', 'ha', 'km2', 'perimeter_km', 'vertex_count'} <= r.keys()

    def test_vertex_count(self):
        r = measure(PARCEL)
        assert r['vertex_count'] == 4

    def test_geojson_input(self):
        r = measure(GEOJSON_SQUARE)
        assert r['km2'] == pytest.approx(
            measure(EQUATOR_SQUARE)['km2'], rel=0.01
        )
