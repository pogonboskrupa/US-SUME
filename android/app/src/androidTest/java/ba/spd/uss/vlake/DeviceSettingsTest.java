package ba.spd.uss.vlake;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.provider.Settings;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DeviceSettingsTest {
    private final Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
    @Test public void batteryRequestAndFallbackTargetActualInstalledPackage() {
        assertEquals(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, DeviceSettings.batteryIntents(app).get(0).getAction());
        assertEquals("package:" + app.getPackageName(), DeviceSettings.batteryIntents(app).get(0).getDataString());
        assertEquals("package:" + app.getPackageName(), DeviceSettings.appDetails(app).getDataString());
    }
    @Test public void xiaomiAutostartHasPortableFallbackWithoutAssumingPermission() {
        assertEquals("com.miui.securitycenter", DeviceSettings.autostartIntents(app,"Xiaomi").get(0).getComponent().getPackageName());
        assertEquals(2,DeviceSettings.autostartIntents(app,"POCO").size());
        assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, DeviceSettings.autostartIntents(app,"Google").get(0).getAction());
    }
    @Test public void missingOrBlockedOemActivityFallsBackWithoutOpeningRealSettings() {
        final int[] opened={0};
        Context fixture=new ContextWrapper(app) {
            @Override public void startActivity(Intent intent) {
                opened[0]++;
                if(intent.getComponent()!=null)throw new SecurityException("blocked fixture OEM");
                assertEquals(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,intent.getAction());
            }
        };
        assertTrue(DeviceSettings.openFirst(fixture,DeviceSettings.autostartIntents(app,"Xiaomi")));
        assertEquals(2,opened[0]);
        Context absent=new ContextWrapper(app) {
            @Override public void startActivity(Intent intent){throw new ActivityNotFoundException("fixture");}
        };
        assertFalse(DeviceSettings.openFirst(absent,DeviceSettings.batteryIntents(app)));
    }
}
