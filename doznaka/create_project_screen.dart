// lib/screens/project/create_project_screen.dart

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:gap/gap.dart';
import '../../core/constants.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/supabase_service.dart';
import '../../services/geo_parser.dart';

class CreateProjectScreen extends ConsumerStatefulWidget {
  const CreateProjectScreen({super.key});

  @override
  ConsumerState<CreateProjectScreen> createState() =>
      _CreateProjectScreenState();
}

class _CreateProjectScreenState extends ConsumerState<CreateProjectScreen> {
  final _nameCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _areaCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  GeoParseResult? _parsedGeo;
  String? _geoFilename;
  bool _loading = false;
  String? _error;

  // Lista dodanih inženjera (userId, color, orderIndex)
  final List<_EngineerEntry> _engineers = [];

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    _areaCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['kml', 'geojson', 'json'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    final content = file.bytes != null
        ? String.fromCharCodes(file.bytes!)
        : await File(file.path!).readAsString();

    try {
      final parsed = GeoParser.parse(content, file.name);
      if (parsed == null) throw const FormatException('Nepoznat format');

      setState(() {
        _parsedGeo = parsed;
        _geoFilename = file.name;
        // Ako nema površine, predloži aproksimativnu
        if (_areaCtrl.text.isEmpty) {
          _areaCtrl.text =
              parsed.first.approximateAreaHa.toStringAsFixed(1);
        }
      });
    } catch (e) {
      setState(() => _error = 'Greška pri čitanju fajla: $e');
    }
  }

  Future<void> _createProject() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() { _loading = true; _error = null; });

    try {
      final userId = SupabaseService.currentUserId!;
      final geojson = _parsedGeo != null
          ? GeoParser.toGeoJson(_parsedGeo!.first.coordinates)
          : null;

      final project = await SupabaseService.createProject(
        name: _nameCtrl.text.trim(),
        description: _descCtrl.text.trim().isEmpty
            ? null
            : _descCtrl.text.trim(),
        boundaryGeojson: geojson,
        knownAreaHa: double.tryParse(_areaCtrl.text),
      );

      // Dodaj inženjere (kreator je već dodat kao manager s index 0)
      for (int i = 0; i < _engineers.length; i++) {
        final eng = _engineers[i];
        await SupabaseService.addMember(
          projectId: project.id,
          userId: eng.userId,
          role: 'engineer',
          color: eng.colorHex,
          orderIndex: i + 1, // manager je 0
        );
      }

      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() => _error = 'Greška: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _addEngineer(UserProfile user) {
    if (_engineers.any((e) => e.userId == user.id)) return;
    final colorHex =
        AppConstants.engineerColors[(_engineers.length + 1) % AppConstants.engineerColors.length];
    setState(() {
      _engineers.add(_EngineerEntry(
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        colorHex: colorHex,
      ));
    });
    _searchCtrl.clear();
  }

  void _changeColor(int index) {
    Color current = Color(int.parse(
        'FF${_engineers[index].colorHex.replaceAll('#', '')}',
        radix: 16));

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Odaberi boju traga'),
        content: ColorPicker(
          pickerColor: current,
          onColorChanged: (c) => current = c,
          pickerAreaHeightPercent: 0.7,
          displayThumbColor: true,
          enableAlpha: false,
        ),
        actions: [
          TextButton(
            onPressed: () {
              final hex =
                  '#${current.value.toRadixString(16).substring(2).toUpperCase()}';
              setState(() => _engineers[index].colorHex = hex);
              Navigator.pop(context);
            },
            child: const Text('Potvrdi'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Novi odjel')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ─── OSNOVNO ─────────────────────────────────────
            _Section(
              title: 'Osnovni podaci',
              icon: Icons.info_outline,
              child: Column(
                children: [
                  TextFormField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Naziv odjela *',
                      hintText: 'npr. Odjel 15 – Kozara',
                    ),
                    validator: (v) =>
                        (v?.trim().isEmpty ?? true) ? 'Naziv je obavezan' : null,
                  ),
                  const Gap(12),
                  TextFormField(
                    controller: _descCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Opis (opcionalno)',
                    ),
                    maxLines: 2,
                  ),
                ],
              ),
            ),
            const Gap(16),

            // ─── GRANICA ODJELA ───────────────────────────────
            _Section(
              title: 'Granica odjela',
              icon: Icons.map_outlined,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  OutlinedButton.icon(
                    onPressed: _pickFile,
                    icon: const Icon(Icons.upload_file),
                    label: const Text('Uvezi KML ili GeoJSON'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                    ),
                  ),
                  if (_parsedGeo != null) ...[
                    const Gap(8),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green.shade200),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle,
                              color: Colors.green, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              '$_geoFilename — ${_parsedGeo!.first.name} '
                              '(${_parsedGeo!.first.coordinates.length} tačaka)',
                              style: const TextStyle(fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const Gap(12),
                  TextFormField(
                    controller: _areaCtrl,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Poznata površina (ha)',
                      hintText: 'Unesite katastarski podatak',
                      suffixText: 'ha',
                    ),
                  ),
                  const Gap(4),
                  Text(
                    'Ako unesete površinu iz katastra, proračun zona bit će '
                    'preciznih. Inače se koristi izračun iz koordinata.',
                    style: TextStyle(
                        fontSize: 11, color: Colors.grey.shade500),
                  ),
                ],
              ),
            ),
            const Gap(16),

            // ─── INŽENJERI ────────────────────────────────────
            _Section(
              title: 'Inženjeri',
              icon: Icons.people_outline,
              child: Column(
                children: [
                  // Search
                  _UserSearchField(
                    controller: _searchCtrl,
                    onUserSelected: _addEngineer,
                  ),
                  const Gap(12),

                  // Lista dodanih
                  if (_engineers.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: Text(
                        'Pretraži i dodaj inženjere po email adresi. '
                        'Redosljed u listi određuje koji inženjer je "prvi".',
                        style: TextStyle(
                            color: Colors.grey.shade500, fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ),

                  ReorderableListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _engineers.length,
                    onReorder: (oldIdx, newIdx) {
                      setState(() {
                        if (newIdx > oldIdx) newIdx--;
                        final item = _engineers.removeAt(oldIdx);
                        _engineers.insert(newIdx, item);
                      });
                    },
                    itemBuilder: (_, i) {
                      final eng = _engineers[i];
                      final color = Color(int.parse(
                          'FF${eng.colorHex.replaceAll('#', '')}',
                          radix: 16));
                      return ListTile(
                        key: ValueKey(eng.userId),
                        leading: GestureDetector(
                          onTap: () => _changeColor(i),
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: color,
                              border: Border.all(
                                  color: color.withOpacity(0.4), width: 2),
                            ),
                            child: const Center(
                              child: Icon(Icons.colorize,
                                  color: Colors.white, size: 16),
                            ),
                          ),
                        ),
                        title: Text(eng.fullName),
                        subtitle: Text(eng.email,
                            style: const TextStyle(fontSize: 12)),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.grey.shade100,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text('Inž. ${i + 1}',
                                  style: const TextStyle(fontSize: 11)),
                            ),
                            IconButton(
                              icon: const Icon(Icons.close,
                                  size: 18, color: Colors.red),
                              onPressed: () =>
                                  setState(() => _engineers.removeAt(i)),
                            ),
                          ],
                        ),
                      );
                    },
                  ),

                  if (_engineers.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Povuci i otpusti da promijeniš redosljed.',
                        style: TextStyle(
                            fontSize: 11, color: Colors.grey.shade400),
                      ),
                    ),
                ],
              ),
            ),
            const Gap(24),

            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13)),
              ),

            ElevatedButton(
              onPressed: _loading ? null : _createProject,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size(double.infinity, 52),
              ),
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Kreiraj odjel',
                      style: TextStyle(fontSize: 16)),
            ),
            const Gap(32),
          ],
        ),
      ),
    );
  }
}

