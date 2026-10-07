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
public class MapDownloadsTest {
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

 private static final class FixtureBackend implements MapDownloads.Backend {
  volatile String state="paused";volatile int enqueues=0,removes=0;volatile java.io.File file;volatile byte[] bytes;
  FixtureBackend(byte[] bytes){this.bytes=bytes;}
  public String resolve(){return "https://drive.usercontent.google.com/download";}
  public synchronized long enqueue(String url,java.io.File file)throws Exception{this.file=file;try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(bytes);}return ++enqueues;}
  public org.json.JSONObject query(long id)throws Exception{return new org.json.JSONObject().put("state",state).put("bytes",bytes.length/2).put("total",bytes.length);}
  public void remove(long id){removes++;if(file!=null)file.delete();}
 }
 @Test public void publicFolderParserAcceptsUnicodeAndLongSizesWithoutExecutingScripts() throws Exception {
  org.json.JSONArray row=new org.json.JSONArray();for(int i=0;i<14;i++)row.put(org.json.JSONObject.NULL);
  row.put(0,"1mExFpUJgOAROwPSumemnnbzFH74GWHXv").put(1,new org.json.JSONArray().put(MapDownloadCatalog.FOLDER_ID)).put(2,"KARTA_špd.mbtiles").put(3,"application/octet-stream").put(13,2144841728L);
  org.json.JSONArray rows=new org.json.JSONArray().put(row);String json=new org.json.JSONArray().put(rows).put(org.json.JSONObject.NULL).toString();
  String html="<script>window['_DRIVE_ivd'] = '"+json.replace("\\","\\\\").replace("'","\\'")+"';throw Error('Never execute');</script>";
  java.util.List<MapDownloadCatalog.Source> files=MapDownloadCatalog.parse(html);assertEquals(1,files.size());assertEquals("KARTA_špd.mbtiles",files.get(0).name);assertEquals(2144841728L,files.get(0).size);
  String hex=html.replace("[","\\x5b").replace("]","\\x5d");
  // Escape only payload delimiters, leaving the marker syntax intact.
  hex=hex.replace("window\\x5b'_DRIVE_ivd'\\x5d","window['_DRIVE_ivd']");assertEquals(1,MapDownloadCatalog.parse(hex).size());
  try{MapDownloadCatalog.parse("<html>Google Sign-in</html>");fail("Prijava prihvaćena kao katalog");}catch(java.io.IOException expected){}
  row.put(1,new org.json.JSONArray().put("foreign-folder"));json=new org.json.JSONArray().put(new org.json.JSONArray().put(row)).put(org.json.JSONObject.NULL).toString();
  assertTrue(MapDownloadCatalog.parse("window['_DRIVE_ivd'] = '"+json+"';").isEmpty());
 }
 @Test(timeout=90000) public void automaticDownloadInstallOfflineReloadAndDelete() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Emulator bez interneta",ReferenceOcrBridge.hasInternet(context));
  byte[] bytes;try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("rmaps-mini.sqlitedb")){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))>0)out.write(b,0,n);bytes=out.toByteArray();}
  // Only the fixed Drive file may be accepted; downloaded HTML and truncated files cannot become maps.
  String form="<form action=\"https://drive.usercontent.google.com/download\" method=\"get\"><input name=\"id\" value=\""+MapDownloads.FILE_ID+"\"><input name=\"export\" value=\"download\"><input name=\"confirm\" value=\"t\"><input name=\"uuid\" value=\"fixture\"></form>";
  assertTrue(MapDownloads.confirmation(form).contains("confirm=t"));
  String newId="1mExFpUJgOAROwPSumemnnbzFH74GWHXv";assertTrue(MapDownloads.confirmation(form.replace(MapDownloads.FILE_ID,newId),newId).contains(newId));
  try{MapDownloads.confirmation(form.replace(MapDownloads.FILE_ID,"another-file"));fail("Pogrešan izvor prihvaćen");}catch(java.io.IOException expected){}
  assertFalse(MapDownloads.allowed(new java.net.URL("http://drive.google.com/download")));
  assertFalse(MapDownloads.allowed(new java.net.URL("https://drive.google.com.attacker.test/download")));
  FixtureBackend transport=new FixtureBackend(bytes);
  AtomicReference<WebView> ref=new AtomicReference<>();AtomicReference<MainActivity> activityRef=new AtomicReference<>();CountDownLatch resumed=new CountDownLatch(1),registered=new CountDownLatch(1);
  ActivityLifecycleCallback callback=(a,stage)->{if(a instanceof MainActivity&&stage==Stage.RESUMED){try{Field f=MainActivity.class.getDeclaredField("webView");f.setAccessible(true);ref.set((WebView)f.get(a));activityRef.set((MainActivity)a);resumed.countDown();}catch(Exception e){throw new AssertionError(e);}}};
  Handler ui=new Handler(Looper.getMainLooper());ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(callback);registered.countDown();});assertTrue(registered.await(5,TimeUnit.SECONDS));
  context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
  MapDownloads download=null;
  try{
   assertTrue(resumed.await(15,TimeUnit.SECONDS));WebView view=ref.get();pageLoaded(view);until(view,"document.readyState==='complete'&&!!window.MapDownloads&&typeof sqlmapLoadFile==='function'");
   Field f=MainActivity.class.getDeclaredField("offlineMaps");f.setAccessible(true);OfflineMaps maps=(OfflineMaps)f.get(null);
   download=new MapDownloads(context,maps,transport,bytes.length,"unsko-download-test");download.cancel();
   MapDownloadCatalog.Source source=new MapDownloadCatalog.Source(MapDownloads.FILE_ID,MapDownloads.NAME,bytes.length);
   MapDownloads attachedJob=download;
   MapDownloadCatalog attached=new MapDownloadCatalog(context,()->java.util.Collections.singletonList(source),item->attachedJob,"map-catalog-test");
   attached.list(true);
   try{attached.action(new JSONObject().put("type","start").put("sourceId","foreign-map-file-id"));fail("Karta izvan foldera prihvaćena");}catch(java.io.IOException expected){}
   assertEquals(0,transport.enqueues);
   CountDownLatch ready=new CountDownLatch(1);ui.post(()->{view.addJavascriptInterface(attached.new Bridge(view),"AndroidMapDownloads");view.reload();ready.countDown();});assertTrue(ready.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   eval(view,"_revealApp();switchTab('karta');window.workBefore=JSON.stringify([vlake,_tacke,_tragRegistry]);Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});openLoadMapScreen();void 0");
   until(view,"document.getElementById('loadmap-download-"+MapDownloads.FILE_ID+"').textContent==='Skini kartu'&&!document.getElementById('loadmap-download-"+MapDownloads.FILE_ID+"').disabled");
   eval(view,"document.getElementById('loadmap-download-"+MapDownloads.FILE_ID+"').click();void 0");
   assertEquals("true",eval(view,"document.querySelector('.lm-download-status').textContent.includes('uključi internet')"));assertEquals(0,transport.enqueues);
   eval(view,"Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});document.getElementById('loadmap-download-"+MapDownloads.FILE_ID+"').click();void 0");
   until(view,"document.querySelector('.lm-download-status').textContent.includes('Čekam vezu')");assertEquals(1,transport.enqueues);
   // Recreate native download controller and reload JS: job ID and progress survive.
   download=new MapDownloads(context,maps,transport,bytes.length,"unsko-download-test");MapDownloads recoveredJob=download;
   MapDownloadCatalog recovered=new MapDownloadCatalog(context,()->java.util.Collections.singletonList(source),item->recoveredJob,"map-catalog-test");
   assertEquals("paused",download.status().getString("state"));
   CountDownLatch reload=new CountDownLatch(1);ui.post(()->{view.addJavascriptInterface(recovered.new Bridge(view),"AndroidMapDownloads");view.reload();reload.countDown();});assertTrue(reload.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   eval(view,"_revealApp();switchTab('karta');openLoadMapScreen();void 0");until(view,"document.querySelector('.lm-download-status').textContent.includes('Čekam vezu')");
   transport.state="complete";eval(view,"MapDownloads.resume();void 0");
   until(view,"_sqlLayers.some(l=>l.name==='Unsko_2021-2031'&&l.saved)&&document.querySelector('.lm-download-status').textContent.includes('Spremna')");
   JSONObject status=download.status();String nativeId=status.getJSONObject("file").getString("nativeId");assertEquals("installed",status.getString("state"));
   assertFalse("Bez duple kopije",new java.io.File(context.getFilesDir(),"offline-maps/"+nativeId+".sqlite").exists());
   eval(view,"window.downloadTile=false;_sqlWCall({type:'tile',name:'Unsko_2021-2031',z:13,x:4463,y:2940}).then(r=>downloadTile=!!r.data&&r.data[0]===137);void 0");until(view,"downloadTile");
   java.io.File saved=transport.file;assertTrue(saved.isFile());
   ui.post(()->view.reload());Thread.sleep(300);pageLoaded(view);
   eval(view,"_revealApp();switchTab('karta');sqlmapRestoreAll().then(()=>MapDownloads.resume());void 0");until(view,"_sqlLayers.some(l=>l.name==='Unsko_2021-2031'&&l.saved)");
   assertEquals(1,transport.enqueues);eval(view,"window.downloadTile=false;_sqlWCall({type:'tile',name:'Unsko_2021-2031',z:13,x:4463,y:2940}).then(r=>downloadTile=!!r.data&&r.data[0]===137);void 0");until(view,"downloadTile");
   eval(view,"sqlmapRemove(_sqlLayers.findIndex(l=>l.name==='Unsko_2021-2031'));void 0");until(view,"!_sqlLayers.some(l=>l.name==='Unsko_2021-2031')");assertFalse(saved.exists());assertEquals("idle",download.status().getString("state"));
   // Transfer marked complete but containing HTML must fail before catalogue registration.
   transport.bytes=new byte[bytes.length];transport.state="complete";download.start();long end=System.currentTimeMillis()+5000;while(transport.enqueues<2&&System.currentTimeMillis()<end)Thread.sleep(50);
   assertEquals("failed",download.status().getString("state"));assertFalse(transport.file.exists());
  }finally{
   if(download!=null)download.cancel();CountDownLatch removed=new CountDownLatch(1);ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback);if(activityRef.get()!=null)activityRef.get().finish();removed.countDown();});removed.await(5,TimeUnit.SECONDS);
  }
 }
}
