// lib/screens/doznaka/doznaka_screen.dart
// Glavni ekran za doznaku — mapa + GPS praćenje po pojasima

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:file_picker/file_picker.dart';
import 'dart:io';

import '../../core/constants.dart';
import '../../models/models.dart';
import '../../services/doznaka_service.dart';
import '../../services/doznaka_calculator.dart';
import '../../services/supabase_service.dart';
import 'doznaka_panel.dart';

class DoznakaScreen extends StatefulWidget {
  const DoznakaScreen({super.key});

  @override
  State<DoznakaScreen> createState() => _DoznakaScreenState();
}

class _DoznakaScreenState extends State<DoznakaScreen> {
  final _mapController = MapController();

  // Projekat
  List<DoznakaProjekat> _projekti = [];
  DoznakaProjekat? _aktivan;

  // Trase
  List<DoznakaTrasa> _trase = [];
  StreamSubscription? _traseSub;

  // GPS snimanje
  bool _isTracking = false;
  String? _aktivnaTrasa;           // ID aktivne trase
  final List<LatLng> _currentTrack = [];
  StreamSubscription<Position>? _gpsSub;
  LatLng? _myPosition;

  // UI
  bool _showPanel = false;
  bool _showZone = true;
  bool _showTrack = true;

  // Ručno crtanje granice odjela
  bool _isDrawingOdjel = false;
  final List<LatLng> _drawingPts = [];

  // Korisnici na projektu (za panel)
  Map<String, String> _userNames = {};
  Map<String, String> _userColors = {};

  // GeoJSON podaci za dropdown
  Map<String, dynamic>? _loadedGeojson;
  List<OdjelFeature>? _odjelFeatures;
  Map<String, Set<String>>? _gjOdjelMap;
  String? _selGj;
  String? _selOdjel;

  @override
  void initState() {
    super.initState();
    _loadProjekti();
  }

  @override
  void dispose() {
    _gpsSub?.cancel();
    _traseSub?.cancel();
    super.dispose();
  }

  // ── Inicijalizacija ──────────────────────────────────────

  Future<void> _loadProjekti() async {
    final projekti = await DoznakaService.getMojeProjekte();
    if (mounted) setState(() => _projekti = projekti);
  }

