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

 private android.app.Notification waitNotice(Context c,String content) throws Exception {
  long end=System.currentTimeMillis()+10000;String last="";
  do{last="";for(android.service.notification.StatusBarNotification n:c.getSystemService(android.app.NotificationManager.class).getActiveNotifications()){
   String text=String.valueOf(n.getNotification().extras.getCharSequence(android.app.Notification.EXTRA_TEXT));last+=n.getId()+":"+text+"; ";
   if(n.getId()==MapDownloadService.NOTICE&&text.contains(content))return n.getNotification();}
   Thread.sleep(100);
  }while(System.currentTimeMillis()<end);throw new AssertionError("Nema vidljive obavijesti: "+content+"; aktivne="+last);
 }
 private static final class FixtureBackend implements MapDownloads.Backend {
  volatile String state="paused";volatile int enqueues=0,removes=0;volatile java.io.File file;volatile byte[] bytes;
  FixtureBackend(byte[] bytes){this.bytes=bytes;}
  public String resolve(){return "https://drive.usercontent.google.com/download";}
  public synchronized long enqueue(String url,java.io.File file)throws Exception{this.file=file;try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(bytes);}return ++enqueues;}
  public org.json.JSONObject query(long id)throws Exception{return new org.json.JSONObject().put("state",state).put("bytes",bytes.length/2).put("total",bytes.length);}
  public void remove(long id){removes++;if(file!=null)file.delete();}
 }
 private static final class DriveResponse extends java.net.HttpURLConnection {
  final byte[] body;final long size;final String type,range;final int status;int bytesRead;boolean closed;
  DriveResponse(byte[] body,long size,String type,int status,String range)throws Exception{
   super(new java.net.URL("https://drive.usercontent.google.com/download"));this.body=body;this.size=size;this.type=type;this.status=status;this.range=range;
  }
  public int getResponseCode(){return status;}
  public String getContentType(){return type;}
  public long getContentLengthLong(){return size;}
  public String getHeaderField(String name){return name.equalsIgnoreCase("Content-Range")?range:null;}
  public java.io.InputStream getInputStream(){return new java.io.ByteArrayInputStream(body){public synchronized int read(byte[] b,int off,int len){int n=super.read(b,off,len);if(n>0)bytesRead+=n;return n;}};}
  public java.io.InputStream getErrorStream(){return getInputStream();}
  public void connect(){}
  public void disconnect(){closed=true;}
  public boolean usingProxy(){return false;}
 }
 @Test public void fullDriveGetDetectsQuotaBeforeEnqueueAndRejectsPartialResponses() throws Exception {
  long size=2144841728L;byte[] header="SQLite format 3\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
  String form="<form action=\"https://drive.usercontent.google.com/download\" method=\"get\"><input name=\"id\" value=\""+MapDownloads.FILE_ID+"\"><input name=\"export\" value=\"download\"><input name=\"confirm\" value=\"t\"><input name=\"uuid\" value=\"fixture\"></form>";
  byte[] quota="<html><title>Google Drive - Quota exceeded</title>Too many users have viewed or downloaded this file recently.</html>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
  DriveResponse first=new DriveResponse(form.getBytes(java.nio.charset.StandardCharsets.UTF_8),form.length(),"text/html",200,null),blocked=new DriveResponse(quota,quota.length,"text/html",200,null);
  final int[] calls={0};
  try{MapDownloads.resolveDrive(MapDownloads.FILE_ID,size,(url,range)->{assertFalse("Full GET, ne uspješan Range za blokirani download",range);return calls[0]++==0?first:blocked;});fail("Quota HTML prihvaćen kao karta");}
  catch(MapDownloads.DriveException e){assertEquals("drive_quota",e.code);assertTrue(e.getMessage().contains("Google Drive"));}
  assertEquals(2,calls[0]);assertTrue(first.closed&&blocked.closed);
  DriveResponse valid=new DriveResponse(header,size,"application/octet-stream",200,null);
  assertTrue(MapDownloads.resolveDrive(MapDownloads.FILE_ID,size,(url,range)->{assertFalse(range);return valid;}).startsWith("https://drive.usercontent.google.com/"));
  assertEquals("Preflight čita samo zaglavlje, ne 2 GB",16,valid.bytesRead);assertTrue(valid.closed);
  DriveResponse partial=new DriveResponse(header,16,"application/octet-stream",206,"bytes 0-15/2144841728");
  try{MapDownloads.resolveDrive(MapDownloads.FILE_ID,size,(url,range)->partial);fail("Djelimični odgovor prihvaćen");}catch(MapDownloads.DriveException e){assertEquals("partial_response",e.code);}
  java.io.File oldJob=java.io.File.createTempFile("drive-quota-", ".html",InstrumentationRegistry.getInstrumentation().getTargetContext().getCacheDir());
  try{try(java.io.FileOutputStream out=new java.io.FileOutputStream(oldJob)){out.write(quota);}
   try{MapDownloads.validate(oldJob,size);fail("Stari posao sakrio Drive quota razlog");}catch(MapDownloads.DriveException e){assertEquals("drive_quota",e.code);}
  }finally{oldJob.delete();}
 }
 @Test public void githubSourceChecksFullResponseAndKeepsStableUrlForResume() throws Exception {
  byte[] header="SQLite format 3\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
  DriveResponse good=new DriveResponse(header,MapDownloads.GITHUB_SIZE,"application/octet-stream",200,null);
  assertEquals(MapDownloads.GITHUB_URL,MapDownloads.resolveGithub(MapDownloads.GITHUB_SIZE,(url,range)->{assertEquals(MapDownloads.GITHUB_URL,url);assertFalse(range);return good;}));
  assertEquals(16,good.bytesRead);assertTrue(good.closed);
  for(DriveResponse bad:new DriveResponse[]{new DriveResponse(header,MapDownloads.GITHUB_SIZE,"text/html",200,null),new DriveResponse(header,16,"application/octet-stream",206,"bytes 0-15/1982578688"),new DriveResponse(header,MapDownloads.GITHUB_SIZE-1,"application/octet-stream",200,null),new DriveResponse(new byte[16],MapDownloads.GITHUB_SIZE,"application/octet-stream",200,null)}){
   try{MapDownloads.resolveGithub(MapDownloads.GITHUB_SIZE,(url,range)->bad);fail("Bad GitHub response accepted");}catch(MapDownloads.SourceException expected){}assertTrue(bad.closed);
  }
  assertTrue(MapDownloads.githubAllowed(new java.net.URL(MapDownloads.GITHUB_URL)));
  assertTrue(MapDownloads.githubAllowed(new java.net.URL("https://release-assets.githubusercontent.com/github-production-release-asset/fixture")));
  assertFalse(MapDownloads.githubAllowed(new java.net.URL("https://github.com/foreign/repo/releases/download/map.mbtiles")));
  assertFalse(MapDownloads.githubAllowed(new java.net.URL("https://release-assets.githubusercontent.com.attacker.test/file")));
  assertFalse(MapDownloads.githubAllowed(new java.net.URL("http://release-assets.githubusercontent.com/file")));
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
 private org.json.JSONArray kmlRow(String id,String name,byte[] bytes) throws Exception {
  org.json.JSONArray row=new org.json.JSONArray();for(int i=0;i<14;i++)row.put(org.json.JSONObject.NULL);
  return row.put(0,id).put(1,new org.json.JSONArray().put(MapDownloadCatalog.FOLDER_ID)).put(2,name).put(3,"application/vnd.google-earth.kml+xml").put(13,bytes.length);
 }
 @Test public void kmlFolderTransferRejectsHtmlPartialForeignAndMalformedFiles() throws Exception {
  Context c=InstrumentationRegistry.getInstrumentation().getTargetContext();
  byte[] bytes="<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Placemark><name>Čuvar</name><Point><coordinates>16,44.9</coordinates></Point></Placemark></kml>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
  String id="fixture-kml-source-261";org.json.JSONArray rows=new org.json.JSONArray().put(kmlRow(id,"Granice odjela ",bytes));
  org.json.JSONArray raster=kmlRow("fixture-raster-261","Karta.mbtiles",bytes).put(3,"application/octet-stream");rows.put(raster);
  assertEquals(1,KmlDownloads.parse(rows).length());assertEquals("Granice odjela",KmlDownloads.parse(rows).getJSONObject(0).getString("name"));
  org.json.JSONArray foreign=kmlRow("fixture-foreign-261","Tuđe.kml",bytes).put(1,new org.json.JSONArray().put("foreign-folder"));rows.put(foreign);assertEquals(1,KmlDownloads.parse(rows).length());
  AtomicReference<byte[]> body=new AtomicReference<>(bytes);AtomicReference<String> type=new AtomicReference<>("application/vnd.google-earth.kml+xml");AtomicReference<Integer> code=new AtomicReference<>(200);
  KmlDownloads k=new KmlDownloads(c,()->rows,(url,range)->{assertFalse(range);return new DriveResponse(body.get(),body.get().length,type.get(),code.get(),code.get()==206?"bytes 0-15/200":null);},"fixture-kml-261");
  k.action(new JSONObject().put("type","list").put("refresh",true));
  try{k.action(new JSONObject().put("type","download").put("sourceId","foreign-source-261"));fail("Foreign KML accepted");}catch(java.io.IOException expected){}
  JSONObject msg=new JSONObject().put("type","download").put("sourceId",id),release=new JSONObject().put("type","release").put("sourceId",id);
  k.action(release);assertTrue(k.action(msg).getString("url").endsWith(id+".kml"));assertEquals(200,k.handle(id+".kml").getStatusCode());k.action(release);assertEquals(404,k.handle(id+".kml").getStatusCode());assertEquals(404,k.handle("../secret.kml").getStatusCode());
  body.set("<html>Google Drive - Quota exceeded</html>".getBytes());type.set("text/html");
  try{k.action(msg);fail("Quota HTML accepted");}catch(MapDownloads.DriveException e){assertEquals("drive_quota",e.code);}
  body.set(bytes);type.set("application/octet-stream");code.set(206);
  try{k.action(msg);fail("Partial KML accepted");}catch(java.io.IOException expected){}
  code.set(200);body.set(java.util.Arrays.copyOf(bytes,bytes.length-1));
  try{k.action(msg);fail("Truncated KML accepted");}catch(java.io.IOException expected){}
  java.io.File file=java.io.File.createTempFile("bad-kml-", ".kml",c.getCacheDir());
  try{for(String text:new String[]{"<html><body>Sign in</body></html>","<kml><Placemark>","<kml/><kml/>","<!DOCTYPE kml [<!ENTITY x 'example'>]><kml>&x;</kml>"}){
   byte[] data=text.getBytes();try(java.io.FileOutputStream out=new java.io.FileOutputStream(file)){out.write(data);}
   try{KmlDownloads.validate(file,data.length);fail("Invalid XML accepted: "+text);}catch(java.io.IOException expected){}
  }}finally{file.delete();k.action(release);}
 }
 @Test(timeout=90000) public void automaticDownloadInstallOfflineReloadAndDelete() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  assertFalse("Emulator bez interneta",ReferenceOcrBridge.hasInternet(context));
  byte[] bytes;try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("mbtiles-mini.mbtiles")){java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] b=new byte[4096];int n;while((n=in.read(b))>0)out.write(b,0,n);bytes=out.toByteArray();}
  // Drive compatibility remains; the transfer below uses a real MBTiles fixture and the GitHub source ID.
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
  Field singleton=MapDownloadCatalog.class.getDeclaredField("instance");singleton.setAccessible(true);Object originalCatalog=singleton.get(null);
  try{
   assertTrue(resumed.await(15,TimeUnit.SECONDS));WebView view=ref.get();pageLoaded(view);until(view,"document.readyState==='complete'&&!!window.MapDownloads&&typeof sqlmapLoadFile==='function'");
   Field f=MainActivity.class.getDeclaredField("offlineMaps");f.setAccessible(true);OfflineMaps maps=(OfflineMaps)f.get(null);
   MapDownloadCatalog.Source source=new MapDownloadCatalog.Source(MapDownloads.GITHUB_ID,MapDownloads.GITHUB_NAME,bytes.length);
   download=new MapDownloads(context,maps,source,transport,"unsko-download-test");download.cancel();
   MapDownloads attachedJob=download;java.util.List<MapDownloadCatalog.Source> sources=new java.util.ArrayList<>();sources.add(source);
   MapDownloadCatalog attached=new MapDownloadCatalog(context,()->sources,item->attachedJob,"map-catalog-test");
   attached.list(true);
   try{attached.action(new JSONObject().put("type","start").put("sourceId","foreign-map-file-id"));fail("Karta izvan foldera prihvaćena");}catch(java.io.IOException expected){}
   assertEquals(0,transport.enqueues);
   CountDownLatch ready=new CountDownLatch(1);ui.post(()->{view.addJavascriptInterface(attached.new Bridge(view),"AndroidMapDownloads");view.reload();ready.countDown();});assertTrue(ready.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   eval(view,"_revealApp();switchTab('karta');window.workBefore=JSON.stringify([vlake,_tacke,_tragRegistry]);Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});openLoadMapScreen();void 0");
   until(view,"document.getElementById('loadmap-download-"+MapDownloads.GITHUB_ID+"').textContent==='Skini kartu'&&!document.getElementById('loadmap-download-"+MapDownloads.GITHUB_ID+"').disabled");
   eval(view,"document.getElementById('loadmap-download-"+MapDownloads.GITHUB_ID+"').click();void 0");
   assertEquals("true",eval(view,"document.querySelector('.lm-download-status').textContent.includes('uključi internet')"));assertEquals(0,transport.enqueues);
   eval(view,"Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});document.getElementById('loadmap-download-"+MapDownloads.GITHUB_ID+"').click();void 0");
   until(view,"document.querySelector('.lm-download-status').textContent.includes('Čekam vezu')");assertEquals(1,transport.enqueues);
   // Recreate native download controller and reload JS: job ID and progress survive.
   download=new MapDownloads(context,maps,source,transport,"unsko-download-test");MapDownloads recoveredJob=download;
   MapDownloadCatalog recovered=new MapDownloadCatalog(context,()->sources,item->recoveredJob,"map-catalog-test");
   assertEquals("paused",download.status().getString("state"));
   if(Build.VERSION.SDK_INT>=33)InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.POST_NOTIFICATIONS);
   singleton.set(null,recovered);MapDownloadService.ensure(context);
   android.app.Notification paused=waitNotice(context,"Čekam internet");
   assertEquals(source.name,paused.extras.getCharSequence(android.app.Notification.EXTRA_TITLE).toString());
   assertNotNull(paused.getSmallIcon());assertNotNull(paused.contentIntent);
   assertTrue((paused.flags&android.app.Notification.FLAG_ONLY_ALERT_ONCE)!=0);
   assertTrue((paused.flags&android.app.Notification.FLAG_ONGOING_EVENT)!=0);
   android.app.NotificationChannel channel=context.getSystemService(android.app.NotificationManager.class).getNotificationChannel(MapDownloadService.CHANNEL);
   assertEquals(android.app.NotificationManager.IMPORTANCE_LOW,channel.getImportance());assertNull(channel.getSound());assertFalse(channel.shouldVibrate());
   transport.state="downloading";android.app.Notification progress=waitNotice(context,"50%");
   assertEquals(50,progress.extras.getInt(android.app.Notification.EXTRA_PROGRESS));
   transport.state="paused";waitNotice(context,"Čekam internet");

   CountDownLatch reload=new CountDownLatch(1);ui.post(()->{view.addJavascriptInterface(recovered.new Bridge(view),"AndroidMapDownloads");view.reload();reload.countDown();});assertTrue(reload.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   eval(view,"_revealApp();switchTab('karta');openLoadMapScreen();void 0");until(view,"document.querySelector('.lm-download-status').textContent.includes('Čekam vezu')");
   transport.state="complete";eval(view,"MapDownloads.resume();void 0");
   until(view,"_sqlLayers.some(l=>l.name==='Unsko_2021-2031'&&l.saved)&&document.querySelector('.lm-download-status').textContent.includes('Spremna')");
   eval(view,"_loadmapTab('maps');_loadmapRenderManage();void 0");
   until(view,"localStorage.getItem('lm_thumb_v2_Unsko_2021-2031')==='1'&&document.querySelector('.lm-map-preview .lm-thumb').src.startsWith('data:image/jpeg')");
   assertEquals("true",eval(view,"Array.isArray(_sqlLayers.find(l=>l.name==='Unsko_2021-2031').meta._preview)"));
   waitNotice(context,"Otvori aplikaciju");
   long stopped=System.currentTimeMillis()+5000;while(MapDownloadService.isRunning()&&System.currentTimeMillis()<stopped)Thread.sleep(100);
   assertFalse("Servis završenog preuzimanja je ugašen",MapDownloadService.isRunning());
   assertFalse("Završna obavijest ostaje nakon gašenja servisa",(waitNotice(context,"Otvori aplikaciju").flags&android.app.Notification.FLAG_ONGOING_EVENT)!=0);
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
   // A failed transfer whose Drive source was removed must release its partial file and report idle.
   transport.state="failed";download.start();end=System.currentTimeMillis()+5000;while(transport.enqueues<3&&System.currentTimeMillis()<end)Thread.sleep(50);
   assertTrue(transport.file.exists());sources.clear();recovered.list(true);
   JSONObject removedState=recovered.statuses().getJSONArray("files").getJSONObject(0).getJSONObject("status");assertEquals("idle",removedState.getString("state"));assertFalse(transport.file.exists());
   // Native KML bridge + production local URL handler + Leaflet + IDB + offline reload.
   byte[] kml="<kml xmlns=\"http://www.opengis.net/kml/2.2\"><Placemark><name>Odjel Čuvar</name><LineString><coordinates>16,44.9 16.001,44.901</coordinates></LineString></Placemark></kml>".getBytes(java.nio.charset.StandardCharsets.UTF_8);
   String kmlId="fixture-kml-webview-261";int[] fetches={0};
   KmlDownloads kmlController=new KmlDownloads(context,()->new org.json.JSONArray().put(kmlRow(kmlId,"KML proba 261",kml)),(url,range)->{fetches[0]++;return new DriveResponse(kml,kml.length,"application/vnd.google-earth.kml+xml",200,null);},"drive-kml-v1");
   kmlController.action(new JSONObject().put("type","release").put("sourceId",kmlId));kmlController.action(new JSONObject().put("type","list").put("refresh",true));
   CountDownLatch kmlReady=new CountDownLatch(1);ui.post(()->{view.addJavascriptInterface(kmlController.new Bridge(view),"AndroidKmlDownloads");view.reload();kmlReady.countDown();});assertTrue(kmlReady.await(5,TimeUnit.SECONDS));Thread.sleep(300);pageLoaded(view);
   eval(view,"sbUser={id:'kml-fixture-user'};_revealApp();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});openLayerImport();void 0");
   until(view,"document.querySelector('#kml-drive-list button[data-source-id=\""+kmlId+"\"]')&&!document.querySelector('#kml-drive-list button').disabled");
   eval(view,"KmlDownloads.start('"+kmlId+"');void 0");until(view,"!_layerImportBusy&&kmlLs.some(k=>k._origName==='KML proba 261.kml')");
   assertEquals("true",eval(view,"!!JSON.parse(localStorage.getItem(_LOCAL_KML_KEY))['KML proba 261.kml']._driveSource"));assertEquals(1,fetches[0]);
   ui.post(()->view.reload());Thread.sleep(300);pageLoaded(view);
   eval(view,"sbUser={id:'kml-fixture-user'};_revealApp();Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});_localKmlRestore().then(()=>openLayerImport());void 0");
   until(view,"document.querySelector('#kml-drive-list button')?.textContent==='Prikaži'");
   eval(view,"KmlDownloads.start('"+kmlId+"');void 0");until(view,"!_layerImportBusy&&document.getElementById('layer-import-modal').style.display==='none'");assertEquals(1,fetches[0]);
   assertEquals("1",eval(view,"kmlLs.filter(k=>k._origName==='KML proba 261.kml').length"));
   eval(view,"kmlLs=kmlLs.filter(k=>{if(k._origName==='KML proba 261.kml'){map.removeLayer(k.grp);return false;}return true;});_localKmlSaveAll();void 0");
  }finally{
   context.stopService(new Intent(context,MapDownloadService.class));Thread.sleep(200);singleton.set(null,originalCatalog);context.getSystemService(android.app.NotificationManager.class).cancel(MapDownloadService.NOTICE);
   if(download!=null)download.cancel();CountDownLatch removed=new CountDownLatch(1);ui.post(()->{ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(callback);if(activityRef.get()!=null)activityRef.get().finish();removed.countDown();});removed.await(5,TimeUnit.SECONDS);
  }
 }
}
