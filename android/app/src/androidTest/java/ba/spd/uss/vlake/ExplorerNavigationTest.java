package ba.spd.uss.vlake;

import android.Manifest;
import android.content.Context;
import android.view.View;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Stvarni APK/MainActivity/WebView/HTML/Leaflet; kontrolisani GPS, emulator bez mreže. */
@RunWith(AndroidJUnit4.class)
public class ExplorerNavigationTest {
 private String eval(WebView view,String script) throws Exception {
  AtomicReference<String> result=new AtomicReference<>();CountDownLatch latch=new CountDownLatch(1);
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->view.evaluateJavascript(script,v->{result.set(v);latch.countDown();}));
  assertTrue("WebView JS callback",latch.await(5,TimeUnit.SECONDS));return result.get();
 }
 private void until(WebView view,String condition) throws Exception {
  long limit=System.currentTimeMillis()+20000;String last="";
  do {last=eval(view,condition);if("true".equals(last))return;Thread.sleep(100);}while(System.currentTimeMillis()<limit);
  fail("WebView uslov nije ispunjen: "+condition+"; rezultat="+last);
 }
 @Test public void explorerRendersInActualOfflineApk() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Test mora ostati bez interneta",ReferenceOcrBridge.hasInternet(context));
  InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.ACCESS_COARSE_LOCATION);
  InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.ACCESS_FINE_LOCATION);
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)) {
   AtomicReference<WebView> ref=new AtomicReference<>();
   scenario.onActivity(a->{try{Field f=MainActivity.class.getDeclaredField("webView");f.setAccessible(true);ref.set((WebView)f.get(a));}catch(Exception e){throw new AssertionError(e);}});
   WebView view=ref.get();assertNotNull(view);assertEquals(View.LAYER_TYPE_HARDWARE,view.getLayerType());
   until(view,"document.readyState==='complete'&&!!window.Explorer&&typeof onP==='function'");
   // Samo testni auth ulaz i GPS senzor su kontrolisani; sav proizvodni JS se izvršava.
   eval(view,"window.exSnapshot=JSON.stringify([vlake,_tacke,_tragRegistry]);window.exPreference=localStorage.getItem('tvlake_explorer_view_v1');_revealApp();switchTab('karta');gpsOn=true;lastP=null;_onPLastFixTs=0;Explorer.start({la:44.904,lo:16.001,name:'CI cilj'});Explorer.setExplorerEnabled(true)");
   until(view,"!!document.querySelector('.ex-world')");
   assertEquals("true",eval(view,"getComputedStyle(document.querySelector('.ex-world')).transform.includes('matrix3d')&&document.getElementById('dlg-sheet').getBoundingClientRect().top>=innerHeight-1"));
   assertEquals("true",eval(view,"document.getElementById('tnp-air').textContent==='—'&&document.getElementById('explorer-you').hidden&&document.getElementById('ex-mode').textContent.includes('ČEKAM GPS')"));
   // Stvarni onP i getPosition adapter moraju dostaviti poziciju Exploreru.
   eval(view,"_compassHeading=35;_compassLastUpdT=Date.now();onP({timestamp:Date.now(),coords:{latitude:44.9,longitude:16,altitude:510,accuracy:6,speed:0,heading:null}});window.exProbe=L.marker([44.9,16],{icon:L.divIcon({className:'ex-native-probe',iconSize:[2,2],iconAnchor:[1,1]}),interactive:false}).addTo(map)");
   until(view,"!document.getElementById('explorer-you').hidden&&document.getElementById('tnp-air').textContent!=='—'");
   JSONObject point=new JSONObject(eval(view,"(()=>{const p=Explorer.screenPoint([44.9,16]),r=map.getContainer().getBoundingClientRect(),b=document.querySelector('.ex-native-probe').getBoundingClientRect();return {dx:Math.abs(b.left+b.width/2-r.left-p.x),dy:Math.abs(b.top+b.height/2-r.top-p.y)}})()"));
   assertTrue(point.toString(),point.getDouble("dx")<3&&point.getDouble("dy")<3);
   eval(view,"document.getElementById('dlg-sheet').classList.add('show');document.getElementById('dlg-overlay').classList.add('show')");
   until(view,"!document.querySelector('.ex-world')");
   eval(view,"document.getElementById('dlg-sheet').classList.remove('show');document.getElementById('dlg-overlay').classList.remove('show')");
   until(view,"!!document.querySelector('.ex-world')");
   eval(view,"Explorer.setExplorerEnabled(false)");
   assertEquals("true",eval(view,"!document.querySelector('.ex-world')&&map.dragging.enabled()&&Explorer.active"));
   eval(view,"Explorer.stop();gpsOn=false;map.removeLayer(exProbe);if(exPreference===null)localStorage.removeItem('tvlake_explorer_view_v1');else localStorage.setItem('tvlake_explorer_view_v1',exPreference)");
   assertEquals("true",eval(view,"!Explorer.active&&JSON.stringify([vlake,_tacke,_tragRegistry])===exSnapshot"));
  }
 }
}
