package ba.spd.uss.vlake;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Sistemska obavijest iz JS-a ("Marko dijeli kretanje s tobom"). Android WebView
 * nema window.Notification, pa JS strana bez ovog mosta nema kako da javi ništa
 * dok je aplikacija u pozadini. Radi dok je proces aplikacije živ — zatvorenu
 * aplikaciju ovo ne budi (za to treba push servis).
 */
class AppNotifBridge {
    private static final String CHANNEL_ID = "dijeljenje_kretanja";
    private final Context context;

    AppNotifBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public void show(String title, String body) {
        try {
            NotificationManagerCompat compat = NotificationManagerCompat.from(context);
            if (!compat.areNotificationsEnabled()) return;
            createChannel();

            Intent open = new Intent(context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pending = PendingIntent.getActivity(context, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setContentTitle(title == null ? "" : title)
                    .setContentText(body == null ? "" : body)
                    .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                    .setContentIntent(pending)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE);
            // Isti naslov zamjenjuje prethodnu obavijest umjesto da ih gomila.
            int id = 7000 + Math.abs((title == null ? 0 : title.hashCode()) % 1000);
            compat.notify(id, b.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS nije odobren — obavijest se tiho preskače,
            // JS strana svejedno prikazuje baner u aplikaciji.
        } catch (RuntimeException ignored) {
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = context.getSystemService(NotificationManager.class);
            if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                    "Dijeljenje kretanja", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Kolega je počeo dijeliti kretanje s tobom");
            nm.createNotificationChannel(ch);
        }
    }
}