  Future<void> _aktivirajProjekat(DoznakaProjekat p) async {
    setState(() {
      _aktivan = p;
      _trase = [];
      _showPanel = true;
    });

    // Centriraj mapu na granicu odjela
    final pts = p.boundaryPoints;
    if (pts.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _mapController.move(_centroid(pts), AppConstants.defaultZoom);
      });
    }

    // Učitaj trase + pretplati se na realtime
    await _loadTrase();
    _traseSub?.cancel();
    _traseSub = DoznakaService.traseStream(p.id).listen((rows) {
      final trase = rows.map((j) => DoznakaTrasa.fromJson(j)).toList();
      _onTraseUpdate(trase);
    });

    // Učitaj korisnike
    await _loadUsers(p);
  }

  Future<void> _loadTrase() async {
    if (_aktivan == null) return;
    final trase = await DoznakaService.getTrase(_aktivan!.id);
    _onTraseUpdate(trase);
  }

  void _onTraseUpdate(List<DoznakaTrasa> trase) {
    if (!mounted) return;
    final finished = trase.where((t) => t.isFinished).toList();

    // Recalculate zone polygons
    if (finished.isNotEmpty && _aktivan != null) {
      final zones = DoznakaCalculator.calculateZone(
        odjelBoundary: _aktivan!.boundaryPoints,
        trase: finished,
        totalAreaHa: _aktivan!.totalAreaHa ?? 0,
      );
      // Ažuriraj areaPct/areaHa u lokalnoj listi
      for (final z in zones) {
        final idx = trase.indexWhere((t) => t.id == z.trasaId);
        if (idx >= 0) {
          trase[idx] = DoznakaTrasa(
            id: trase[idx].id,
            projekatId: trase[idx].projekatId,
            userId: trase[idx].userId,
            track: trase[idx].track,
            zona: z.zona,
            areaHa: z.areaHa,
            areaPct: z.areaPct,
            isLastStrip: trase[idx].isLastStrip,
            status: trase[idx].status,
            startedAt: trase[idx].startedAt,
            finishedAt: trase[idx].finishedAt,
            centroidLat: trase[idx].centroidLat,
          );
        }
      }
    }

    setState(() => _trase = trase);
  }

  Future<void> _loadUsers(DoznakaProjekat p) async {
    // Dohvati profil trenutnog korisnika i poznate korisnike trasa
    final myId = SupabaseService.currentUserId;
    if (myId != null) {
      final profile = await SupabaseService.getProfile(myId);
      if (profile != null) {
        _userNames[myId] = profile.fullName;
      }
    }
    // Boje — dodjeli boje po redoslijedu (isti sistem kao engineerColors)
    final userIds = _trase.map((t) => t.userId).toSet().toList();
    for (int i = 0; i < userIds.length; i++) {
      _userColors[userIds[i]] = AppConstants.engineerColors[i % AppConstants.engineerColors.length];
    }
    if (mounted) setState(() {});
  }

  // ── GPS snimanje ─────────────────────────────────────────

  Future<void> _startTrasa() async {
    if (_aktivan == null) return;

    final hasPermission = await _requestGpsPermission();
    if (!hasPermission) {
      _showMsg('GPS dozvola odbijena');
      return;
    }

    final trasaId = await DoznakaService.startTrasa(_aktivan!.id);
    setState(() {
      _aktivnaTrasa = trasaId;
      _isTracking = true;
      _currentTrack.clear();
    });

    LatLng? lastSaved;

    _gpsSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.bestForNavigation,
        distanceFilter: 2,
      ),
    ).listen((pos) async {
      if (pos.accuracy > AppConstants.gpsAccuracyThresholdM) return;

      final pt = LatLng(pos.latitude, pos.longitude);

      if (lastSaved != null) {
        final d = Geolocator.distanceBetween(
          lastSaved!.latitude, lastSaved!.longitude,
          pt.latitude, pt.longitude,
        );
        if (d < AppConstants.gpsMinDistanceM) return;
      }
      lastSaved = pt;

      // Sačuvaj tačku
      await DoznakaService.addTacka(
        trasaId: trasaId,
        lat: pos.latitude,
        lng: pos.longitude,
        altitude: pos.altitude,
        accuracy: pos.accuracy,
        speed: pos.speed,
      );

      setState(() {
        _currentTrack.add(pt);
        _myPosition = pt;
      });

      // Provjeri blizinu gornje granice
      if (_aktivan != null && _currentTrack.length > 5) {
        final nearBoundary = DoznakaCalculator.isNearUpperBoundary(
          position: pt,
          odjelBoundary: _aktivan!.boundaryPoints,
          existingTrase: _trase.where((t) => t.isFinished).toList(),
        );
        if (nearBoundary) _promptLastStrip();
      }
    });
  }

  bool _lastStripPrompted = false;

  void _promptLastStrip() {
    if (_lastStripPrompted || !mounted) return;
    _lastStripPrompted = true;

    showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Blizu gornje granice'),
        content: const Text(
          'Jesi li blizu gornje granice odjela?\n\nAko je ovo zadnji pojas doznake, zona će se spojiti do granice poligona.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Nije zadnji'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Da, zadnji pojas'),
          ),
        ],
      ),
    ).then((isLast) async {
      if (isLast == true) {
        await _finishTrasa(isLastStrip: true);
      }
      _lastStripPrompted = false;
    });
  }

  Future<void> _finishTrasa({bool isLastStrip = false}) async {
    if (_aktivnaTrasa == null || _currentTrack.isEmpty) {
      _gpsSub?.cancel();
      setState(() {
        _isTracking = false;
        _aktivnaTrasa = null;
        _currentTrack.clear();
      });
      return;
    }

    await DoznakaService.finishTrasa(
      trasaId: _aktivnaTrasa!,
      points: List.from(_currentTrack),
      isLastStrip: isLastStrip,
    );

    _gpsSub?.cancel();
    setState(() {
      _isTracking = false;
      _aktivnaTrasa = null;
      _currentTrack.clear();
      _lastStripPrompted = false;
    });

    await _loadTrase();

    // Sačuvaj izračunate zone u bazu (u pozadini)
    _saveZoneToDb();
  }

  Future<void> _saveZoneToDb() async {
    if (_aktivan == null) return;
    final finished = _trase.where((t) => t.isFinished).toList();
    final zones = DoznakaCalculator.calculateZone(
      odjelBoundary: _aktivan!.boundaryPoints,
      trase: finished,
      totalAreaHa: _aktivan!.totalAreaHa ?? 0,
    );
    for (final z in zones) {
      if (z.zona.length >= 3) {
        await DoznakaService.saveZona(
          trasaId: z.trasaId,
          zonaPolygon: z.zona,
          areaHa: z.areaHa,
          areaPct: z.areaPct,
        );
      }
    }
  }

  // ── Ručno crtanje granice odjela ─────────────────────────

  void _startDrawingOdjel() {
    setState(() {
      _isDrawingOdjel = true;
      _drawingPts.clear();
    });
  }

  void _onMapTap(TapPosition _, LatLng pt) {
    if (_isDrawingOdjel) {
      setState(() => _drawingPts.add(pt));
    }
  }

  void _undoDrawingPt() {
    if (_drawingPts.isNotEmpty) setState(() => _drawingPts.removeLast());
  }

  void _cancelDrawingOdjel() {
    setState(() {
      _isDrawingOdjel = false;
      _drawingPts.clear();
    });
  }

  Future<void> _completeDrawingOdjel() async {
    if (_drawingPts.length < 3) return;
    final pts = List<LatLng>.from(_drawingPts);
    setState(() {
      _isDrawingOdjel = false;
      _drawingPts.clear();
    });
    await _showDrawnOdjelDialog(pts);
  }

  Future<void> _showDrawnOdjelDialog(List<LatLng> pts) async {
    final gjCtrl = TextEditingController();
    final odjelCtrl = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Naziv odjela'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Unesi naziv gospodarske jedinice i broj odjela.',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: gjCtrl,
              decoration: const InputDecoration(
                labelText: 'Gospodarska jedinica (GJ)',
                hintText: 'npr. RISOVAC KRUPA',
                border: OutlineInputBorder(),
              ),
              textCapitalization: TextCapitalization.characters,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: odjelCtrl,
              decoration: const InputDecoration(
                labelText: 'Odjel',
                hintText: 'npr. 78',
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.text,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Odustani'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2D6A4F),
            ),
            onPressed: () {
              if (gjCtrl.text.trim().isEmpty || odjelCtrl.text.trim().isEmpty) return;
              Navigator.pop(ctx, true);
            },
            child: const Text('Kreiraj'),
          ),
        ],
      ),
    );

    if (ok != true) return;

    final gj = gjCtrl.text.trim().toUpperCase();
    final odjel = odjelCtrl.text.trim();

    // Napravi Polygon GeoJSON iz ucrtanih tačaka
    final coords = [...pts, pts.first]
        .map((p) => [p.longitude, p.latitude])
        .toList();
    final boundary = {
      'type': 'Polygon',
      'coordinates': [coords],
    };

    // Izračunaj površinu
    final areaHa = DoznakaService.calcTotalAreaHa([
      OdjelFeature(gj: gj, odjel: odjel, geometry: boundary),
    ]);

    await _createProjekat(gj, odjel, boundary, areaHa);
  }

  // ── GeoJSON učitavanje ────────────────────────────────────

  Future<void> _pickGeojsonFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['geojson', 'json'],
    );
    if (result == null || result.files.isEmpty) return;

    final path = result.files.first.path;
    if (path == null) return;

    try {
      final content = await File(path).readAsString();
      final json = jsonDecode(content) as Map<String, dynamic>;
      final features = OdjelFeature.parseGeojson(json);
      if (features.isEmpty) {
        _showMsg('Nisu pronađeni odjeli u fajlu');
        return;
      }
      setState(() {
        _loadedGeojson = json;
        _odjelFeatures = features;
        _gjOdjelMap = OdjelFeature.groupByGj(features);
        _selGj = null;
        _selOdjel = null;
      });
      _showNewProjekatSheet();
    } catch (e) {
      _showMsg('Greška pri čitanju fajla: $e');
    }
  }

  void _showNewProjekatSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => _NewProjekatSheet(
        gjOdjelMap: _gjOdjelMap!,
        odjelFeatures: _odjelFeatures!,
        onConfirm: (gj, odjel, boundary, areaHa) async {
          Navigator.pop(ctx);
          await _createProjekat(gj, odjel, boundary, areaHa);
        },
      ),
    );
  }

  Future<void> _createProjekat(
    String gj,
    String odjel,
    Map<String, dynamic> boundary,
    double areaHa,
  ) async {
    try {
      final p = await DoznakaService.createProjekat(
        gj: gj,
        odjel: odjel,
        boundaryGeojson: boundary,
        totalAreaHa: areaHa,
      );
      await _loadProjekti();
      await _aktivirajProjekat(p);
    } catch (e) {
      _showMsg('Greška: $e');
    }
  }

  // ── GPS dozvola ──────────────────────────────────────────

  Future<bool> _requestGpsPermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always ||
        perm == LocationPermission.whileInUse;
  }

  void _showMsg(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  // ── Build ────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Doznaka'),
        backgroundColor: const Color(0xFF1B4332),
        foregroundColor: Colors.white,
        actions: [
          // Layer toggle
          IconButton(
            icon: Icon(
              _showZone ? Icons.layers : Icons.layers_outlined,
              color: Colors.white,
            ),
            tooltip: 'Prikaži zone',
            onPressed: () => setState(() => _showZone = !_showZone),
          ),
          IconButton(
            icon: Icon(
              _showTrack ? Icons.show_chart : Icons.show_chart,
              color: _showTrack ? Colors.white : Colors.white54,
            ),
            tooltip: 'Prikaži tragove',
            onPressed: () => setState(() => _showTrack = !_showTrack),
          ),
        ],
      ),
      body: Stack(
        children: [
          // ─── Mapa ──────────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: const LatLng(44.5, 17.0),
              initialZoom: 10,
              minZoom: AppConstants.minZoom,
              maxZoom: AppConstants.maxZoom,
              onTap: _onMapTap,
            ),
            children: [
              TileLayer(
                urlTemplate: AppConstants.osmTileUrl,
                userAgentPackageName: 'com.example.doznaka',
              ),

              // Granica odjela
              if (_aktivan != null)
                ..._aktivan!.allRings.map((ring) => PolygonLayer(
                      polygons: [
                        Polygon(
                          points: ring,
                          borderColor: const Color(0xFF2D6A4F),
                          borderStrokeWidth: 2.5,
                          color: const Color(0xFF2D6A4F).withOpacity(0.06),
                        ),
                      ],
                    )),

              // Zone po projektantima
              if (_showZone)
                PolygonLayer(
                  polygons: _trase
                      .where((t) => t.isFinished && t.zona != null && t.zona!.length >= 3)
                      .map((t) {
                    final color = _colorForUser(t.userId);
                    return Polygon(
                      points: t.zona!,
                      color: color.withOpacity(0.3),
                      borderColor: color.withOpacity(0.7),
                      borderStrokeWidth: 1.5,
                    );
                  }).toList(),
                ),

              // GPS tragovi završenih trasa
              if (_showTrack)
                PolylineLayer(
                  polylines: _trase
                      .where((t) => t.isFinished && t.track.isNotEmpty)
                      .map((t) => Polyline(
                            points: t.track,
                            color: _colorForUser(t.userId),
                            strokeWidth: 2.0,
                          ))
                      .toList(),
                ),

              // Aktivna (trenutna) trasa
              if (_currentTrack.isNotEmpty)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: _currentTrack,
                      color: Colors.orange,
                      strokeWidth: 3.0,
                    ),
                  ],
                ),

              // Moja pozicija
              if (_myPosition != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: _myPosition!,
                      width: 20,
                      height: 20,
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.orange,
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                          boxShadow: const [
                            BoxShadow(color: Colors.black26, blurRadius: 4)
                          ],
                        ),
                      ),
                    ),
                  ],
                ),

              // ── Drawing preview (crtanje odjela) ─────────
              if (_isDrawingOdjel && _drawingPts.length >= 3)
                PolygonLayer(
                  polygons: [
                    Polygon(
                      points: _drawingPts,
                      color: const Color(0xFF2D6A4F).withOpacity(0.18),
                      borderColor: const Color(0xFF2D6A4F),
                      borderStrokeWidth: 2.0,
                    ),
                  ],
                ),
              if (_isDrawingOdjel && _drawingPts.length >= 2)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: [..._drawingPts, _drawingPts.first],
                      color: const Color(0xFF2D6A4F),
                      strokeWidth: 2.0,
                      isDotted: true,
                    ),
                  ],
                ),
              if (_isDrawingOdjel && _drawingPts.isNotEmpty)
                MarkerLayer(
                  markers: _drawingPts
                      .map((pt) => Marker(
                            point: pt,
                            width: 14,
                            height: 14,
                            child: Container(
                              decoration: BoxDecoration(
                                color: const Color(0xFF2D6A4F),
                                shape: BoxShape.circle,
                                border: Border.all(
                                    color: Colors.white, width: 2),
                              ),
                            ),
                          ))
                      .toList(),
                ),
            ],
          ),

          // ─── Lista projekata (ako nema aktivnog i ne crtamo) ──
          if (_aktivan == null && !_isDrawingOdjel)
            _ProjekatSelector(
              projekti: _projekti,
              onSelect: _aktivirajProjekat,
              onPickGeojson: _pickGeojsonFile,
              onDrawOdjel: _startDrawingOdjel,
            ),

          // ─── Drawing toolbar (crtanje granice odjela) ─────
          if (_isDrawingOdjel)
            _DrawingOdjelOverlay(
              numPts: _drawingPts.length,
              onUndo: _undoDrawingPt,
              onCancel: _cancelDrawingOdjel,
              onComplete: _drawingPts.length >= 3 ? _completeDrawingOdjel : null,
            ),

          // ─── Doznaka panel (bottom sheet) ──────────────
          if (_aktivan != null && _showPanel)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: DoznakaPanel(
                projekat: _aktivan!,
                trase: _trase,
                userNames: _userNames,
                userColors: _userColors,
                isTracking: _isTracking,
                onStartTrasa: _startTrasa,
                onFinishTrasa: () => _finishTrasa(),
                onClose: () => setState(() => _showPanel = false),
              ),
            ),

          // ─── FAB (panel toggle) ────────────────────────
          if (_aktivan != null && !_showPanel)
            Positioned(
              right: 16,
              bottom: 24,
              child: Column(
                children: [
                  FloatingActionButton.small(
                    heroTag: 'doznaka_panel',
                    backgroundColor: const Color(0xFF1B4332),
                    onPressed: () => setState(() => _showPanel = true),
                    child: const Icon(Icons.bar_chart, color: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  if (!_isTracking)
                    FloatingActionButton(
                      heroTag: 'doznaka_start',
                      backgroundColor: const Color(0xFF2D6A4F),
                      onPressed: _startTrasa,
                      child: const Icon(Icons.play_arrow, color: Colors.white),
                    )
                  else
                    FloatingActionButton(
                      heroTag: 'doznaka_stop',
                      backgroundColor: Colors.red.shade700,
                      onPressed: () => _finishTrasa(),
                      child: const Icon(Icons.stop, color: Colors.white),
                    ),
                ],
              ),
            ),

          // ─── Tracking indikator ────────────────────────
          if (_isTracking)
            Positioned(
              top: 12,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.orange.shade700,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: const [
                      BoxShadow(color: Colors.black26, blurRadius: 6)
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.fiber_manual_record,
                          color: Colors.white, size: 12),
                      const SizedBox(width: 6),
                      Text(
                        'Snimanje · ${_currentTrack.length} tačaka',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  LatLng _centroid(List<LatLng> pts) {
    double lat = 0, lng = 0;
    for (final p in pts) {
      lat += p.latitude;
      lng += p.longitude;
    }
    return LatLng(lat / pts.length, lng / pts.length);
  }

  Color _colorForUser(String userId) {
    final hex = _userColors[userId];
    if (hex == null) return Colors.teal;
    try {
      return Color(int.parse('FF${hex.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.teal;
    }
  }
}

// ── Selector projekta ─────────────────────────────────────

class _ProjekatSelector extends StatelessWidget {
  final List<DoznakaProjekat> projekti;
  final Function(DoznakaProjekat) onSelect;
  final VoidCallback onPickGeojson;
  final VoidCallback onDrawOdjel;

  const _ProjekatSelector({
    required this.projekti,
    required this.onSelect,
    required this.onPickGeojson,
    required this.onDrawOdjel,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(
              children: [
                const Text(
                  'Doznaka projekti',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                // Opcija 2: ručno crtanje
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF2D6A4F),
                    side: const BorderSide(color: Color(0xFF2D6A4F)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    visualDensity: VisualDensity.compact,
                  ),
                  icon: const Icon(Icons.edit_location_alt, size: 16),
                  label: const Text('Ucrtaj',
                      style: TextStyle(fontSize: 13)),
                  onPressed: onDrawOdjel,
                ),
                const SizedBox(width: 8),
                // Opcija 1: GeoJSON fajl
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF2D6A4F),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    visualDensity: VisualDensity.compact,
                  ),
                  icon: const Icon(Icons.upload_file, size: 16),
                  label: const Text('GeoJSON',
                      style: TextStyle(fontSize: 13)),
                  onPressed: onPickGeojson,
                ),
              ],
            ),
          ),
          if (projekti.isEmpty)
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.forest_outlined,
                        size: 56, color: Colors.grey),
                    const SizedBox(height: 12),
                    const Text(
                      'Nema projekata',
                      style: TextStyle(
                          color: Colors.grey, fontWeight: FontWeight.w500),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Učitaj GeoJSON ili ucrtaj granicu odjela',
                      style: TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                    const SizedBox(height: 24),
                    // Larger draw button in empty state
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF2D6A4F),
                        side: const BorderSide(color: Color(0xFF2D6A4F)),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 12),
                      ),
                      icon: const Icon(Icons.edit_location_alt),
                      label: const Text('Ucrtaj granicu odjela'),
                      onPressed: onDrawOdjel,
                    ),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                itemCount: projekti.length,
                itemBuilder: (ctx, i) {
                  final p = projekti[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: const CircleAvatar(
                        backgroundColor: Color(0xFF2D6A4F),
                        child: Icon(Icons.forest,
                            color: Colors.white, size: 20),
                      ),
                      title: Text(
                        p.displayName,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: p.totalAreaHa != null
                          ? Text(
                              '${p.totalAreaHa!.toStringAsFixed(1)} ha')
                          : null,
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => onSelect(p),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

// ── Drawing overlay (crtanje granice odjela) ──────────────

class _DrawingOdjelOverlay extends StatelessWidget {
  final int numPts;
  final VoidCallback onUndo;
  final VoidCallback onCancel;
  final VoidCallback? onComplete;

  const _DrawingOdjelOverlay({
    required this.numPts,
    required this.onUndo,
    required this.onCancel,
    required this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // ─── Gornji banner ────────────────────────────────
        Positioned(
          top: 12,
          left: 12,
          right: 12,
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFF1B4332),
              borderRadius: BorderRadius.circular(10),
              boxShadow: const [
                BoxShadow(
                    color: Colors.black26,
                    blurRadius: 6,
                    offset: Offset(0, 2))
              ],
            ),
            child: Row(
              children: [
                const Icon(Icons.touch_app,
                    color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    numPts == 0
                        ? 'Tapni na mapu da dodaš tačku granice'
                        : numPts < 3
                            ? '$numPts tačaka — potrebno još ${3 - numPts}'
                            : '$numPts tačaka — ucrtano',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
          ),
        ),

        // ─── Donji toolbar ────────────────────────────────
        Positioned(
          bottom: 24,
          left: 12,
          right: 12,
          child: Row(
            children: [
              // Odustani
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.red.shade600,
                    side: BorderSide(color: Colors.red.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                  onPressed: onCancel,
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('Odustani'),
                ),
              ),
              const SizedBox(width: 8),
              // Poništi zadnju tačku
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  backgroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 13),
                ),
                onPressed: numPts > 0 ? onUndo : null,
                child: const Icon(Icons.undo, size: 20),
              ),
              const SizedBox(width: 8),
              // Završi poligon
              Expanded(
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: onComplete != null
                        ? const Color(0xFF2D6A4F)
                        : Colors.grey,
                    padding: const EdgeInsets.symmetric(vertical: 13),
                  ),
                  onPressed: onComplete,
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Završi'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Novi projekat sheet ───────────────────────────────────

class _NewProjekatSheet extends StatefulWidget {
  final Map<String, Set<String>> gjOdjelMap;
  final List<OdjelFeature> odjelFeatures;
  final Function(String gj, String odjel, Map<String, dynamic> boundary, double areaHa) onConfirm;

  const _NewProjekatSheet({
    required this.gjOdjelMap,
    required this.odjelFeatures,
    required this.onConfirm,
  });

  @override
  State<_NewProjekatSheet> createState() => _NewProjekatSheetState();
}

class _NewProjekatSheetState extends State<_NewProjekatSheet> {
  String? _selGj;
  String? _selOdjel;

  List<String> get _gjs => widget.gjOdjelMap.keys.toList()..sort();
  List<String> get _odjeli {
    if (_selGj == null) return [];
    return (widget.gjOdjelMap[_selGj!] ?? {}).toList()
      ..sort((a, b) {
        final ai = int.tryParse(a) ?? 0;
        final bi = int.tryParse(b) ?? 0;
        return ai.compareTo(bi);
      });
  }

  @override
  Widget build(BuildContext context) {
    final canConfirm = _selGj != null && _selOdjel != null;

    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 20, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Novi doznaka projekat',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          const Text(
            'Odaberi gospodarsku jedinicu i odjel',
            style: TextStyle(color: Colors.grey, fontSize: 13),
          ),
          const SizedBox(height: 20),

          // GJ dropdown
          DropdownButtonFormField<String>(
            value: _selGj,
            decoration: const InputDecoration(
              labelText: 'Gospodarska jedinica (GJ)',
              border: OutlineInputBorder(),
            ),
            items: _gjs
                .map((gj) => DropdownMenuItem(value: gj, child: Text(gj)))
                .toList(),
            onChanged: (v) => setState(() {
              _selGj = v;
              _selOdjel = null;
            }),
          ),
          const SizedBox(height: 12),

          // Odjel dropdown
          DropdownButtonFormField<String>(
            value: _selOdjel,
            decoration: const InputDecoration(
              labelText: 'Odjel',
              border: OutlineInputBorder(),
            ),
            items: _odjeli
                .map((o) => DropdownMenuItem(value: o, child: Text('Odjel $o')))
                .toList(),
            onChanged: _selGj == null
                ? null
                : (v) => setState(() => _selOdjel = v),
          ),
          const SizedBox(height: 20),

          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF2D6A4F),
              ),
              onPressed: canConfirm ? _confirm : null,
              child: const Text('Kreiraj projekat'),
            ),
          ),
        ],
      ),
    );
  }

  void _confirm() {
    if (_selGj == null || _selOdjel == null) return;
    final odsjeci = widget.odjelFeatures
        .where((f) => f.gj == _selGj && f.odjel == _selOdjel)
        .toList();
    final boundary = DoznakaService.mergeOdsjeci(odsjeci);
    final areaHa = DoznakaService.calcTotalAreaHa(odsjeci);
    widget.onConfirm(_selGj!, _selOdjel!, boundary, areaHa);
  }
}
