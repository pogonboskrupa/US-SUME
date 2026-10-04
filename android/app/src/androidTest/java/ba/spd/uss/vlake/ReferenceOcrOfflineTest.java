package ba.spd.uss.vlake;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ReferenceOcrOfflineTest {
 @Test public void readsBlackBlueLabelsWithBundledModelOffline() throws Exception {
  ConnectivityManager network=(ConnectivityManager)InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(Context.CONNECTIVITY_SERVICE);assertNull("Test requires no active network",network.getActiveNetwork());
  Bitmap bitmap=Bitmap.createBitmap(800,600,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(bitmap);c.drawColor(Color.WHITE);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);p.setTextSize(40);p.setColor(Color.BLACK);c.drawText("T12",120,140,p);p.setColor(Color.rgb(20,50,190));c.drawText("T3",430,360,p);p.setColor(Color.BLACK);c.drawText("ODJEL 105",90,480,p);
  CountDownLatch done=new CountDownLatch(1);AtomicReference<JSONArray> words=new AtomicReference<>();AtomicReference<String> error=new AtomicReference<>();
  ReferenceOcrBridge.recognizeImage(bitmap,(result,failure)->{words.set(result);error.set(failure);done.countDown();});
  assertTrue("OCR did not finish",done.await(90,TimeUnit.SECONDS));assertNull(error.get());assertNotNull(words.get());boolean black=false,blue=false;
  for(int i=0;i<words.get().length();i++){JSONObject w=words.get().getJSONObject(i);String text=w.getString("text").replace(" ","");double x=w.getDouble("x0"),y=w.getDouble("y0");if(text.equalsIgnoreCase("T12")&&x>=110&&x<140&&y>90&&y<145)black=true;if(text.equalsIgnoreCase("T3")&&x>=420&&x<450&&y>310&&y<365)blue=true;}
  bitmap.recycle();assertTrue("Black T12 label/bounds not recognized",black);assertTrue("Blue T3 label/bounds not recognized",blue);
 }
}
