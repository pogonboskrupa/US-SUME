package ba.spd.uss.vlake;

import android.Manifest;
import android.content.Context;
import android.view.View;
import android.webkit.WebView;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.Stage;
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
public class NativeOfflineMapsTest {
 private String eval(WebView view,String script) throws Exception {
  AtomicReference<String> result=new AtomicReference<>();CountDownLatch latch=new CountDownLatch(1);
  new Handler(Looper.getMainLooper()).post(()->view.evaluateJavascript(script,v->{result.set(v);latch.countDown();}));
  assertTrue("WebView JS callback",latch.await(5,TimeUnit.SECONDS));return result.get();
 }
 private void pageLoaded(WebView view) throws Exception {
  // Cold WebView navigacija može odbaciti JS callback za prethodni about:blank.
  // Ne mijenjamo proizvodni WebViewClient/assetLoader; čitamo native progress.
  long limit=System.currentTimeMillis()+30000;Handler ui=new Handler(Looper.getMainLooper());
  String last="";
  do {
   CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> state=new AtomicReference<>();
   ui.post(()->{state.set(view.getProgress()+"|"+view.getUrl());latch.countDown();});
   // Cold emulator može zadržati UI red >5 s tokom prvog parsiranja APK-a.
   // I dalje važi isti ukupni rok od 30 s, isti progress=100 i isti URL.
   assertTrue("WebView progress callback",latch.await(Math.max(1L,limit-System.currentTimeMillis()),TimeUnit.MILLISECONDS));
   String status=state.get();if(!status.equals(last)){Log.i("ExplorerCI","Učitavanje: "+status);last=status;}
   if(status.equals("100|https://appassets.androidplatform.net/assets/index.html"))return;
   Thread.sleep(100);
  }while(System.currentTimeMillis()<limit);
  fail("APK stranica nije učitana: "+last);
 }
 private void until(WebView view,String condition) throws Exception {
  Log.i("ExplorerCI","Provjera: "+condition);
  long limit=System.currentTimeMillis()+20000;String last="";
  do {last=eval(view,condition);if("true".equals(last))return;Thread.sleep(100);}while(System.currentTimeMillis()<limit);
  String info=eval(view,"JSON.stringify({ready:document.readyState,agent:navigator.userAgent,api:typeof window.Explorer})");
  fail("WebView uslov nije ispunjen: "+condition+"; rezultat="+last+"; "+info);
 }

