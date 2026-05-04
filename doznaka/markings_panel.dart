// lib/screens/marking/markings_panel.dart
// Panel/sheet za prikaz i upravljanje svim obilježenim plohama

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/models.dart';
import '../../services/marking_service.dart';
import '../../services/supabase_service.dart';

class MarkingsPanel extends StatelessWidget {
  final List<AreaMarking> markings;
  final bool isManager;
  final Function(AreaMarking) onDelete;
  final Function(AreaMarking) onEdit;
  final VoidCallback onClose;

  const MarkingsPanel({
    super.key,
    required this.markings,
    required this.isManager,
    required this.onDelete,
    required this.onEdit,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    // Grupiraj po tipu
    final grouped = <MarkingType, List<AreaMarking>>{};
    for (final m in markings) {
      grouped.putIfAbsent(m.type, () => []).add(m);
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      maxChildSize: 0.92,
      minChildSize: 0.3,
      expand: false,
      builder: (ctx, controller) => Column(
        children: [
          // ─── Header ────────────────────────────────────
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
            decoration: BoxDecoration(
              color: Theme.of(context).cardColor,
              borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16)),
              boxShadow: [
                BoxShadow(
                    color: Colors.black12,
                    blurRadius: 4,
                    offset: const Offset(0, -2))
              ],
            ),
            child: Row(
              children: [
                const Icon(Icons.layers, color: Color(0xFF2D6A4F)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Obilježene plohe',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold)),
                      Text('${markings.length} ploha ukupno',
                          style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 12)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: onClose,
                ),
              ],
            ),
          ),

          // ─── Legenda ────────────────────────────────────
          if (markings.isEmpty)
            const Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.layers_outlined,
                        size: 48, color: Colors.grey),
                    SizedBox(height: 12),
                    Text('Nema obilježenih ploha',
                        style: TextStyle(color: Colors.grey)),
                    SizedBox(height: 4),
                    Text(
                      'Tapni ✏️ na mapi da počneš crtati',
                      style:
                          TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.all(12),
                children: [
                  // ─── Statistika po tipu ──────────────
                  _SummaryRow(grouped: grouped),
                  const SizedBox(height: 12),

                  // ─── Liste po tipu ───────────────────
                  ...MarkingType.values
                      .where((t) => grouped.containsKey(t))
                      .map((type) => Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Tip header
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(
                                        vertical: 6),
                                child: Row(
                                  children: [
                                    Text(type.emoji,
                                        style: const TextStyle(
                                            fontSize: 16)),
                                    const SizedBox(width: 6),
                                    Text(
                                      '${type.label} (${grouped[type]!.length})',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        color: type.color,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              ...grouped[type]!
                                  .map((m) => _MarkingCard(
                                        marking: m,
                                        isManager: isManager,
                                        isOwner: m.createdBy ==
                                            SupabaseService
                                                .currentUserId,
                                        onDelete: () => onDelete(m),
                                        onEdit: () => onEdit(m),
                                      )),
                              const SizedBox(height: 8),
                            ],
                          )),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final Map<MarkingType, List<AreaMarking>> grouped;

  const _SummaryRow({required this.grouped});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F9F6),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: grouped.entries.map((e) {
          final totalHa = e.value
              .map((m) => m.areaHa ?? 0)
              .fold(0.0, (a, b) => a + b);
          return Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: e.key.fillColor,
              border: Border.all(
                  color: e.key.borderColor.withOpacity(0.5)),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(e.key.emoji,
                    style: const TextStyle(fontSize: 12)),
                const SizedBox(width: 4),
                Text(
                  '${e.value.length}×',
                  style: TextStyle(
                      fontSize: 11,
                      color: e.key.color,
                      fontWeight: FontWeight.w600),
                ),
                if (totalHa > 0) ...[
                  const SizedBox(width: 4),
                  Text(
                    '${totalHa.toStringAsFixed(1)} ha',
                    style: TextStyle(
                        fontSize: 10, color: e.key.color),
                  ),
                ],
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _MarkingCard extends StatelessWidget {
  final AreaMarking marking;
  final bool isManager;
  final bool isOwner;
  final VoidCallback onDelete;
  final VoidCallback onEdit;

  const _MarkingCard({
    required this.marking,
    required this.isManager,
    required this.isOwner,
    required this.onDelete,
    required this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    final type = marking.type;

    return Card(
      margin: const EdgeInsets.only(bottom: 6),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Color bar
            Container(
              width: 4,
              height: 56,
              decoration: BoxDecoration(
                color: type.color,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(type.emoji),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          marking.displayLabel,
                          style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (marking.areaHa != null)
                        Text(
                          '${marking.areaHa!.toStringAsFixed(2)} ha',
                          style: TextStyle(
                              fontSize: 11,
                              color: type.color,
                              fontWeight: FontWeight.w600),
                        ),
                    ],
                  ),
                  if (marking.note != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      marking.note!,
                      style: TextStyle(
                          color: Colors.grey.shade600,
                          fontSize: 11),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 2),
                  Text(
                    DateFormat('dd.MM.yyyy HH:mm')
                        .format(marking.createdAt.toLocal()),
                    style: TextStyle(
                        color: Colors.grey.shade400, fontSize: 10),
                  ),
                ],
              ),
            ),

            // Actions
            if (isManager || isOwner)
              Column(
                children: [
                  IconButton(
                    icon: Icon(Icons.edit_outlined,
                        size: 18, color: Colors.grey.shade500),
                    constraints: const BoxConstraints(
                        maxWidth: 32, maxHeight: 32),
                    padding: EdgeInsets.zero,
                    onPressed: onEdit,
                    tooltip: 'Uredi',
                  ),
                  IconButton(
                    icon: Icon(Icons.delete_outline,
                        size: 18, color: Colors.red.shade300),
                    constraints: const BoxConstraints(
                        maxWidth: 32, maxHeight: 32),
                    padding: EdgeInsets.zero,
                    onPressed: onDelete,
                    tooltip: 'Obriši',
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
