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
public class OfflineImportTest {
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
 @Test(timeout=90000) public void importsAndReopensSQLiteInOfflineWebView() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Bez interneta",ReferenceOcrBridge.hasInternet(context));
  String encoded;
  try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("rmaps-mini.sqlitedb")){
   java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);
   encoded=android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP);
  }
  AtomicReference<WebView> ref=new AtomicReference<>();AtomicReference<MainActivity> activityRef=new AtomicReference<>();CountDownLatch resumed=new CountDownLatch(1),registered=new CountDownLatch(1);
  ActivityLifecycleCallback callback=(a,stage)->{if(a instanceof MainActivity&&stage==Stage.RESUMED){try{Field f=MainActivity.class.getDeclaredField("webView");f.setAccessible(true);ref.set((WebView)f.get(a));activityRef.set((MainActivity)a);resumed.countDown();}catch(Exception e){throw new AssertionError(e);}}};
  Handler ui=new Handler(Looper.getMainLooper());ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(callback);registered.countDown();});assertTrue(registered.await(5,TimeUnit.SECONDS));
  context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  try{
   assertTrue(resumed.await(15,TimeUnit.SECONDS));WebView view=ref.get();pageLoaded(view);
   until(view,"document.readyState==='complete'&&!!window.OfflineMapImport&&typeof sqlmapLoadFile==='function'");
   eval(view,"_revealApp();switchTab('karta');window.importToken='first';window.workBefore=JSON.stringify([vlake,_tacke,_tragRegistry]);window.holdSave=true;window.copyOriginal=OfflineMapImport.copy;OfflineMapImport.copy=(f,n,p)=>{const j=copyOriginal(f,n,p);return {cancel:j.cancel,promise:j.promise.then(async b=>{while(holdSave)await new Promise(r=>setTimeout(r,10));return b;})}};const bytes=Uint8Array.from(atob('"+encoded+"'),c=>c.charCodeAt(0));window.importFile=new File([bytes,new Uint8Array(21*1024*1024)],'native-offline.sqlitedb');window.importReturned=false;window.importPromise=sqlmapLoadFile(importFile).then(()=>{importReturned=true;});void 0");
   until(view,"_sqlLayers.some(l=>l.name==='native-offline')&&_sqlImports.size===1&&importReturned");
   assertEquals("true",eval(view,"!_sqlLayers.find(l=>l.name==='native-offline').saved&&!document.getElementById('offline-import-status').hidden&&JSON.stringify([vlake,_tacke,_tragRegistry])===workBefore"));
   eval(view,"window.tileOK=false;_sqlWCall({type:'tile',name:'native-offline',z:13,x:4463,y:2940}).then(r=>tileOK=!!r.data&&r.data[0]===137);void 0");until(view,"tileOK");
   eval(view,"holdSave=false;void 0");until(view,"_sqlImports.size===0&&_sqlLayers.find(l=>l.name==='native-offline').saved");
   assertEquals("true",eval(view,"JSON.parse(localStorage.getItem(_LASTMAP_KEY)).opfsName===_sqlLayers.find(l=>l.name==='native-offline').opfsName"));
   CountDownLatch reload=new CountDownLatch(1);ui.post(()->{view.reload();reload.countDown();});assertTrue(reload.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   until(view,"document.readyState==='complete'&&typeof importToken==='undefined'&&typeof sqlmapRestoreAll==='function'");
   eval(view,"_revealApp();switchTab('karta');window.restorePromise=sqlmapRestoreAll();void 0");until(view,"_sqlLayers.some(l=>l.name==='native-offline'&&l.saved&&l.opfs)");
   eval(view,"window.tileOK=false;_sqlWCall({type:'tile',name:'native-offline',z:13,x:4463,y:2940}).then(r=>tileOK=!!r.data&&r.data[0]===137);void 0");until(view,"tileOK");
   eval(view,"window.removePromise=sqlmapRemove(_sqlLayers.findIndex(l=>l.name==='native-offline'));void 0");until(view,"!_sqlLayers.some(l=>l.name==='native-offline')");
   Log.i("OfflineImportCI","Prikaz prije završetka, OPFS čuvanje, nova WebView stranica i SQLite pločica bez interneta — OK; "+eval(view,"navigator.userAgent"));
  }finally{ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback);MainActivity a=activityRef.get();if(a!=null)a.finish();});}
 }
}
