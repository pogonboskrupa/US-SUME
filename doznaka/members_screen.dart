// lib/screens/members/members_screen.dart
// Upravljanje članovima projekta — samo projektant

import 'package:flutter/material.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/constants.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../services/supabase_service.dart';

class MembersScreen extends ConsumerStatefulWidget {
  final Project project;
  const MembersScreen({super.key, required this.project});

  @override
  ConsumerState<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends ConsumerState<MembersScreen> {
  List<ProjectMember> _members = [];
  bool _loading = true;
  bool _isManager = false;
  final _searchCtrl = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final members = await SupabaseService.getMembers(widget.project.id);
      final myId = SupabaseService.currentUserId;
      setState(() {
        _members = members;
        _isManager = members.any(
          (m) => m.userId == myId && m.isManager,
        );
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  // ─── Dodaj člana ─────────────────────────────────────────
  Future<void> _addMember(UserProfile user) async {
    if (_members.any((m) => m.userId == user.id)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${user.fullName} je već član projekta')),
      );
      return;
    }
    final colorHex = AppConstants.engineerColors[
        _members.length % AppConstants.engineerColors.length];
    final nextOrder = _members.map((m) => m.orderIndex).fold(0, (a, b) => a > b ? a : b) + 1;

    try {
      await SupabaseService.addMember(
        projectId: widget.project.id,
        userId: user.id,
        role: 'engineer',
        color: colorHex,
        orderIndex: nextOrder,
      );
      await _load();
      if (mounted) {
        setState(() { _searchQuery = ''; _searchCtrl.clear(); });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${user.fullName} dodan na projekat'),
            backgroundColor: Colors.green.shade600,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Greška: $e')),
        );
      }
    }
  }

  // ─── Dodaj kao projektanta ────────────────────────────────
  Future<void> _promoteToManager(ProjectMember member) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Dodaj projektanta'),
        content: Text(
          'Želite li dodijeliti ulogu projektanta za '
          '${member.displayName}?\n\nProjektant može upravljati '
          'članovima i uređivati granice odjela.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Odustani')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Potvrdi')),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await SupabaseService.updateMemberRole(member.id, 'manager');
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Greška: $e')),
        );
      }
    }
  }

  // ─── Ukloni člana ────────────────────────────────────────
  Future<void> _removeMember(ProjectMember member) async {
    // Ne može ukloniti samog sebe ako je jedini manager
    final managers = _members.where((m) => m.isManager).length;
    if (member.isManager && managers <= 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Ne možete ukloniti jednog projektanta. Dodajte drugog prvo.'),
        ),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Ukloni člana'),
        content: Text(
            'Ukloniti ${member.displayName} s projekta?\n\n'
            'GPS trag ostaje sačuvan.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Odustani')),
          ElevatedButton(
              style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red.shade600),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Ukloni')),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      await SupabaseService.removeMember(widget.project.id, member.userId);
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Greška: $e')),
        );
      }
    }
  }

  // ─── Promijeni boju traga ────────────────────────────────
  void _changeColor(ProjectMember member) {
    Color current = member.color;
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Boja traga — ${member.displayName}'),
        content: ColorPicker(
          pickerColor: current,
          onColorChanged: (c) => current = c,
          pickerAreaHeightPercent: 0.7,
          enableAlpha: false,
          displayThumbColor: true,
          labelTypes: const [],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Odustani')),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              final hex =
                  '#${current.value.toRadixString(16).substring(2).toUpperCase()}';
              await SupabaseService.updateMemberColor(member.id, hex);
              await _load();
            },
            child: const Text('Sačuvaj'),
          ),
        ],
      ),
    );
  }

  // ─── Promijeni redosljed ──────────────────────────────────
  Future<void> _reorder(int oldIdx, int newIdx) async {
    if (newIdx > oldIdx) newIdx--;
    final item = _members.removeAt(oldIdx);
    _members.insert(newIdx, item);

    // Ažuriraj order_index za sve
    for (int i = 0; i < _members.length; i++) {
      await SupabaseService.updateMemberOrder(_members[i].id, i);
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inženjeri na projektu'),
        actions: [
          if (_isManager)
            IconButton(
              icon: const Icon(Icons.person_add_outlined),
              tooltip: 'Dodaj inženjera',
              onPressed: () => _showAddMemberSheet(),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // ─── Info banner ────────────────────────────
                if (_isManager)
                  Container(
                    margin: const EdgeInsets.all(12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: Colors.blue.shade200),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.info_outline,
                            color: Colors.blue.shade600, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Povuci i otpusti da promijeniš redosljed. '
                            'Redosljed određuje raspodjelu zona na mapi.',
                            style: TextStyle(
                                fontSize: 12,
                                color: Colors.blue.shade700),
                          ),
                        ),
                      ],
                    ),
                  ),

                // ─── Lista članova ───────────────────────────
                Expanded(
                  child: _members.isEmpty
                      ? const Center(
                          child: Text('Nema članova na projektu'))
                      : ReorderableListView.builder(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          onReorder: _isManager ? _reorder : (_, __) {},
                          buildDefaultDragHandles: _isManager,
                          itemCount: _members.length,
                          itemBuilder: (_, i) {
                            final m = _members[i];
                            return _MemberTile(
                              key: ValueKey(m.id),
                              member: m,
                              orderIndex: i,
                              isManager: _isManager,
                              isCurrentUser:
                                  m.userId == SupabaseService.currentUserId,
                              onColorTap: () => _changeColor(m),
                              onPromote: m.isManager
                                  ? null
                                  : () => _promoteToManager(m),
                              onRemove: (m.isManager &&
                                          _members
                                                  .where((x) => x.isManager)
                                                  .length <=
                                              1) ||
                                      !_isManager
                                  ? null
                                  : () => _removeMember(m),
                            );
                          },
                        ),
                ),
              ],
            ),
      floatingActionButton: _isManager
          ? FloatingActionButton.extended(
              onPressed: _showAddMemberSheet,
              icon: const Icon(Icons.person_add),
              label: const Text('Dodaj inženjera'),
            )
          : null,
    );
  }

  // ─── Sheet za dodavanje člana ─────────────────────────────
  void _showAddMemberSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => _AddMemberSheet(
        projectId: widget.project.id,
        onAdd: _addMember,
      ),
    );
  }
}

