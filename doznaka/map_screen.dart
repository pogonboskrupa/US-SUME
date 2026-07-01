// lib/screens/map/map_screen.dart

import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import '../../core/constants.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/area_calculator.dart';
import '../../services/gps_service.dart';
import '../../services/marking_service.dart';
import '../../services/supabase_service.dart';
import '../marking/save_marking_dialog.dart';
import '../marking/markings_panel.dart';
import '../members/members_screen.dart';
import '../widgets/area_stats_panel.dart';

class MapScreen extends ConsumerStatefulWidget {
  final String projectId;
  const MapScreen({super.key, required this.projectId});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  late final MapController _mapController;
  final _gps = GpsService();

  StreamSubscription? _realtimeSub;
  StreamSubscription? _markingsSub;
  StreamSubscription? _gpsSub;

  Project? _project;
  List<ProjectMember> _members = [];
  List<LatLng> _boundary = [];
  List<AreaMarking> _markings = [];
  bool _isManager = false;
  bool _isPanelExpanded = false;
  bool _loaded = false;

  // Crtanje plohe
  bool _isDrawing = false;
  MarkingType? _drawingType;
  final List<LatLng> _drawingPoints = [];

  // Slojevi
  bool _showMarkings = true;
  bool _showZones = true;
  bool _showTracks = true;
  bool _showBoundary = true;
  bool _followMe = true;
  bool _showMarkingsPanel = false;

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    _loadAll();
  }

  Future<void> _loadAll() async {
    try {
      _project = await SupabaseService.getProject(widget.projectId);
      _members = await SupabaseService.getMembers(widget.projectId);
      _markings = await MarkingService.getMarkings(widget.projectId);

      final myId = SupabaseService.currentUserId;
      _isManager = _members.any((m) => m.userId == myId && m.isManager);

      if (_project?.boundaryGeojson != null) {
        _boundary = _project!.boundaryPoints;
      }

      final allPoints =
          await SupabaseService.getAllTrackPoints(widget.projectId);
      ref.read(trackingProvider.notifier).loadPoints(allPoints);
      _recalcZones();

      if (_boundary.isNotEmpty && mounted) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _mapController.move(
              _centroid(_boundary), AppConstants.defaultZoom);
        });
      }

      _realtimeSub = SupabaseService.trackPointsStream(widget.projectId)
          .listen((rows) {
        if (!mounted) return;
        ref
            .read(trackingProvider.notifier)
            .loadPoints(rows.map((r) => TrackPoint.fromJson(r)).toList());
        _recalcZones();
      });

      _markingsSub =
          MarkingService.markingsStream(widget.projectId).listen((rows) {
        if (!mounted) return;
        setState(() => _markings = rows
            .map((r) => AreaMarking.fromJson(r))
            .where((m) => m.isVisible)
            .toList());
      });

      _gpsSub = _gps.positionStream.listen((data) {
        if (data == null || !mounted || !_followMe) return;
        _mapController.move(
            LatLng(data['lat'], data['lng']),
            _mapController.camera.zoom);
      });
    } catch (_) {}

    if (mounted) setState(() => _loaded = true);
  }

  void _recalcZones() {
    if (_boundary.isEmpty || _members.isEmpty) return;
    final tracking = ref.read(trackingProvider);
    ref.read(zonesProvider.notifier).recalculate(
          boundary: _boundary,
          members: _members,
          tracksByUser: tracking.tracksByUser,
          knownAreaHa: _project?.knownAreaHa ?? 0,
        );
  }

  // ─── TRACKING ───────────────────────────────────────────
  Future<void> _toggleTracking() async {
    final tracking = ref.read(trackingProvider);
    if (tracking.isTracking) {
      await _gps.stopTracking();
      ref.read(trackingProvider.notifier).setTracking(false);
    } else {
      final ok = await _gps.startTracking(
          projectId: widget.projectId,
          userId: SupabaseService.currentUserId!);
      if (ok) {
        ref.read(trackingProvider.notifier).setTracking(true);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Dozvola za lokaciju nije odobrena')));
      }
    }
  }

  // ─── CRTANJE PLOHE ──────────────────────────────────────
  void _startDrawing(MarkingType type) => setState(() {
        _isDrawing = true;
        _drawingType = type;
        _drawingPoints.clear();
        _showMarkingsPanel = false;
      });

  void _onMapTap(TapPosition _, LatLng point) {
    if (!_isDrawing) return;
    setState(() => _drawingPoints.add(point));
  }

  void _undoPoint() {
    if (_drawingPoints.isNotEmpty) setState(() => _drawingPoints.removeLast());
  }

  Future<void> _finishDrawing() async {
    if (_drawingPoints.length < 3) return;

    final areaHa = AreaCalculator.trackCoveredAreaHa(
        _drawingPoints,
        _boundary.isNotEmpty ? _boundary : _drawingPoints);

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) =>
          SaveMarkingDialog(preselected: _drawingType, areaHa: areaHa),
    );

    setState(() {
      _isDrawing = false;
      _drawingPoints.clear();
      _drawingType = null;
    });

    if (result == null) return;

    try {
      await MarkingService.createMarking(
        projectId: widget.projectId,
        type: result['type'] as MarkingType,
        polygon: List.from(_drawingPoints.isEmpty
            ? _drawingPoints
            : _drawingPoints),
        label: result['label'],
        note: result['note'],
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: const Text('Ploha obilježena ✓'),
          backgroundColor: Colors.green.shade700,
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Greška: $e')));
      }
    }
  }

  void _cancelDrawing() => setState(() {
        _isDrawing = false;
        _drawingPoints.clear();
        _drawingType = null;
      });

  // ─── MARKINGS CRUD ──────────────────────────────────────
  Future<void> _deleteMarking(AreaMarking m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Obriši plohu?'),
        content: Text('Obrisati "${m.displayLabel}"?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Odustani')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red.shade600),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Obriši')),
        ],
      ),
    );
    if (ok == true) await MarkingService.deleteMarking(m.id);
  }

  Future<void> _editMarking(AreaMarking m) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) =>
          SaveMarkingDialog(preselected: m.type, areaHa: m.areaHa),
    );
    if (result == null) return;
    await MarkingService.updateMarking(
        id: m.id,
        label: result['label'],
        note: result['note'],
        type: result['type']);
  }

  @override
  void dispose() {
    _realtimeSub?.cancel();
    _markingsSub?.cancel();
    _gpsSub?.cancel();
    super.dispose();
  }

  // ─── BUILD ──────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final tracking = ref.watch(trackingProvider);
    final zones = ref.watch(zonesProvider);

    if (!_loaded) {
      return Scaffold(
        appBar: AppBar(title: const Text('Učitavam...')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: _isDrawing
          ? null
          : AppBar(
              title: Text(_project?.name ?? 'Odjel',
                  style: const TextStyle(fontSize: 17)),
              actions: [
                IconButton(
                  icon: const Icon(Icons.layers_outlined),
                  tooltip: 'Slojevi',
                  onPressed: _showLayersSheet,
                ),
                IconButton(
                  icon: const Icon(Icons.people_outlined),
                  tooltip: 'Inženjeri',
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (_) =>
                            MembersScreen(project: _project!)),
                  ).then((_) => _loadAll()),
                ),
                IconButton(
                  icon: Badge(
                    isLabelVisible: _markings.isNotEmpty,
                    label: Text('${_markings.length}'),
                    child: const Icon(Icons.location_on_outlined),
                  ),
                  tooltip: 'Obilježene plohe',
                  onPressed: () => setState(
                      () => _showMarkingsPanel = !_showMarkingsPanel),
                ),
              ],
            ),
      body: Stack(
        children: [
          // ── MAPA ──────────────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _boundary.isNotEmpty
                  ? _centroid(_boundary)
                  : const LatLng(44.2, 17.4),
              initialZoom: AppConstants.defaultZoom,
              maxZoom: AppConstants.maxZoom,
              minZoom: AppConstants.minZoom,
              onTap: _onMapTap,
            ),
            children: [
              TileLayer(
                urlTemplate: AppConstants.osmTileUrl,
                userAgentPackageName: 'com.forestrytracker',
              ),

              // Granica odjela
              if (_showBoundary && _boundary.isNotEmpty)
                PolygonLayer(polygons: [
                  Polygon(
                    points: _boundary,
                    color: Colors.green.withOpacity(0.07),
                    borderColor: Colors.green.shade700,
                    borderStrokeWidth: 2.5,
                  ),
                ]),

              // Zone inženjera
              if (_showZones && zones.zones.isNotEmpty)
                PolygonLayer(
                  polygons: zones.zones
                      .where((z) => z.polygon.length >= 3)
                      .map<Polygon<Object>>((z) => Polygon(
                            points: z.polygon,
                            color: _hex(z.color).withOpacity(0.14),
                            borderColor:
                                _hex(z.color).withOpacity(0.45),
                            borderStrokeWidth: 1.5,
                          ))
                      .toList(),
                ),

              // Obilježene plohe
              if (_showMarkings)
                PolygonLayer(
                  polygons: _markings
                      .where((m) => m.polygon.length >= 3)
                      .map((m) => Polygon(
                            points: m.polygon,
                            color: m.type.fillColor,
                            borderColor: m.type.borderColor,
                            borderStrokeWidth: 2.0,
                          ))
                      .toList(),
                ),

              // Labele ploha
              if (_showMarkings)
                MarkerLayer(
                  markers: _markings
                      .where((m) => m.polygon.length >= 3)
                      .map((m) => Marker(
                            point: _centroid(m.polygon),
                            width: 110,
                            height: 28,
                            child: _MarkingLabel(marking: m),
                          ))
                      .toList(),
                ),

              // Tragovi
              if (_showTracks)
                PolylineLayer(
                  polylines: _members.expand((mem) {
                    final pts = tracking.tracksByUser[mem.userId] ?? [];
                    return _splitTrackSegments(pts).map((seg) => Polyline(
                        points: seg,
                        strokeWidth: 3.5,
                        color: mem.color));
                  }).toList(),
                ),

              // Markeri inženjera
              MarkerLayer(
                markers: tracking.currentPositions.entries
                    .map((e) {
                  final m = _members
                      .where((m) => m.userId == e.key)
                      .firstOrNull;
                  return Marker(
                    point: e.value,
                    width: 38,
                    height: 38,
                    child: _EngineerMarker(
                      color: m?.color ?? Colors.blue,
                      initials: m?.initials ?? '?',
                      isMe: e.key ==
                          SupabaseService.currentUserId,
                    ),
                  );
                }).toList(),
              ),

              // Crtanje — linija u toku
              if (_isDrawing && _drawingPoints.length >= 2)
                PolylineLayer<Object>(polylines: [
                  Polyline(
                    points: [
                      ..._drawingPoints,
                      if (_drawingPoints.length >= 3)
                        _drawingPoints.first,
                    ],
                    strokeWidth: 2.5,
                    color: _drawingType?.color ?? Colors.orange,
                  ),
                ]),

              // Crtanje — tačke
              if (_isDrawing)
                MarkerLayer(
                  markers: _drawingPoints
                      .map((pt) => Marker(
                            point: pt,
                            width: 14,
                            height: 14,
                            child: Container(
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: _drawingType?.color ??
                                    Colors.orange,
                                border: Border.all(
                                    color: Colors.white, width: 2),
                              ),
                            ),
                          ))
                      .toList(),
                ),
            ],
          ),

          // ── DRAWING TOOLBAR ────────────────────────────────
          if (_isDrawing) _buildDrawingBar(),

          // ── TRACKING BADGE ─────────────────────────────────
          if (!_isDrawing && tracking.isTracking)
            Positioned(
              top: 8,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.green.shade700,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const _PulsingDot(),
                      const SizedBox(width: 8),
                      Text(
                        'Snimanje — ${tracking.totalPoints} tačaka',
                        style: const TextStyle(
                            color: Colors.white, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ),
            ),

          // ── STATS PANEL ────────────────────────────────────
          if (!_isDrawing && !_showMarkingsPanel)
            Positioned(
              bottom: 90,
              left: 0,
              right: 0,
              child: AreaStatsPanel(
                zones: zones.zones,
                members: _members,
                knownAreaHa: _project?.knownAreaHa,
                isExpanded: _isPanelExpanded,
                onToggle: () => setState(
                    () => _isPanelExpanded = !_isPanelExpanded),
              ),
            ),

          // ── MARKINGS PANEL ─────────────────────────────────
          if (_showMarkingsPanel)
            Positioned.fill(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: MarkingsPanel(
                  markings: _markings,
                  isManager: _isManager,
                  onDelete: _deleteMarking,
                  onEdit: _editMarking,
                  onClose: () =>
                      setState(() => _showMarkingsPanel = false),
                ),
              ),
            ),
        ],
      ),

      // ── FAB ────────────────────────────────────────────────
      floatingActionButton: _isDrawing
          ? null
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                FloatingActionButton.small(
                  heroTag: 'mark',
                  onPressed: _showMarkingTypeSheet,
                  backgroundColor: Colors.orange.shade700,
                  tooltip: 'Obilježi plohu',
                  child: const Icon(
                      Icons.edit_location_alt_outlined),
                ),
                const SizedBox(height: 8),
                FloatingActionButton.small(
                  heroTag: 'center',
                  onPressed: () async {
                    final pos = await _gps.getCurrentPosition();
                    if (pos != null && mounted) {
                      _mapController.move(
                        LatLng(pos.latitude, pos.longitude),
                        _mapController.camera.zoom,
                      );
                    }
                  },
                  child: const Icon(Icons.my_location),
                ),
                const SizedBox(height: 10),
                FloatingActionButton.extended(
                  heroTag: 'tracking',
                  onPressed: _toggleTracking,
                  backgroundColor: tracking.isTracking
                      ? Colors.red.shade600
                      : Colors.green.shade700,
                  icon: Icon(tracking.isTracking
                      ? Icons.stop
                      : Icons.play_arrow),
                  label: Text(tracking.isTracking
                      ? 'Zaustavi'
                      : 'Pokreni snimanje'),
                ),
              ],
            ),
    );
  }

  // ── Drawing toolbar widget ─────────────────────────────
  Widget _buildDrawingBar() {
    return Stack(children: [
      // Top info
      Positioned(
        top: 0,
        left: 0,
        right: 0,
        child: SafeArea(
          child: Container(
            margin: const EdgeInsets.symmetric(
                horizontal: 12, vertical: 8),
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: _drawingType?.color ?? Colors.orange.shade700,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(children: [
              Text(_drawingType?.emoji ?? '✏️',
                  style: const TextStyle(fontSize: 20)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  _drawingPoints.isEmpty
                      ? 'Tapni na mapi — dodaj tačke plohe'
                      : '${_drawingPoints.length} tačaka'
                          '${_drawingPoints.length < 3 ? '  (min. 3)' : ' — spreman za završetak'}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500),
                ),
              ),
            ]),
          ),
        ),
      ),
      // Bottom controls
      Positioned(
        bottom: 20,
        left: 12,
        right: 12,
        child: Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: Colors.red.shade600,
                side: BorderSide(color: Colors.red.shade300),
                padding: const EdgeInsets.symmetric(vertical: 13),
              ),
              onPressed: _cancelDrawing,
              icon: const Icon(Icons.close, size: 18),
              label: const Text('Odustani'),
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              backgroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(
                  horizontal: 18, vertical: 13),
            ),
            onPressed: _drawingPoints.isNotEmpty ? _undoPoint : null,
            child: const Icon(Icons.undo, size: 20),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: _drawingPoints.length >= 3
                    ? Colors.green.shade700
                    : Colors.grey.shade400,
                padding: const EdgeInsets.symmetric(vertical: 13),
              ),
              onPressed:
                  _drawingPoints.length >= 3 ? _finishDrawing : null,
              icon: const Icon(Icons.check, size: 18),
              label: const Text('Završi'),
            ),
          ),
        ]),
      ),
    ]);
  }

  // ── Marking type picker ────────────────────────────────
  void _showMarkingTypeSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const Text('Odaberi tip plohe',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w600)),
            Text('Tapkaj po mapi da nacrtaš granicu plohe',
                style: TextStyle(
                    color: Colors.grey.shade500, fontSize: 13)),
            const SizedBox(height: 10),
            ...MarkingType.values.map((type) => ListTile(
                  dense: true,
                  leading: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: type.fillColor,
                      shape: BoxShape.circle,
                      border:
                          Border.all(color: type.borderColor),
                    ),
                    child: Center(
                        child: Text(type.emoji,
                            style:
                                const TextStyle(fontSize: 16))),
                  ),
                  title: Text(type.label,
                      style: const TextStyle(
                          fontWeight: FontWeight.w500,
                          fontSize: 14)),
                  subtitle: Text(type.description,
                      style: const TextStyle(fontSize: 11)),
                  onTap: () {
                    Navigator.pop(context);
                    _startDrawing(type);
                  },
                )),
          ],
        ),
      ),
    );
  }

  // ── Layers sheet ──────────────────────────────────────
  void _showLayersSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => StatefulBuilder(builder: (ctx, set) {
        return Padding(
          padding:
              const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Slojevi karte',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600)),
              ),
              const SizedBox(height: 4),
              _LayerTile(
                  icon: Icons.crop_square_outlined,
                  label: 'Granica odjela',
                  value: _showBoundary,
                  color: Colors.green.shade700,
                  onChanged: (v) {
                    set(() => _showBoundary = v);
                    setState(() => _showBoundary = v);
                  }),
              _LayerTile(
                  icon: Icons.people_outline,
                  label: 'Zone inženjera',
                  value: _showZones,
                  color: Colors.blue,
                  onChanged: (v) {
                    set(() => _showZones = v);
                    setState(() => _showZones = v);
                  }),
              _LayerTile(
                  icon: Icons.timeline,
                  label: 'Tragovi kretanja',
                  value: _showTracks,
                  color: Colors.purple,
                  onChanged: (v) {
                    set(() => _showTracks = v);
                    setState(() => _showTracks = v);
                  }),
              _LayerTile(
                  icon: Icons.layers_outlined,
                  label: 'Obilježene plohe',
                  value: _showMarkings,
                  color: Colors.orange.shade700,
                  onChanged: (v) {
                    set(() => _showMarkings = v);
                    setState(() => _showMarkings = v);
                  }),
              _LayerTile(
                  icon: Icons.my_location,
                  label: 'Prati moju lokaciju',
                  value: _followMe,
                  color: Colors.teal,
                  onChanged: (v) {
                    set(() => _followMe = v);
                    setState(() => _followMe = v);
                  }),
            ],
          ),
        );
      }),
    );
  }

  // ── Helpers ───────────────────────────────────────────
  Color _hex(String hex) {
    try {
      return Color(
          int.parse('FF${hex.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.blue;
    }
  }

  LatLng _centroid(List<LatLng> pts) {
    double lat = 0, lng = 0;
    for (final p in pts) {
      lat += p.latitude;
      lng += p.longitude;
    }
    return LatLng(lat / pts.length, lng / pts.length);
  }
}

// ── Widgets ─────────────────────────────────────────────

class _LayerTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool value;
  final Color color;
  final ValueChanged<bool> onChanged;

  const _LayerTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
      secondary: Icon(icon, size: 20, color: color),
      title: Text(label, style: const TextStyle(fontSize: 14)),
      value: value,
      activeColor: color,
      onChanged: onChanged,
    );
  }
}

