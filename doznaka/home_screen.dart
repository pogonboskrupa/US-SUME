// lib/screens/home/home_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/supabase_service.dart';
import '../project/create_project_screen.dart';
import '../map/map_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectsAsync = ref.watch(projectsProvider);
    final profileAsync = ref.watch(currentProfileProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Šumarstvo Tracker'),
        actions: [
          profileAsync.whenData((p) => Padding(
            padding: const EdgeInsets.only(right: 8),
            child: Center(
              child: Text(
                p?.fullName.split(' ').first ?? '',
                style: const TextStyle(fontSize: 14),
              ),
            ),
          )).value ?? const SizedBox(),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Odjavi se',
            onPressed: () async {
              await SupabaseService.signOut();
            },
          ),
        ],
      ),
      body: projectsAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Greška: $e')),
        data: (projects) {
          if (projects.isEmpty) {
            return _EmptyState(
              onCreateTap: () => _openCreateProject(context, ref),
            );
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(projectsProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: projects.length,
              itemBuilder: (_, i) => _ProjectCard(
                project: projects[i],
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => MapScreen(projectId: projects[i].id),
                  ),
                ),
              ),
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openCreateProject(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Novi odjel'),
      ),
    );
  }

  void _openCreateProject(BuildContext context, WidgetRef ref) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CreateProjectScreen()),
    ).then((_) => ref.invalidate(projectsProvider));
  }
}

class _ProjectCard extends StatelessWidget {
  final Project project;
  final VoidCallback onTap;

  const _ProjectCard({required this.project, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFD8F3DC),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.forest,
                        color: Color(0xFF2D6A4F), size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(project.name,
                            style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600)),
                        if (project.description != null)
                          Text(project.description!,
                              style: TextStyle(
                                  color: Colors.grey.shade600,
                                  fontSize: 13)),
                      ],
                    ),
                  ),
                  _StatusChip(status: project.status),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  if (project.knownAreaHa != null) ...[
                    const Icon(Icons.square_foot,
                        size: 14, color: Colors.grey),
                    const SizedBox(width: 4),
                    Text('${project.knownAreaHa!.toStringAsFixed(1)} ha',
                        style: TextStyle(
                            color: Colors.grey.shade600, fontSize: 12)),
                    const SizedBox(width: 16),
                  ],
                  if (!project.hasBoundary) ...[
                    const Icon(Icons.warning_amber_rounded,
                        size: 14, color: Colors.orange),
                    const SizedBox(width: 4),
                    const Text('Bez granice',
                        style: TextStyle(
                            color: Colors.orange, fontSize: 12)),
                    const SizedBox(width: 16),
                  ],
                  const Spacer(),
                  Text(
                    DateFormat('dd.MM.yyyy').format(project.createdAt),
                    style: TextStyle(
                        color: Colors.grey.shade400, fontSize: 11),
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

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color) = switch (status) {
      'active' => ('Aktivno', Colors.green),
      'completed' => ('Završeno', Colors.blue),
      'paused' => ('Pauza', Colors.orange),
      _ => ('', Colors.grey),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(label,
          style: TextStyle(
              color: color.shade700 as Color? ?? color,
              fontSize: 11,
              fontWeight: FontWeight.w500)),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onCreateTap;
  const _EmptyState({required this.onCreateTap});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.forest, size: 72, color: Colors.green.shade200),
          const SizedBox(height: 16),
          const Text('Nema projekata',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Kreiraj prvi odjel za doznaku',
              style: TextStyle(color: Colors.grey.shade500)),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onCreateTap,
            icon: const Icon(Icons.add),
            label: const Text('Novi odjel'),
          ),
        ],
      ),
    );
  }
}
