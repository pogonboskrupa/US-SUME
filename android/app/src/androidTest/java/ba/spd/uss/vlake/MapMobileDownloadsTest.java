package ba.spd.uss.vlake;

import android.content.Context;
import android.os.Environment;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class MapMobileDownloadsTest {
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    private byte[] raster() throws Exception {
        try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("mbtiles-mini.mbtiles");ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[4096];int n;while((n=in.read(b))>0)out.write(b,0,n);return out.toByteArray();
        }
    }
    private MapDownloadCatalog.Source source(byte[] b) throws Exception {return new MapDownloadCatalog.Source("github-asset-2640001","Mobilna.mbtiles",b.length,MapDownloads.GITHUB_URL,"Mobilni podaci");}
    private static class Response extends HttpURLConnection {
        final byte[] body;final long length;final int code;final String range,tag;boolean closed;
        Response(byte[] b,long length,int code,String range,String tag)throws Exception{super(new URL(MapDownloads.GITHUB_URL));body=b;this.length=length;this.code=code;this.range=range;this.tag=tag;}
        public int getResponseCode(){return code;}public String getContentType(){return "application/octet-stream";}public long getContentLengthLong(){return length;}
        public String getHeaderField(String key){return key.equalsIgnoreCase("Content-Range")?range:key.equalsIgnoreCase("ETag")?tag:null;}
        public InputStream getInputStream(){return new ByteArrayInputStream(body);}public void connect(){}public void disconnect(){closed=true;}public boolean usingProxy(){return false;}
    }
    private JSONObject until(MapHttpTransfer t,String state) throws Exception {
        long end=System.currentTimeMillis()+5000;JSONObject last=null;
        do{last=t.query();if(state.equals(last.getString("state")))return last;Thread.sleep(10);}while(System.currentTimeMillis()<end);throw new AssertionError(last);
    }
    @Test public void mobileTransferResumesVerifiedRangeAfterDisconnectAndProcessRecovery() throws Exception {
        Context c=context();byte[] bytes=raster();MapDownloadCatalog.Source s=source(bytes);File f=new File(c.getCacheDir(),UUID.randomUUID()+".sqlite");String storage="mobile-resume-test-264";
        AtomicBoolean connected=new AtomicBoolean(false);AtomicInteger requests=new AtomicInteger();int cut=10240;
        MapHttpTransfer first=new MapHttpTransfer(c,s,(url,offset,tag)->{requests.incrementAndGet();assertEquals(0,offset);return new Response(Arrays.copyOf(bytes,cut),bytes.length,200,null,"\"v1\"");},connected::get,storage);
        try{
            first.cancel();assertEquals(MapHttpTransfer.JOB,first.enqueue(s.url,f));assertEquals("paused",first.query().getString("state"));assertEquals(0,requests.get());
            connected.set(true);JSONObject paused=until(first,"paused");assertEquals(cut,f.length());assertEquals(cut,paused.getLong("bytes"));assertTrue(paused.getString("message").contains("Veza je prekinuta"));
            AtomicLong resumedAt=new AtomicLong();MapHttpTransfer recovered=new MapHttpTransfer(c,s,(url,offset,tag)->{resumedAt.set(offset);assertEquals("\"v1\"",tag);return new Response(Arrays.copyOfRange(bytes,(int)offset,bytes.length),bytes.length-offset,206,"bytes "+offset+"-"+(bytes.length-1)+"/"+bytes.length,"\"v1\"");},connected::get,storage);
            until(recovered,"complete");assertEquals(cut,resumedAt.get());assertArrayEquals(bytes,java.nio.file.Files.readAllBytes(f.toPath()));recovered.cancel();
        }finally{first.cancel();f.delete();}
    }
    @Test public void serverRevisionRestartsSafelyAndWrongResumeRangeIsRejected() throws Exception {
        Context c=context();byte[] bytes=raster();MapDownloadCatalog.Source s=source(bytes);int cut=10240;
        for(boolean bad:new boolean[]{false,true}){
            File f=new File(c.getCacheDir(),UUID.randomUUID()+".sqlite");String storage="mobile-range-test-264";
            MapHttpTransfer first=new MapHttpTransfer(c,s,(url,offset,tag)->new Response(Arrays.copyOf(bytes,cut),bytes.length,200,null,"\"old\""),()->true,storage);
            try{
                first.cancel();first.enqueue(s.url,f);until(first,"paused");assertEquals(cut,f.length());
                MapHttpTransfer recovered=new MapHttpTransfer(c,s,(url,offset,tag)->{assertEquals(cut,offset);return bad?new Response(Arrays.copyOfRange(bytes,cut,bytes.length),bytes.length-cut,206,"bytes 1-"+(bytes.length-1)+"/"+bytes.length,"\"old\""):new Response(bytes,bytes.length,200,null,"\"new\"");},()->true,storage);
                until(recovered,bad?"failed":"complete");if(bad)assertEquals(cut,f.length());else assertArrayEquals(bytes,java.nio.file.Files.readAllBytes(f.toPath()));recovered.cancel();
            }finally{first.cancel();f.delete();}
        }
    }
    @Test public void cancelledTransferCannotRecreateFileAfterItsNetworkReadReturns() throws Exception {
        Context c=context();byte[] bytes=raster();MapDownloadCatalog.Source s=source(bytes);File f=new File(c.getCacheDir(),UUID.randomUUID()+".sqlite");CountDownLatch reading=new CountDownLatch(1),release=new CountDownLatch(1),closed=new CountDownLatch(2);
        MapHttpTransfer t=new MapHttpTransfer(c,s,(url,offset,tag)->new Response(bytes,bytes.length,200,null,"\"v1\""){
            public InputStream getInputStream(){return new ByteArrayInputStream(bytes){public synchronized int read(byte[] b,int off,int len){reading.countDown();try{assertTrue(release.await(5,TimeUnit.SECONDS));}catch(InterruptedException e){throw new AssertionError(e);}return super.read(b,off,len);}};}
            public void disconnect(){super.disconnect();closed.countDown();}
        },()->true,"mobile-cancel-test-264");
        try{t.cancel();t.enqueue(s.url,f);t.query();assertTrue(reading.await(5,TimeUnit.SECONDS));t.cancel();f.delete();release.countDown();assertTrue(closed.await(5,TimeUnit.SECONDS));assertFalse(f.exists());assertEquals("idle",t.query().getString("state"));}finally{release.countDown();t.cancel();f.delete();}
    }
    @Test public void legacyWifiWaitMovesPartialBeforeSystemJobDeletionAndRecoversHandoff() throws Exception {
        Context c=context();byte[] bytes=raster();MapDownloadCatalog.Source s=source(bytes);String storage="mobile-handoff-test-264";
        File dir=new File(c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),"offline-maps");dir.mkdirs();File original=new File(dir,UUID.randomUUID()+".sqlitedb");java.nio.file.Files.write(original.toPath(),Arrays.copyOf(bytes,10240));
        c.getSharedPreferences(storage,Context.MODE_PRIVATE).edit().clear().putLong("id",71).putString("file",original.getName()).commit();AtomicReference<File> moved=new AtomicReference<>();AtomicBoolean deleted=new AtomicBoolean();
        MapDownloads.Backend backend=new MapDownloads.Backend(){
            public String resolve(){return s.url;}public long enqueue(String url,File f){moved.set(f);return MapHttpTransfer.JOB;}
            public JSONObject query(long id)throws Exception{return new JSONObject().put("state","paused").put("legacyTransfer",id==71).put("wifiOnly",id==71);}
            public void remove(long id){if(id==71){deleted.set(true);original.delete();}}
        };
        MapDownloads map=new MapDownloads(c,new OfflineMaps(c),s,backend,storage);
        try{
            assertEquals("paused",map.status().getString("state"));assertTrue(deleted.get());assertFalse(original.exists());assertEquals(10240,moved.get().length());assertFalse(c.getSharedPreferences(storage,Context.MODE_PRIVATE).contains("legacyId"));
            // Simulate a process death during the persisted handoff, then recover.
            c.getSharedPreferences(storage,Context.MODE_PRIVATE).edit().putLong("legacyId",71).commit();new MapDownloads(c,new OfflineMaps(c),s,backend,storage).status();assertEquals(10240,moved.get().length());assertFalse(c.getSharedPreferences(storage,Context.MODE_PRIVATE).contains("legacyId"));
        }finally{map.cancel();original.delete();if(moved.get()!=null)moved.get().delete();}
    }
}
