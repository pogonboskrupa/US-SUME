// lib/screens/widgets/engineer_card.dart

import 'package:flutter/material.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';

class EngineerCard extends StatelessWidget {
  final ProjectMember member;
  final List<ZoneEntry> zones;

  const EngineerCard({
    super.key,
    required this.member,
    required this.zones,
  });

  @override
  Widget build(BuildContext context) {
    final zone =
        zones.where((z) => z.userId == member.userId).firstOrNull;
    final color = member.color;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withOpacity(0.15),
            border: Border.all(color: color, width: 2),
          ),
          child: Center(
            child: Text(member.initials,
                style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.bold,
                    fontSize: 15)),
          ),
        ),
        title: Row(children: [
          Text(member.displayName,
              style: const TextStyle(fontWeight: FontWeight.w500)),
          const SizedBox(width: 8),
          if (member.isManager)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.green.shade300),
              ),
              child: Text('Projektant',
                  style: TextStyle(
                      fontSize: 10, color: Colors.green.shade700)),
            ),
        ]),
        subtitle: zone != null
            ? Text(
                '${zone.areaHa.toStringAsFixed(2)} ha  '
                '(${zone.areaPct.toStringAsFixed(1)}%)',
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 12))
            : Text('Redosljed: ${member.orderIndex + 1}',
                style: TextStyle(
                    color: Colors.grey.shade500, fontSize: 12)),
        trailing: Container(
          width: 18,
          height: 18,
          decoration:
              BoxDecoration(shape: BoxShape.circle, color: color),
        ),
      ),
    );
  }
}