 @Test(timeout=90000) public void nativeDocumentsOpenWithoutBlobAndSurviveReload() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Bez interneta",ReferenceOcrBridge.hasInternet(context));
  AtomicReference<WebView> ref=new AtomicReference<>();AtomicReference<MainActivity> activityRef=new AtomicReference<>();CountDownLatch resumed=new CountDownLatch(1),registered=new CountDownLatch(1);
  ActivityLifecycleCallback callback=(a,stage)->{if(a instanceof MainActivity&&stage==Stage.RESUMED){try{Field f=MainActivity.class.getDeclaredField("webView");f.setAccessible(true);ref.set((WebView)f.get(a));activityRef.set((MainActivity)a);resumed.countDown();}catch(Exception e){throw new AssertionError(e);}}};
  Handler ui=new Handler(Looper.getMainLooper());ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(callback);registered.countDown();});assertTrue(registered.await(5,TimeUnit.SECONDS));
  context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try {
   assertTrue(resumed.await(15,TimeUnit.SECONDS));WebView view=ref.get();pageLoaded(view);until(view,"document.readyState==='complete'&&NativeOfflineMaps.available()&&typeof sqlmapLoadFile==='function'");
   Field field=MainActivity.class.getDeclaredField("offlineMaps");field.setAccessible(true);OfflineMaps maps=(OfflineMaps)field.get(null);
   // SAF selection is controlled, but the content provider, FD, SQLite, bridge, JS and tiles are real.
   JSONObject large=maps.select(android.net.Uri.parse("content://ba.spd.uss.vlake.offline.fixture/rmaps"),true);
   long begin=android.os.SystemClock.elapsedRealtime();
   eval(view,"_revealApp();switchTab('karta');window.beforeMaps=JSON.stringify([vlake,_tacke,_tragRegistry]);window.nativeOpened=false;loadmapHandleFiles(["+large+"]);void 0");
   until(view,"_loadmapPending.length===1&&!document.getElementById('loadmap-confirm').disabled");
   eval(view,"loadmapConfirmLoad().then(()=>nativeOpened=true);void 0");
   until(view,"nativeOpened&&_sqlLayers.some(l=>l.name==='native-large'&&l.saved)");
   long opened=android.os.SystemClock.elapsedRealtime()-begin;
   assertTrue("1.5 GB direct open <10 s: "+opened,opened<10000);
   assertEquals("true",eval(view,"_sqlLayers.find(l=>l.name==='native-large').meta._nativeCopy===false&&_sqlImports.size===0&&JSON.stringify([vlake,_tacke,_tragRegistry])===beforeMaps"));
   eval(view,"window.nativeTile=false;_sqlWCall({type:'tile',name:'native-large',z:13,x:4463,y:2940}).then(r=>nativeTile=!!r.data&&r.data[0]===137);void 0");until(view,"nativeTile");
   JSONObject normal=maps.select(android.net.Uri.parse("content://ba.spd.uss.vlake.offline.fixture/mbtiles"),true);
   eval(view,"nativeOpened=false;sqlmapLoadFile("+normal+").then(()=>nativeOpened=true);void 0");until(view,"nativeOpened&&_sqlLayers.some(l=>l.name==='native-normalized'&&l.saved)");
   assertEquals("true",eval(view,"_sqlLayers.find(l=>l.name==='native-normalized').meta._nativeCopy===false"));
   eval(view,"nativeTile=false;_sqlWCall({type:'tile',name:'native-normalized',z:13,x:5485,y:2940}).then(r=>nativeTile=!!r.data&&r.data[0]===137);void 0");until(view,"nativeTile");
   // Rename through the actual UI operation and verify its newly-created Leaflet layer reads.
   eval(view,"window.promptBefore=_dlgPrompt;_dlgPrompt=async()=> 'native-renamed';_mapMgrShown=[{name:'native-normalized'}];window.nativeRenamed=false;_mapMgrRename(0).then(()=>{_dlgPrompt=promptBefore;nativeRenamed=true});void 0");until(view,"nativeRenamed&&_sqlLayers.some(l=>l.name==='native-renamed')");
   eval(view,"nativeTile=false;_sqlWCall({type:'tile',name:'native-renamed',z:13,x:4462,y:2940}).then(r=>nativeTile=!!r.data&&r.data[0]===137);void 0");until(view,"nativeTile");
   maps.closeAll();CountDownLatch reload=new CountDownLatch(1);ui.post(()->{view.reload();reload.countDown();});assertTrue(reload.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   until(view,"document.readyState==='complete'&&typeof nativeOpened==='undefined'&&NativeOfflineMaps.available()");
   eval(view,"_revealApp();switchTab('karta');sqlmapRestoreAll();void 0");until(view,"_sqlLayers.some(l=>l.name==='native-renamed'&&l.visible)");
   eval(view,"nativeTile=false;_sqlWCall({type:'tile',name:'native-renamed',z:13,x:4462,y:2940}).then(r=>nativeTile=!!r.data&&r.data[0]===137);void 0");until(view,"nativeTile");
   // Failed replacement must preserve the old persisted map, including when currently deferred.
   JSONObject invalid=maps.select(android.net.Uri.parse("content://ba.spd.uss.vlake.offline.fixture/bad"),true);
   eval(view,"window.badRejected=false;sqlmapLoadFile("+invalid+").catch(()=>badRejected=true);void 0");until(view,"badRejected");
   assertEquals("true",eval(view,"_sqlRestoreFailed.some(l=>l.name==='native-large')"));
   eval(view,"window.largeRestored=false;sqlmapRetryOne('native-large').then(()=>largeRestored=true);void 0");until(view,"largeRestored&&_sqlLayers.some(l=>l.name==='native-large')");
   eval(view,"nativeTile=false;_sqlWCall({type:'tile',name:'native-large',z:13,x:4463,y:2940}).then(r=>nativeTile=!!r.data&&r.data[0]===137);void 0");until(view,"nativeTile");
   JSONObject pipe=maps.select(android.net.Uri.parse("content://ba.spd.uss.vlake.offline.fixture/pipe"),true);
   eval(view,"window.pipeOpened=false;sqlmapLoadFile("+pipe+").then(()=>pipeOpened=true);void 0");until(view,"pipeOpened&&_sqlLayers.some(l=>l.name==='native-normalized'&&l.meta._nativeCopy===true)");
   eval(view,"window.nativeRemoved=false;sqlmapRemove(_sqlLayers.findIndex(l=>l.name==='native-large')).then(()=>nativeRemoved=true);void 0");until(view,"nativeRemoved");
   try(android.database.Cursor c=context.getContentResolver().query(android.net.Uri.parse("content://ba.spd.uss.vlake.offline.fixture/rmaps"),null,null,null,null)){assertTrue(c.moveToFirst());assertEquals(1_500_000_000L,c.getLong(1));}
   eval(view,"window.nativeCleared=false;sqlmapClearAll().then(()=>nativeCleared=true);void 0");until(view,"nativeCleared&&_sqlLayers.length===0");
   Log.i("NativeOfflineMapsCI","1.5 GB direct content:// open="+opened+"ms; normalized MBTiles, last tile, rename, offline reload, failed replacement, pipe fallback and source retained — OK");
  }finally{ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback);MainActivity a=activityRef.get();if(a!=null)a.finish();});}
 }
}
