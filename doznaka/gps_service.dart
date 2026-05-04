// lib/services/gps_service.dart
// Background GPS servis — snima trag inženjera

import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/constants.dart';

// ============================================================
// Background service entry point (top-level funkcija!)
// ============================================================
@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  DartPluginRegistrant.ensureInitialized();

  // Notifikacija dok traje snimanje
  final notifications = FlutterLocalNotificationsPlugin();
  await notifications.initialize(
    const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    ),
  );

  // Supabase u background isolate-u
  await Supabase.initialize(
    url: AppConstants.supabaseUrl,
    anonKey: AppConstants.supabaseAnonKey,
  );

  // Primaj podatke iz glavnog isolate-a
  String? projectId;
  String? userId;

  service.on('start_tracking').listen((data) {
    projectId = data?['project_id'];
    userId = data?['user_id'];
  });

  service.on('stop_tracking').listen((_) {
    service.stopSelf();
  });

  // GPS stream
  final positionStream = Geolocator.getPositionStream(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      distanceFilter: 2, // min 2m pomak
    ),
  );

  LatLngSimple? lastPoint;
  int pointCount = 0;

  positionStream.listen((position) async {
    if (projectId == null || userId == null) return;

    // Preskoči netočne tačke
    if ((position.accuracy) > AppConstants.gpsAccuracyThresholdM) return;

    final current = LatLngSimple(position.latitude, position.longitude);

    // Minimalna distanca između tačaka
    if (lastPoint != null) {
      final dist = Geolocator.distanceBetween(
        lastPoint!.lat, lastPoint!.lng,
        current.lat, current.lng,
      );
      if (dist < AppConstants.gpsMinDistanceM) return;
    }

    lastPoint = current;
    pointCount++;

    // Sačuvaj u Supabase
    try {
      await Supabase.instance.client
          .from(AppConstants.tTrackPoints)
          .insert({
        'project_id': projectId,
        'user_id': userId,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'altitude': position.altitude,
        'accuracy': position.accuracy,
        'speed': position.speed,
        'recorded_at': DateTime.now().toIso8601String(),
      });
    } catch (_) {
      // Offline — u produkciji dodati lokalnu bazu za offline sync
    }

    // Ažuriraj notifikaciju
    notifications.show(
      1001,
      'Šumarstvo Tracker — Snimanje aktivno',
      'Tačaka snimljeno: $pointCount | Tačnost: ${position.accuracy.toStringAsFixed(0)}m',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'tracking_channel',
          'GPS Snimanje',
          channelDescription: 'Obavještava dok je GPS snimanje aktivno',
          importance: Importance.low,
          priority: Priority.low,
          ongoing: true,
          showWhen: false,
          icon: '@mipmap/ic_launcher',
        ),
      ),
    );

    // Pošalji poziciju glavnom isolate-u za live prikaz
    service.invoke('position_update', {
      'lat': position.latitude,
      'lng': position.longitude,
      'accuracy': position.accuracy,
      'count': pointCount,
    });
  });
}

// ============================================================
// GpsService — kontrola iz glavne aplikacije
// ============================================================
class GpsService {
  static final _instance = GpsService._();
  factory GpsService() => _instance;
  GpsService._();

  final _service = FlutterBackgroundService();
  bool _isTracking = false;
  bool get isTracking => _isTracking;

  // Inicijalizacija (pokrenuti u main())
  Future<void> initialize() async {
    const androidConfig = AndroidConfiguration(
      onStart: onStart,
      autoStart: false,
      isForegroundMode: true,
      notificationChannelId: 'tracking_channel',
      initialNotificationTitle: 'Šumarstvo Tracker',
      initialNotificationContent: 'GPS servis spreman',
      foregroundServiceNotificationId: 1001,
    );

    const iosConfig = IOSConfiguration(autoStart: false);

    await _service.configure(
      androidConfiguration: androidConfig,
      iosConfiguration: iosConfig,
    );
  }

  // Provjera i zahtjev dozvola
  Future<bool> requestPermissions() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) return false;

    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  // Pokreni snimanje
  Future<bool> startTracking({
    required String projectId,
    required String userId,
  }) async {
    final hasPermission = await requestPermissions();
    if (!hasPermission) return false;

    await _service.startService();
    _service.invoke('start_tracking', {
      'project_id': projectId,
      'user_id': userId,
    });

    _isTracking = true;
    return true;
  }

  // Zaustavi snimanje
  Future<void> stopTracking() async {
    _service.invoke('stop_tracking');
    _isTracking = false;
  }

  // Stream pozicija za live prikaz na mapi
  Stream<Map<String, dynamic>?> get positionStream =>
      _service.on('position_update');

  // Trenutna pozicija (jednokratno)
  Future<Position?> getCurrentPosition() async {
    try {
      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.bestForNavigation,
        timeLimit: const Duration(seconds: 10),
      );
    } catch (_) {
      return null;
    }
  }
}

class LatLngSimple {
  final double lat, lng;
  const LatLngSimple(this.lat, this.lng);
}
