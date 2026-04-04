#!/usr/bin/env python3
"""
Geodetic Measurement Tool — CLI entry point
Usage:
    python main.py dist  lat1 lon1 lat2 lon2
    python main.py az    lat1 lon1 lat2 lon2 [--mag]
    python main.py slope dist_m z1 z2
    python main.py area  lat1,lon1 lat2,lon2 ... | --geojson file.json
    python main.py serve [--port 8000]
"""
import argparse
import json
import sys

from rich.console import Console
from rich.table import Table
from rich import box

from geo import distance, azimuth, slope, area

console = Console()


# ── helpers ──────────────────────────────────────────────────────────────────

def _print_json(data: dict) -> None:
    console.print_json(json.dumps(data))


def _table(title: str, rows: list[tuple[str, str]]) -> None:
    t = Table(title=title, box=box.ROUNDED, show_header=False,
              title_style='bold cyan', border_style='blue')
    t.add_column('Field', style='dim')
    t.add_column('Value', style='bold white')
    for k, v in rows:
        t.add_row(k, str(v))
    console.print(t)


# ── subcommand handlers ───────────────────────────────────────────────────────

def cmd_dist(args: argparse.Namespace) -> dict:
    result = distance.measure(args.lat1, args.lon1, args.lat2, args.lon2)
    if args.json:
        _print_json(result)
    else:
        _table('📏  Distance', [
            ('Distance',  f"{result['metres']} m  /  {result['km']} km"),
            ('Bearing',   f"{result['bearing_deg']}°  {result['bearing_label']}"),
            ('From',      f"{args.lat1}, {args.lon1}"),
            ('To',        f"{args.lat2}, {args.lon2}"),
        ])
    return result


def cmd_az(args: argparse.Namespace) -> dict:
    result = azimuth.measure(
        args.lat1, args.lon1, args.lat2, args.lon2,
        include_declination=args.mag,
    )
    if args.json:
        _print_json(result)
    else:
        rows = [
            ('Forward azimuth', f"{result['forward_deg']}°  {result['forward_label']}"),
            ('Back azimuth',    f"{result['back_deg']}°  {result['back_label']}"),
        ]
        if args.mag:
            rows += [
                ('Mag. declination', f"{result['mag_declination_deg']}°"),
                ('Magnetic bearing', f"{result['magnetic_bearing_deg']}°"),
            ]
        _table('🧭  Azimuth', rows)
    return result


def cmd_slope(args: argparse.Namespace) -> dict:
    result = slope.measure(args.dist_m, args.z1, args.z2)
    if args.json:
        _print_json(result)
    else:
        sign = '+' if result['dh_m'] >= 0 else ''
        _table('📐  Slope', [
            ('Elevation change', f"{sign}{result['dh_m']} m"),
            ('Slope',            f"{result['slope_pct']} %   {result['slope_deg']}°"),
            ('Rise / Run',       result['rise_run']),
            ('3-D distance',     f"{result['slope_dist_m']} m"),
            ('Grade',            result['grade'].upper()),
        ])
    return result


def cmd_area(args: argparse.Namespace) -> dict:
    if args.geojson:
        with open(args.geojson) as f:
            source = json.load(f)
    else:
        if not args.coords:
            console.print('[red]Provide coordinate pairs or --geojson file[/red]')
            sys.exit(1)
        source = []
        for pair in args.coords:
            parts = pair.split(',')
            if len(parts) != 2:
                console.print(f'[red]Bad coordinate: {pair!r}  (use lat,lon)[/red]')
                sys.exit(1)
            source.append((float(parts[0]), float(parts[1])))

    result = area.measure(source)
    if args.json:
        _print_json(result)
    else:
        _table('◻  Surface Area', [
            ('Area (m²)',      f"{result['m2']:,} m²"),
            ('Area (ha)',      f"{result['ha']} ha"),
            ('Area (km²)',     f"{result['km2']} km²"),
            ('Perimeter',      f"{result['perimeter_km']} km"),
            ('Vertices',       str(result['vertex_count'])),
        ])
    return result


def cmd_serve(args: argparse.Namespace) -> None:
    """Serve the Leaflet map preview."""
    import http.server
    import os
    os.chdir(os.path.dirname(__file__) or '.')
    port = args.port
    console.print(f'[cyan]Map preview → http://localhost:{port}/static/map.html[/cyan]')
    handler = http.server.SimpleHTTPRequestHandler
    with http.server.HTTPServer(('', port), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            console.print('\n[dim]Server stopped[/dim]')


# ── argument parser ───────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog='geo',
        description='Geodetic measurement tool (distance · azimuth · slope · area)',
    )
    p.add_argument('--json', action='store_true', help='Output raw JSON')
    sub = p.add_subparsers(dest='cmd', required=True)

    # dist
    pd = sub.add_parser('dist', help='Distance + bearing between two points')
    pd.add_argument('lat1', type=float); pd.add_argument('lon1', type=float)
    pd.add_argument('lat2', type=float); pd.add_argument('lon2', type=float)

    # az
    pa = sub.add_parser('az', help='Forward + back azimuth')
    pa.add_argument('lat1', type=float); pa.add_argument('lon1', type=float)
    pa.add_argument('lat2', type=float); pa.add_argument('lon2', type=float)
    pa.add_argument('--mag', action='store_true',
                    help='Include magnetic declination estimate')

    # slope
    ps = sub.add_parser('slope', help='Terrain slope between two elevations')
    ps.add_argument('dist_m', type=float, help='Horizontal distance in metres')
    ps.add_argument('z1', type=float, help='Start elevation (m)')
    ps.add_argument('z2', type=float, help='End elevation (m)')

    # area
    par = sub.add_parser('area', help='Polygon surface area')
    par.add_argument('coords', nargs='*', metavar='lat,lon',
                     help='Coordinate pairs (space-separated)')
    par.add_argument('--geojson', metavar='FILE',
                     help='GeoJSON Polygon file instead of coord pairs')

    # serve
    pse = sub.add_parser('serve', help='Launch Leaflet map preview')
    pse.add_argument('--port', type=int, default=8000)

    return p


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    dispatch = {
        'dist':  cmd_dist,
        'az':    cmd_az,
        'slope': cmd_slope,
        'area':  cmd_area,
        'serve': cmd_serve,
    }
    dispatch[args.cmd](args)


if __name__ == '__main__':
    main()
