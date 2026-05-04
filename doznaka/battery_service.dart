// lib/services/battery_service.dart
// Flutter strana za komunikaciju sa Android native kanalima

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class BatteryService {
  static const _channel = MethodChannel('com.forestrytracker/battery');

  // Provjeri je li optimizacija već isključena
  static Future<bool> isOptimizationDisabled() async {
    try {
      final result = await _channel.invokeMethod<bool>(
          'isBatteryOptimizationDisabled');
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  // Zatraži isključivanje optimizacije (otvori sistem dialog)
  static Future<void> requestDisableOptimization() async {
    try {
      await _channel.invokeMethod('requestDisableBatteryOptimization');
    } on PlatformException catch (_) {}
  }

  // Prikaži dialog korisniku i ponudi isključivanje
  static Future<void> showOptimizationDialog(BuildContext context) async {
    final isDisabled = await isOptimizationDisabled();
    if (isDisabled || !context.mounted) return;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.battery_alert, color: Colors.orange, size: 40),
        title: const Text('Optimizacija baterije'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Za precizan GPS trag u šumi, potrebno je isključiti '
              'optimizaciju baterije za ovu aplikaciju.',
              style: TextStyle(fontSize: 14),
            ),
            SizedBox(height: 12),
            Text(
              'Bez ovoga, Android može pauzirati snimanje '
              'u pozadini i izgubiti dio traga.',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Preskoči'),
          ),
          ElevatedButton.icon(
            onPressed: () async {
              Navigator.pop(ctx);
              await requestDisableOptimization();
            },
            icon: const Icon(Icons.battery_charging_full),
            label: const Text('Isključi optimizaciju'),
          ),
        ],
      ),
    );
  }
}
