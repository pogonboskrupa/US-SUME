// lib/screens/marking/drawing_tool.dart
// Alat za crtanje poligona na mapi (tap po tačkama)

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

/// Widget koji se renderuje IZNAD mape i hvata tapove za crtanje
class DrawingTool extends StatefulWidget {
  final bool isActive;
  final Function(List<LatLng>) onPolygonComplete;
  final VoidCallback onCancel;

  const DrawingTool({
    super.key,
    required this.isActive,
    required this.onPolygonComplete,
    required this.onCancel,
  });

  @override
  State<DrawingTool> createState() => _DrawingToolState();
}

class _DrawingToolState extends State<DrawingTool> {
  final List<LatLng> _points = [];

  void _onTap(TapPosition tapPos, LatLng latLng) {
    if (!widget.isActive) return;
    setState(() => _points.add(latLng));
  }

  void _undo() {
    if (_points.isNotEmpty) setState(() => _points.removeLast());
  }

  void _complete() {
    if (_points.length >= 3) {
      widget.onPolygonComplete(List.from(_points));
      setState(() => _points.clear());
    }
  }

  void _cancel() {
    setState(() => _points.clear());
    widget.onCancel();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isActive) return const SizedBox.shrink();

    return Stack(
      children: [
        // Transparentni overlay koji hvata tapove
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            child: const SizedBox.expand(),
          ),
        ),

        // Prikaz tačaka i linija na mapi — handluje se kroz MapLayers
        // (crtanje se radi u MapScreen kroz drawingPoints)

        // ─── Gornji banner ─────────────────────────────────
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.orange.shade700,
              borderRadius: BorderRadius.circular(10),
              boxShadow: [
                BoxShadow(
                    color: Colors.black26,
                    blurRadius: 6,
                    offset: const Offset(0, 2))
              ],
            ),
            child: Row(
              children: [
                const Icon(Icons.touch_app, color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _points.isEmpty
                        ? 'Tapni na mapu da dodaš tačku'
                        : '${_points.length} tačaka — tapni da nastaviš',
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

        // ─── Donji toolbar ─────────────────────────────────
        Positioned(
          bottom: 90,
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
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: _cancel,
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
                      horizontal: 16, vertical: 12),
                ),
                onPressed: _points.isNotEmpty ? _undo : null,
                child: const Icon(Icons.undo, size: 20),
              ),
              const SizedBox(width: 8),
              // Završi crtanje
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _points.length >= 3
                        ? Colors.green.shade700
                        : Colors.grey,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: _points.length >= 3 ? _complete : null,
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Završi plohu'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Mixin za MapScreen koji upravlja crtanjem ─────────────
mixin DrawingMixin<T extends StatefulWidget> on State<T> {
  final List<LatLng> drawingPoints = [];
  bool isDrawing = false;
  MarkingTypeSelection? pendingType;

  void startDrawing(MarkingTypeSelection type) {
    setState(() {
      isDrawing = true;
      pendingType = type;
      drawingPoints.clear();
    });
  }

  void addDrawingPoint(LatLng point) {
    if (!isDrawing) return;
    setState(() => drawingPoints.add(point));
  }

  void undoLastPoint() {
    if (drawingPoints.isNotEmpty) {
      setState(() => drawingPoints.removeLast());
    }
  }

  void cancelDrawing() {
    setState(() {
      isDrawing = false;
      drawingPoints.clear();
      pendingType = null;
    });
  }

  List<LatLng> finishDrawing() {
    final pts = List<LatLng>.from(drawingPoints);
    setState(() {
      isDrawing = false;
      drawingPoints.clear();
    });
    return pts;
  }
}

class MarkingTypeSelection {
  final String dbValue;
  final String label;
  const MarkingTypeSelection(this.dbValue, this.label);
}
