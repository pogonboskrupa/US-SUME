package ba.spd.uss.vlake;
import android.content.Context;
import android.graphics.Bitmap;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ReferenceOcrOfflineTest {
 @Test public void refusesRecognitionWithoutValidatedInternet() {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Test requires no internet",ReferenceOcrBridge.hasInternet(context));
  Bitmap bitmap=Bitmap.createBitmap(32,32,Bitmap.Config.ARGB_8888);
  AtomicReference<String> error=new AtomicReference<>();
  ReferenceOcrBridge.recognizeImage(context,bitmap,(words,failure)->{assertEquals(0,words.length());error.set(failure);});
  bitmap.recycle();assertNotNull(error.get());assertTrue(error.get().contains("internet"));
 }
}
