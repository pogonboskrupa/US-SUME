// lib/main.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'core/constants.dart';
import 'core/theme.dart';
import 'providers/providers.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'services/gps_service.dart';
import 'services/battery_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: AppConstants.supabaseUrl,
    anonKey: AppConstants.supabaseAnonKey,
  );

  await GpsService().initialize();

  runApp(const ProviderScope(child: ForestryTrackerApp()));
}

class ForestryTrackerApp extends ConsumerWidget {
  const ForestryTrackerApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authAsync = ref.watch(authStateProvider);

    return MaterialApp(
      title: 'Šumarstvo Tracker',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: authAsync.when(
        loading: () => const _SplashScreen(),
        error: (_, __) => const LoginScreen(),
        data: (state) {
          if (state.session != null) {
            return const _AuthenticatedRoot();
          }
          return const LoginScreen();
        },
      ),
    );
  }
}

// Wrapper koji provjerava battery optimizaciju pri prvom loadu
class _AuthenticatedRoot extends StatefulWidget {
  const _AuthenticatedRoot();

  @override
  State<_AuthenticatedRoot> createState() => _AuthenticatedRootState();
}

class _AuthenticatedRootState extends State<_AuthenticatedRoot> {
  @override
  void initState() {
    super.initState();
    // Provjeri battery optimizaciju nakon prvog rendera
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (mounted) {
        await BatteryService.showOptimizationDialog(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) => const HomeScreen();
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xFF2D6A4F),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.forest, size: 80, color: Colors.white),
            SizedBox(height: 20),
            Text(
              'Šumarstvo Tracker',
              style: TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.5,
              ),
            ),
            SizedBox(height: 8),
            Text(
              'Praćenje doznake stabala',
              style: TextStyle(
                  color: Colors.white70, fontSize: 14),
            ),
            SizedBox(height: 40),
            CircularProgressIndicator(
                color: Colors.white60, strokeWidth: 2),
          ],
        ),
      ),
    );
  }
}