// ─── Tile za člana ────────────────────────────────────────
class _MemberTile extends StatelessWidget {
  final ProjectMember member;
  final int orderIndex;
  final bool isManager;
  final bool isCurrentUser;
  final VoidCallback? onColorTap;
  final VoidCallback? onPromote;
  final VoidCallback? onRemove;

  const _MemberTile({
    super.key,
    required this.member,
    required this.orderIndex,
    required this.isManager,
    required this.isCurrentUser,
    this.onColorTap,
    this.onPromote,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final color = member.color;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        leading: GestureDetector(
          onTap: isManager ? onColorTap : null,
          child: Stack(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: color,
                ),
                child: Center(
                  child: Text(
                    member.initials,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 16),
                  ),
                ),
              ),
              if (isManager)
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    width: 16,
                    height: 16,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white,
                      border: Border.all(color: color, width: 1.5),
                    ),
                    child: const Icon(Icons.colorize,
                        size: 9, color: Colors.grey),
                  ),
                ),
            ],
          ),
        ),
        title: Row(
          children: [
            Flexible(
              child: Text(
                member.displayName,
                style: const TextStyle(fontWeight: FontWeight.w600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 6),
            if (isCurrentUser)
              _Chip(label: 'Vi', color: Colors.grey),
            if (member.isManager)
              _Chip(label: 'Projektant', color: Colors.green.shade600),
          ],
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(member.displayEmail,
                style: TextStyle(
                    color: Colors.grey.shade500, fontSize: 12)),
            Text('Redosljed: ${orderIndex + 1}',
                style: TextStyle(
                    color: Colors.grey.shade400, fontSize: 11)),
          ],
        ),
        trailing: isManager
            ? PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert),
                onSelected: (v) {
                  if (v == 'promote' && onPromote != null) onPromote!();
                  if (v == 'remove' && onRemove != null) onRemove!();
                  if (v == 'color' && onColorTap != null) onColorTap!();
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'color',
                    child: Row(children: [
                      Icon(Icons.palette_outlined, size: 18),
                      SizedBox(width: 8),
                      Text('Promijeni boju'),
                    ]),
                  ),
                  if (!member.isManager)
                    const PopupMenuItem(
                      value: 'promote',
                      child: Row(children: [
                        Icon(Icons.admin_panel_settings_outlined,
                            size: 18),
                        SizedBox(width: 8),
                        Text('Dodaj kao projektanta'),
                      ]),
                    ),
                  if (onRemove != null)
                    PopupMenuItem(
                      value: 'remove',
                      child: Row(children: [
                        Icon(Icons.person_remove_outlined,
                            size: 18, color: Colors.red.shade400),
                        const SizedBox(width: 8),
                        Text('Ukloni',
                            style:
                                TextStyle(color: Colors.red.shade400)),
                      ]),
                    ),
                ],
              )
            : null,
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  const _Chip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10,
              color: color,
              fontWeight: FontWeight.w600)),
    );
  }
}

