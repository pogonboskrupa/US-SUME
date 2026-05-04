// lib/screens/marking/save_marking_dialog.dart
// Dialog za snimanje obilježene plohe nakon crtanja

import 'package:flutter/material.dart';
import '../../models/models.dart';

class SaveMarkingDialog extends StatefulWidget {
  final MarkingType? preselected;
  final double? areaHa;

  const SaveMarkingDialog({
    super.key,
    this.preselected,
    this.areaHa,
  });

  @override
  State<SaveMarkingDialog> createState() => _SaveMarkingDialogState();
}

class _SaveMarkingDialogState extends State<SaveMarkingDialog> {
  late MarkingType _selectedType;
  final _labelCtrl = TextEditingController();
  final _noteCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _selectedType = widget.preselected ?? MarkingType.unsuitableFelling;
  }

  @override
  void dispose() {
    _labelCtrl.dispose();
    _noteCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Naslov
              Row(
                children: [
                  const Icon(Icons.layers_outlined,
                      color: Color(0xFF2D6A4F)),
                  const SizedBox(width: 8),
                  const Text(
                    'Obilježi plohu',
                    style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const Spacer(),
                  if (widget.areaHa != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '${widget.areaHa!.toStringAsFixed(2)} ha',
                        style: TextStyle(
                            color: Colors.green.shade700,
                            fontWeight: FontWeight.w600,
                            fontSize: 12),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),

              // ─── Tip plohe ─────────────────────────────
              const Text('Tip plohe',
                  style: TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 13)),
              const SizedBox(height: 8),
              ...MarkingType.values.map((type) => _TypeTile(
                    type: type,
                    selected: _selectedType == type,
                    onTap: () => setState(() => _selectedType = type),
                  )),

              const SizedBox(height: 16),

              // ─── Kratki naziv ──────────────────────────
              TextField(
                controller: _labelCtrl,
                decoration: InputDecoration(
                  labelText: 'Kratki naziv (opcionalno)',
                  hintText:
                      'npr. "Vlažno tlo uz potok", "Briga 5"...',
                  prefixIcon: const Icon(Icons.label_outline),
                  filled: true,
                  fillColor: const Color(0xFFF4F9F6),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 12),

              // ─── Napomena ──────────────────────────────
              TextField(
                controller: _noteCtrl,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'Napomena terena (opcionalno)',
                  hintText:
                      'Detaljnija napomena za ovu plohu...',
                  prefixIcon: const Icon(Icons.notes_outlined),
                  alignLabelWithHint: true,
                  filled: true,
                  fillColor: const Color(0xFFF4F9F6),
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
              const SizedBox(height: 20),

              // ─── Dugmad ────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Odustani'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: ElevatedButton.icon(
                      onPressed: () => Navigator.pop(context, {
                        'type': _selectedType,
                        'label': _labelCtrl.text.trim().isEmpty
                            ? null
                            : _labelCtrl.text.trim(),
                        'note': _noteCtrl.text.trim().isEmpty
                            ? null
                            : _noteCtrl.text.trim(),
                      }),
                      icon: const Icon(Icons.save_outlined, size: 18),
                      label: const Text('Sačuvaj plohu'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeTile extends StatelessWidget {
  final MarkingType type;
  final bool selected;
  final VoidCallback onTap;

  const _TypeTile({
    required this.type,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? type.color.withOpacity(0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? type.color : Colors.grey.shade200,
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Text(type.emoji, style: const TextStyle(fontSize: 18)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(type.label,
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: selected ? type.color : null)),
                  Text(type.description,
                      style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade500)),
                ],
              ),
            ),
            if (selected)
              Icon(Icons.check_circle, color: type.color, size: 20),
          ],
        ),
      ),
    );
  }
}
