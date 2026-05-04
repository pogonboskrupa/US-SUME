// android/app/src/main/kotlin/com/forestrytracker/MainActivity.kt
// Native Android kanal za isključivanje battery optimizacije

package com.forestrytracker

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    private val CHANNEL = "com.forestrytracker/battery"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {

                    // Provjeri je li battery optimizacija isključena
                    "isBatteryOptimizationDisabled" -> {
                        val pm = getSystemService(POWER_SERVICE) as PowerManager
                        val isIgnoring = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            pm.isIgnoringBatteryOptimizations(packageName)
                        } else {
                            true // Pre-M uvijek OK
                        }
                        result.success(isIgnoring)
                    }

                    // Otvori settings da korisnik isključi optimizaciju
                    "requestDisableBatteryOptimization" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val pm = getSystemService(POWER_SERVICE) as PowerManager
                            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                                val intent = Intent(
                                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                    Uri.parse("package:$packageName")
                                )
                                startActivity(intent)
                                result.success(true)
                            } else {
                                result.success(false) // Vec isključeno
                            }
                        } else {
                            result.success(false)
                        }
                    }

                    // Otvori opće battery settings
                    "openBatterySettings" -> {
                        val intent = Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS)
                        startActivity(intent)
                        result.success(true)
                    }

                    else -> result.notImplemented()
                }
            }
    }
}