// ─── User search widget ──────────────────────────────────
class _UserSearchField extends ConsumerStatefulWidget {
  final TextEditingController controller;
  final Function(UserProfile) onUserSelected;

  const _UserSearchField(
      {required this.controller, required this.onUserSelected});

  @override
  ConsumerState<_UserSearchField> createState() => _UserSearchFieldState();
}

class _UserSearchFieldState extends ConsumerState<_UserSearchField> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final resultsAsync = ref.watch(userSearchProvider(_query));

    return Column(
      children: [
        TextFormField(
          controller: widget.controller,
          decoration: const InputDecoration(
            labelText: 'Dodaj inženjera (email ili ime)',
            prefixIcon: Icon(Icons.search),
          ),
          onChanged: (v) => setState(() => _query = v.trim()),
        ),
        if (_query.length >= 2)
          resultsAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(8),
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            error: (_, __) => const SizedBox(),
            data: (users) => users.isEmpty
                ? Padding(
                    padding: const EdgeInsets.all(8),
                    child: Text('Nema rezultata za "$_query"',
                        style: TextStyle(color: Colors.grey.shade500)),
                  )
                : Card(
                    margin: const EdgeInsets.only(top: 4),
                    child: Column(
                      children: users
                          .map((u) => ListTile(
                                dense: true,
                                leading: const CircleAvatar(
                                    radius: 16,
                                    child: Icon(Icons.person, size: 18)),
                                title: Text(u.fullName,
                                    style: const TextStyle(fontSize: 14)),
                                subtitle: Text(u.email,
                                    style: const TextStyle(fontSize: 12)),
                                onTap: () => widget.onUserSelected(u),
                              ))
                          .toList(),
                    ),
                  ),
          ),
      ],
    );
  }
}

// ─── Section wrapper ─────────────────────────────────────
class _Section extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;

  const _Section(
      {required this.title, required this.icon, required this.child});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: const Color(0xFF2D6A4F)),
                const SizedBox(width: 8),
                Text(title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                        color: Color(0xFF2D6A4F))),
              ],
            ),
            const Divider(height: 16),
            child,
          ],
        ),
      ),
    );
  }
}

// ─── Data class ──────────────────────────────────────────
class _EngineerEntry {
  final String userId;
  final String fullName;
  final String email;
  String colorHex;

  _EngineerEntry({
    required this.userId,
    required this.fullName,
    required this.email,
    required this.colorHex,
  });
}