// ─── Sheet za dodavanje novog člana ──────────────────────
class _AddMemberSheet extends ConsumerStatefulWidget {
  final String projectId;
  final Function(UserProfile) onAdd;

  const _AddMemberSheet(
      {required this.projectId, required this.onAdd});

  @override
  ConsumerState<_AddMemberSheet> createState() =>
      _AddMemberSheetState();
}

class _AddMemberSheetState extends ConsumerState<_AddMemberSheet> {
  final _ctrl = TextEditingController();
  String _query = '';
  bool _searching = false;
  List<UserProfile> _results = [];

  Future<void> _search(String q) async {
    setState(() { _query = q; _searching = true; });
    if (q.length < 2) {
      setState(() { _results = []; _searching = false; });
      return;
    }
    try {
      final r = await SupabaseService.searchUsers(q);
      if (mounted) setState(() { _results = r; _searching = false; });
    } catch (_) {
      if (mounted) setState(() { _results = []; _searching = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 16,
        right: 16,
        top: 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const Text('Dodaj inženjera na projekat',
              style: TextStyle(
                  fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(
            'Pretraži po imenu ili email adresi. '
            'Korisnik mora biti registrovan u aplikaciji.',
            style:
                TextStyle(color: Colors.grey.shade500, fontSize: 13),
          ),
          const SizedBox(height: 16),

          TextField(
            controller: _ctrl,
            autofocus: true,
            onChanged: _search,
            decoration: InputDecoration(
              hintText: 'Ime, prezime ili email...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _ctrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _ctrl.clear();
                        _search('');
                      },
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 8),

          if (_searching)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else if (_query.length >= 2 && _results.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Center(
                child: Text(
                  'Nema rezultata za "$_query".\n'
                  'Korisnik se mora registrovati u aplikaciji.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey.shade500),
                ),
              ),
            )
          else
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: _results.length,
              itemBuilder: (_, i) {
                final user = _results[i];
                return ListTile(
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 4),
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFD8F3DC),
                    child: Text(
                      user.initials,
                      style: const TextStyle(
                          color: Color(0xFF2D6A4F),
                          fontWeight: FontWeight.bold),
                    ),
                  ),
                  title: Text(user.fullName),
                  subtitle: Text(user.email,
                      style: const TextStyle(fontSize: 12)),
                  trailing: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: () {
                      Navigator.pop(context);
                      widget.onAdd(user);
                    },
                    child: const Text('Dodaj'),
                  ),
                );
              },
            ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