class _MarkingLabel extends StatelessWidget {
  final AreaMarking marking;
  const _MarkingLabel({required this.marking});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: marking.type.color.withOpacity(0.88),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        '${marking.type.emoji} ${marking.displayLabel}',
        style: const TextStyle(
            color: Colors.white,
            fontSize: 9,
            fontWeight: FontWeight.w600),
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _EngineerMarker extends StatelessWidget {
  final Color color;
  final String initials;
  final bool isMe;

  const _EngineerMarker(
      {required this.color,
      required this.initials,
      this.isMe = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        border: Border.all(
            color: isMe ? Colors.white : color.withOpacity(0.4),
            width: isMe ? 3 : 1.5),
        boxShadow: [
          BoxShadow(
              color: color.withOpacity(0.4),
              blurRadius: 6,
              spreadRadius: 1)
        ],
      ),
      child: Center(
        child: Text(initials,
            style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 13)),
      ),
    );
  }
}

List<List<LatLng>> _splitTrackSegments(List<TrackPoint> points,
    {Duration maxGap = const Duration(minutes: 2)}) {
  if (points.isEmpty) return [];
  final segments = <List<LatLng>>[];
  var current = <LatLng>[points.first.latLng];
  for (int i = 1; i < points.length; i++) {
    final gap = points[i].recordedAt.difference(points[i - 1].recordedAt).abs();
    if (gap > maxGap) {
      if (current.length >= 2) segments.add(current);
      current = [];
    }
    current.add(points[i].latLng);
  }
  if (current.length >= 2) segments.add(current);
  return segments;
}

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(seconds: 1))
      ..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.4, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _anim,
      child: Container(
          width: 8,
          height: 8,
          decoration: const BoxDecoration(
              shape: BoxShape.circle, color: Colors.white)),
    );
  }
}
