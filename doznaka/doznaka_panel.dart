// lib/screens/doznaka/doznaka_panel.dart
// Draggable bottom sheet — prikaz napretka doznake po projektantima

import 'package:flutter/material.dart';
import '../../models/models.dart';

class DoznakaPanel extends StatelessWidget {
  final DoznakaProjekat projekat;
  final List<DoznakaTrasa> trase;
  final List<DoznakaClan> clanovi;
  final Map<String, String> userNames;
  final Map<String, String> userColors;
  final bool isTracking;
  final bool isCreator;
  final VoidCallback onStartTrasa;
  final VoidCallback onFinishTrasa;
  final VoidCallback onDodajProjektanta;
  final VoidCallback onClose;

  const DoznakaPanel({
    super.key,
    required this.projekat,
    required this.trase,
    required this.clanovi,
    required this.userNames,
    required this.userColors,
    required this.isTracking,
    required this.isCreator,
    required this.onStartTrasa,
    required this.onFinishTrasa,
    required this.onDodajProjektanta,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    final stats = _buildStats();
    final totalHa = projekat.totalAreaHa ?? 0;
    final pokrivenoHa = stats.fold(0.0, (s, e) => s + e.areaHa);
    final nepokrivenoHa = (totalHa - pokrivenoHa).clamp(0.0, double.infinity);
    final nepokrivenoPct = totalHa > 0 ? (nepokrivenoHa / totalHa) * 100 : 0.0;

    return DraggableScrollableSheet(
      initialChildSize: 0.45,
      maxChildSize: 0.85,
      minChildSize: 0.25,
      expand: false,
      builder: (ctx, controller) => Column(
        children: [
          // ─── Header ─────────────────────────────────────
          _Header(
            projekat: projekat,
            trase: trase,
            isTracking: isTracking,
            onStartTrasa: onStartTrasa,
            onFinishTrasa: onFinishTrasa,
            onClose: onClose,
          ),

          // ─── Sadržaj ─────────────────────────────────────
          Expanded(
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.all(12),
              children: [
                // Ukupni progresbar
                if (totalHa > 0) ...[
                  _ProgressBar(pokrivenoHa: pokrivenoHa, totalHa: totalHa),
                  const SizedBox(height: 12),
                ],

                // Tim projektanata
                _TimSection(
                  clanovi: clanovi,
                  isCreator: isCreator,
                  onDodaj: onDodajProjektanta,
                ),
                const SizedBox(height: 12),

                // Red po projektantu
                if (stats.isEmpty)
                  const _EmptyState()
                else
                  ...stats.map((s) => _ProjectantRow(
                        name: s.name,
                        colorHex: s.colorHex,
                        areaHa: s.areaHa,
                        areaPct: s.areaPct,
                        numTrasa: s.numTrasa,
                        totalHa: totalHa,
                      )),

                // Nepokriveno
                if (stats.isNotEmpty && nepokrivenoHa > 0.01) ...[
                  const Divider(height: 20),
                  _ProjectantRow(
                    name: 'Nepokriveno',
                    colorHex: '#CCCCCC',
                    areaHa: nepokrivenoHa,
                    areaPct: nepokrivenoPct,
                    numTrasa: 0,
                    totalHa: totalHa,
                    isUncovered: true,
                  ),
                ],

                const SizedBox(height: 8),
                if (totalHa > 0)
                  Center(
                    child: Text(
                      'Ukupno odjel: ${totalHa.toStringAsFixed(1)} ha',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<_UserStat> _buildStats() {
    final byUser = <String, List<DoznakaTrasa>>{};
    for (final t in trase.where((t) => t.isFinished)) {
      byUser.putIfAbsent(t.userId, () => []).add(t);
    }

    final stats = <_UserStat>[];
    for (final entry in byUser.entries) {
      final userId = entry.key;
      final userTrase = entry.value;
      final totalArea = userTrase.fold(0.0, (s, t) => s + (t.areaHa ?? 0));
      final totalPct = userTrase.fold(0.0, (s, t) => s + (t.areaPct ?? 0));
      stats.add(_UserStat(
        userId: userId,
        name: userNames[userId] ?? 'Projektant',
        colorHex: userColors[userId] ?? '#3B8BD4',
        areaHa: totalArea,
        areaPct: totalPct,
        numTrasa: userTrase.length,
      ));
    }

    // Sortiraj po površini (veća prva)
    stats.sort((a, b) => b.areaHa.compareTo(a.areaHa));
    return stats;
  }
}

// ── Pomoćni modeli ────────────────────────────────────────

class _UserStat {
  final String userId;
  final String name;
  final String colorHex;
  final double areaHa;
  final double areaPct;
  final int numTrasa;

  const _UserStat({
    required this.userId,
    required this.name,
    required this.colorHex,
    required this.areaHa,
    required this.areaPct,
    required this.numTrasa,
  });
}

// ── Widgets ───────────────────────────────────────────────

class _Header extends StatelessWidget {
  final DoznakaProjekat projekat;
  final List<DoznakaTrasa> trase;
  final bool isTracking;
  final VoidCallback onStartTrasa;
  final VoidCallback onFinishTrasa;
  final VoidCallback onClose;

  const _Header({
    required this.projekat,
    required this.trase,
    required this.isTracking,
    required this.onStartTrasa,
    required this.onFinishTrasa,
    required this.onClose,
  });



  @override
  Widget build(BuildContext context) {
    final finished = trase.where((t) => t.isFinished).length;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 10),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, -2))
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.forest, color: Color(0xFF2D6A4F)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  projekat.displayName,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '$finished trasa završeno',
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
                ),
              ],
            ),
          ),

          // Dugme Snimi / Završi trasu
          if (isTracking)
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: Colors.red.shade600,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              icon: const Icon(Icons.stop, size: 16),
              label: const Text('Završi', style: TextStyle(fontSize: 12)),
              onPressed: onFinishTrasa,
            )
          else
            FilledButton.icon(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF2D6A4F),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              icon: const Icon(Icons.play_arrow, size: 16),
              label: const Text('Snimi trasu', style: TextStyle(fontSize: 12)),
              onPressed: onStartTrasa,
            ),

          const SizedBox(width: 4),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: onClose,
          ),
        ],
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  final double pokrivenoHa;
  final double totalHa;

  const _ProgressBar({required this.pokrivenoHa, required this.totalHa});

  @override
  Widget build(BuildContext context) {
    final pct = (pokrivenoHa / totalHa).clamp(0.0, 1.0);
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F9F6),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Pokriveno: ${pokrivenoHa.toStringAsFixed(1)} ha',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              ),
              Text(
                '${(pct * 100).toStringAsFixed(0)}%',
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF2D6A4F),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct,
              minHeight: 8,
              backgroundColor: Colors.grey.shade200,
              valueColor: const AlwaysStoppedAnimation(Color(0xFF2D6A4F)),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProjectantRow extends StatelessWidget {
  final String name;
  final String colorHex;
  final double areaHa;
  final double areaPct;
  final int numTrasa;
  final double totalHa;
  final bool isUncovered;

  const _ProjectantRow({
    required this.name,
    required this.colorHex,
    required this.areaHa,
    required this.areaPct,
    required this.numTrasa,
    required this.totalHa,
    this.isUncovered = false,
  });

  Color get _color {
    try {
      return Color(int.parse('FF${colorHex.replaceAll('#', '')}', radix: 16));
    } catch (_) {
      return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final barWidth = totalHa > 0 ? (areaHa / totalHa).clamp(0.0, 1.0) : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isUncovered
            ? Colors.grey.shade50
            : _color.withOpacity(0.06),
        border: Border.all(
          color: isUncovered
              ? Colors.grey.shade200
              : _color.withOpacity(0.3),
        ),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Boja indikatora
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: isUncovered ? Colors.grey.shade400 : _color,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),

              Expanded(
                child: Text(
                  name,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: isUncovered ? Colors.grey.shade500 : null,
                  ),
                ),
              ),

              // Ha + %
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${areaHa.toStringAsFixed(2)} ha',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: isUncovered ? Colors.grey.shade400 : _color,
                    ),
                  ),
                  Text(
                    '${areaPct.toStringAsFixed(1)}%',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade500,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Mini bar
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: barWidth,
              minHeight: 4,
              backgroundColor: Colors.grey.shade200,
              valueColor: AlwaysStoppedAnimation(
                isUncovered ? Colors.grey.shade300 : _color.withOpacity(0.7),
              ),
            ),
          ),

          // Broj trasa
          if (!isUncovered && numTrasa > 0) ...[
            const SizedBox(height: 4),
            Text(
              '$numTrasa ${numTrasa == 1 ? 'trasa' : 'trasa'}',
              style: TextStyle(fontSize: 10, color: Colors.grey.shade400),
            ),
          ],
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Icon(Icons.directions_walk, size: 48, color: Colors.grey),
          SizedBox(height: 12),
          Text(
            'Nema snimljenih trasa',
            style: TextStyle(color: Colors.grey, fontWeight: FontWeight.w500),
          ),
          SizedBox(height: 4),
          Text(
            'Tapni "Snimi trasu" da počneš',
            style: TextStyle(color: Colors.grey, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

// ── Tim projektanata ──────────────────────────────────────

class _TimSection extends StatelessWidget {
  final List<DoznakaClan> clanovi;
  final bool isCreator;
  final VoidCallback onDodaj;

  const _TimSection({
    required this.clanovi,
    required this.isCreator,
    required this.onDodaj,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F9F6),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          // Avatar row
          Expanded(
            child: clanovi.isEmpty
                ? Text(
                    'Nema dodanih projektanata',
                    style: TextStyle(
                        fontSize: 12, color: Colors.grey.shade500),
                  )
                : Wrap(
                    spacing: 6,
                    children: clanovi.map((c) {
                      return Tooltip(
                        message: c.displayName,
                        child: CircleAvatar(
                          radius: 16,
                          backgroundColor: c.color.withOpacity(0.2),
                          child: Text(
                            c.inicijali,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: c.color,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
          ),

          // Dodaj dugme (samo kreator)
          if (isCreator)
            TextButton.icon(
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF2D6A4F),
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 4),
                visualDensity: VisualDensity.compact,
              ),
              icon: const Icon(Icons.person_add_outlined, size: 16),
              label: const Text('Dodaj', style: TextStyle(fontSize: 12)),
              onPressed: onDodaj,
            ),
        ],
      ),
    );
  }
}
