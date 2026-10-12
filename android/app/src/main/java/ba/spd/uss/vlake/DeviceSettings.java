package ba.spd.uss.vlake;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Postavke potvrđuje korisnik; nijedna dozvola se ne uključuje automatski. */
final class DeviceSettings {
    static Intent appDetails(Context context) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + context.getPackageName()));
    }
    static List<Intent> batteryIntents(Context context) {
        List<Intent> list = new ArrayList<>();
        list.add(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + context.getPackageName())));
        list.add(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        list.add(appDetails(context));
        return list;
    }
    static List<Intent> autostartIntents(Context context, String manufacturer) {
        List<Intent> list = new ArrayList<>();
        String maker = manufacturer == null ? "" : manufacturer.toLowerCase(Locale.ROOT);
        if (maker.contains("xiaomi") || maker.contains("redmi") || maker.contains("poco")) {
            list.add(new Intent().setComponent(new ComponentName("com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity")));
        }
        // Android nema univerzalni ekran autostarta; rezervni put je uvijek za ovu app.
        list.add(appDetails(context));
        return list;
    }
    static boolean openFirst(Context context, List<Intent> intents) {
        for (Intent intent : intents) {
            try { context.startActivity(intent); return true; }
            catch (RuntimeException ignored) { /* OEM ekran može biti uklonjen ili zaštićen. */ }
        }
        return false;
    }
}
