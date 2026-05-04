// lib/screens/widgets/area_stats_panel.dart

import 'package:flutter/material.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';

class AreaStatsPanel extends StatelessWidget {
  final List<ZoneEntry> zones;
  final List<ProjectMember> members;
  final double? knownAreaHa;
  final bool isExpanded;
  final VoidCallback onToggle;

  const AreaStatsPanel({
    super.key,
    required this.zones,
    required this.members,
    this.knownAreaHa,
    required this.isExpanded,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    if (zones.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Card(
        elevation: 4,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            InkWell(
              onTap: onToggle,
              borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(12)),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.area_chart,
                        size: 18, color: Color(0xFF2D6A4F)),
                    const SizedBox(width: 8),
                    const Text('Pregled zona',
                        style: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF2D6A4F))),
                    if (knownAreaHa != null) ...[
                      const Spacer(),
                      Text(
                        'Ukupno: ${knownAreaHa!.toStringAsFixed(1)} ha',
                        style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600),
                      ),
                    ],
                    const SizedBox(width: 8),
                    Icon(
                      isExpanded
                          ? Icons.keyboard_arrow_down
                          : Icons.keyboard_arrow_up,
                      color: Colors.grey,
                      size: 20,
                    ),
                  ],
                ),
              ),
            ),

            if (isExpanded) ...[
              const Divider(height: 1),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: zones.map<Widget>((z) {
                    final member = members
                        .where((m) => m.userId == z.userId)
                        .firstOrNull;
                    final color = _hex(z.color);
                    final name = member?.displayName ??
                        'Inž. ${(member?.orderIndex ?? 0) + 1}';

                    return Container(
                      margin: const EdgeInsets.only(right: 10),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.1),
                        border:
                            Border.all(color: color.withOpacity(0.4)),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                  width: 10,
                                  height: 10,
                                  decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: color)),
                              const SizedBox(width: 6),
                              Text(name.split(' ').first,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${z.areaHa.toStringAsFixed(2)} ha',
                            style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: color),
                          ),
                          Text(
                            '${z.areaPct.toStringAsFixed(1)}%',
                            style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _hex(String hex) {
    try {
      return Color(
          int.parse('FF${hex.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.blue;
    }
  }
}
