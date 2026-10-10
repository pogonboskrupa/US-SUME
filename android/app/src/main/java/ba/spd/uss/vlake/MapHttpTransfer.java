package ba.spd.uss.vlake;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.PowerManager;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

/** App-owned, bounded-memory GitHub transfer. Large maps may use mobile data. */
final class MapHttpTransfer {
    static final long JOB=Long.MAX_VALUE;
    private static final Map<String,MapHttpTransfer> transfers=new HashMap<>();
    private static final ExecutorService workers=Executors.newFixedThreadPool(2);
    interface Transport {HttpURLConnection open(String url,long offset,String validator) throws Exception;}
    interface Network {boolean available();}
    private final SharedPreferences prefs;
    private final MapDownloadCatalog.Source source;
    private final Transport transport;
    private final Network network;
    private final Context app;
    private long generation,retryAt;
    private boolean running;
    private HttpURLConnection connection;
    static synchronized MapHttpTransfer shared(Context c,MapDownloadCatalog.Source source){
        MapHttpTransfer t=transfers.get(source.id);
        if(t!=null&&(t.source.size!=source.size||!t.source.url.equals(source.url))){t.cancel();t=null;}
        if(t==null){t=new MapHttpTransfer(c,source,MapHttpTransfer::open,()->hasNetwork(c),"map-http-"+source.id);transfers.put(source.id,t);}return t;
    }
    MapHttpTransfer(Context c,MapDownloadCatalog.Source s,Transport transport,Network network,String storage){
        app=c.getApplicationContext();source=s;this.transport=transport;this.network=network;prefs=app.getSharedPreferences(storage,Context.MODE_PRIVATE);
    }
    static boolean hasNetwork(Context c){
        try{ConnectivityManager cm=c.getSystemService(ConnectivityManager.class);NetworkCapabilities n=cm.getNetworkCapabilities(cm.getActiveNetwork());return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);}catch(RuntimeException unavailable){return false;}
    }
    synchronized long enqueue(String url,File target) throws Exception {
        if(!source.isGithub()||!MapDownloads.githubAssetURL(new URL(url)))throw new IOException("Nepoznat izvor karte");
        if(target.getAbsolutePath().equals(prefs.getString("file",""))&&url.equals(prefs.getString("url","")))return JOB;
        cancel();if(!prefs.edit().putString("file",target.getAbsolutePath()).putString("url",url).putString("state","paused").commit())throw new IOException("Ne mogu sačuvati preuzimanje");
        return JOB; // Service polling starts the worker after its job ID is persisted.
    }
    synchronized JSONObject query() throws Exception {
        String path=prefs.getString("file",""),state=prefs.getString("state","idle");File f=path.isEmpty()?null:new File(path);
        long bytes=f!=null&&f.isFile()?f.length():0;
        if(!running&&(state.equals("downloading")||state.equals("paused"))){
            // Recovery may find all bytes durable before the final state commit.
            // Validation/import must work offline without another server request.
            if(bytes==source.size){state="complete";prefs.edit().putString("state",state).putString("message","").commit();}
            else if(!network.available()){state="paused";prefs.edit().putString("state",state).putString("message","Čekam vezu — nastavak je automatski.").apply();}
            else if(System.currentTimeMillis()>=retryAt){running=true;state="downloading";prefs.edit().putString("state",state).putString("message","").apply();final long token=++generation;workers.execute(()->run(token));}
        }
        return new JSONObject().put("state",state).put("bytes",bytes).put("total",source.size).put("message",prefs.getString("message","")).put("error",prefs.getString("error",""));
    }
    void cancel(){
        HttpURLConnection old;
        synchronized(this){generation++;running=false;retryAt=0;old=connection;connection=null;prefs.edit().clear().commit();}
        // Persist cancellation before potentially slow socket teardown, and do
        // not hold the state lock while interrupting the worker's network read.
        if(old!=null)old.disconnect();
    }
    private synchronized void check(long token) throws IOException {if(token!=generation)throw new IOException("Preuzimanje je otkazano");}
    private synchronized void finish(long token,String state,String text){
        if(token!=generation)return;running=false;connection=null;retryAt=state.equals("paused")?System.currentTimeMillis()+10000:0;
        prefs.edit().putString("state",state).putString(state.equals("failed")?"error":"message",text).commit();
    }
    private static final class Invalid extends IOException {Invalid(String text){super(text);}}
    private void run(long token){
        PowerManager.WakeLock wake=app.getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"DendroMap:map-download");
        wake.setReferenceCounted(false);
        HttpURLConnection c=null;
        try{
            wake.acquire(10*60*1000L);File target;String url,validator;long offset;
            synchronized(this){check(token);target=new File(prefs.getString("file",""));url=prefs.getString("url","");validator=prefs.getString("validator","");offset=target.isFile()?target.length():0;}
            if(offset>source.size)throw new Invalid("Nepotpuna ili promijenjena karta. Pokušaj ponovo.");
            if(offset==source.size){finish(token,"complete","");return;}
            // Only resume bytes tied to a known server validator. Legacy partials
            // without ETag restart safely instead of mixing different revisions.
            long requested=validator.isEmpty()?0:offset;c=transport.open(url,requested,validator);
            synchronized(this){check(token);connection=c;}
            int code=c.getResponseCode();
            if(code==429||code>=500)throw new IOException("Server je privremeno nedostupan.");
            if(code!=200&&code!=206)throw new Invalid("GitHub karta trenutno nije dostupna. Pokušaj ponovo kasnije.");
            if(String.valueOf(c.getContentType()).toLowerCase(Locale.ROOT).contains("text/html"))throw new Invalid("Server nije vratio fajl karte.");
            long start=0;
            if(code==206){
                Matcher m=Pattern.compile("bytes ([0-9]+)-([0-9]+)/([0-9]+)").matcher(String.valueOf(c.getHeaderField("Content-Range")));
                if(!m.matches()||requested==0||Long.parseLong(m.group(1))!=requested||Long.parseLong(m.group(2))!=source.size-1||Long.parseLong(m.group(3))!=source.size)throw new Invalid("Server nije potvrdio nastavak karte. Pokušaj ponovo.");
                start=requested;
                String tag=c.getHeaderField("ETag");if(tag!=null&&!validator.equals(tag))throw new Invalid("Karta na serveru se promijenila. Pokušaj ponovo.");
            }else if(c.getHeaderField("Content-Range")!=null)throw new Invalid("Server je vratio samo dio karte.");
            if(c.getContentLengthLong()!=source.size-start)throw new Invalid("Veličina karte na serveru se promijenila. Osvježi dostupne karte.");
            String tag=c.getHeaderField("ETag");String nextValidator=tag!=null&&!tag.startsWith("W/")?tag:start>0?validator:"";
            try(InputStream in=c.getInputStream()){
                byte[] header=null;
                if(start==0){header=new byte[16];int pos=0,n;while(pos<16&&(n=in.read(header,pos,16-pos))>0)pos+=n;if(pos!=16)throw new EOFException();if(!Arrays.equals(header,"SQLite format 3\0".getBytes(StandardCharsets.US_ASCII)))throw new Invalid("Server nije vratio SQLite kartu.");}
                RandomAccessFile file;
                synchronized(this){
                    check(token);
                    // Clear the old binding BEFORE replacing its bytes. A process
                    // death must never pair a new ETag with an old partial file.
                    if(start==0&&!prefs.edit().putString("validator","").commit())throw new IOException("Ne mogu sačuvati nastavak karte");
                    file=new RandomAccessFile(target,"rw");
                    try{if(start==0)file.setLength(0);file.seek(start);if(header!=null){file.write(header);file.getFD().sync();}if(!prefs.edit().putString("validator",nextValidator).commit())throw new IOException("Ne mogu sačuvati nastavak karte");}
                    catch(Exception failed){file.close();throw failed;}
                }
                try(RandomAccessFile out=file){
                    byte[] buffer=new byte[65536];long written=start+(header==null?0:16),synced=System.currentTimeMillis();
                    while(written<source.size){
                        check(token);int n=in.read(buffer,0,(int)Math.min(buffer.length,source.size-written));if(n<0)throw new EOFException();if(n==0)continue;
                        synchronized(this){check(token);out.write(buffer,0,n);}written+=n;
                        if(System.currentTimeMillis()-synced>2000){out.getFD().sync();synced=System.currentTimeMillis();wake.acquire(10*60*1000L);}
                    }
                    out.getFD().sync();
                }
            }
            finish(token,"complete","");
        }catch(Invalid invalid){finish(token,"failed",invalid.getMessage());}
        catch(Exception interrupted){
            File parent=new File(prefs.getString("file",app.getFilesDir().getAbsolutePath())).getParentFile();
            if(parent!=null&&parent.isDirectory()&&parent.getUsableSpace()<65536)finish(token,"failed","Nema dovoljno prostora na telefonu.");
            else finish(token,"paused",network.available()?"Veza je prekinuta ili server čeka. Nastavak je automatski.":"Čekam vezu — nastavak je automatski.");
        }
        finally{if(c!=null)c.disconnect();if(wake.isHeld())wake.release();}
    }
    static HttpURLConnection open(String url,long offset,String validator) throws Exception {
        for(int i=0;i<6;i++){
            URL u=new URL(url);if(!MapDownloads.githubAllowed(u))throw new Invalid("Nepoznat izvor karte");
            HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(15000);c.setReadTimeout(30000);c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("Cache-Control","no-cache");c.setRequestProperty("User-Agent","DendroMap");
            if(offset>0){c.setRequestProperty("Range","bytes="+offset+"-");c.setRequestProperty("If-Range",validator);}
            try{int code=c.getResponseCode();if(code>=300&&code<400){String next=c.getHeaderField("Location");c.disconnect();if(next==null)throw new Invalid("Server nije vratio kartu");url=new URL(u,next).toString();continue;}return c;}
            catch(Exception failed){c.disconnect();throw failed;}
        }throw new Invalid("Previše preusmjeravanja za kartu");
    }
}
