package ba.spd.uss.vlake;

import android.app.DownloadManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.regex.*;

/** One verified public raster source. Android owns the transfer; JS only saves catalogue metadata. */
final class MapDownloads {
    static final String FILE_ID="1rVmI9heO_Y8eV-IrGkcGH3ajhEIZ-Kny";
    static final String NAME="Unsko_2021-2031.sqlitedb";
    static final long SIZE=1567670272L;
    static final String GITHUB_ID="github-karte-v1-0-0";
    static final String GITHUB_NAME="Unsko_2021-2031.mbtiles";
    static final long GITHUB_SIZE=1982578688L;
    static final String GITHUB_URL="https://github.com/pogonboskrupa/KARTE/releases/download/v1.0.0/KARTA_spd_GitHub.mbtiles";
    private final SharedPreferences prefs;
    private final OfflineMaps maps;
    private final File dir;
    private final Backend backend;
    private final long expectedSize;
    private final MapDownloadCatalog.Source source;
    private final java.util.concurrent.ExecutorService network=Executors.newSingleThreadExecutor();
    private long generation;
    private boolean resolving;
    static class SourceException extends IOException {
        final String code;
        SourceException(String code,String message){super(message);this.code=code;}
    }
    static final class DriveException extends SourceException {DriveException(String code,String message){super(code,message);}}
    interface ConnectionFactory {HttpURLConnection open(String url,boolean range) throws Exception;}
    interface Backend {
        String resolve() throws Exception;
        long enqueue(String url,File file) throws Exception;
        JSONObject query(long id) throws Exception;
        void remove(long id);
    }
    MapDownloads(Context c,OfflineMaps maps,MapDownloadCatalog.Source source,String storage){this(c,maps,source,new SystemBackend(c,source),storage);}
    // Package-private transport seam: instrumented tests use real SQLite files and WebView, without a 1.57 GB network transfer.
    MapDownloads(Context c,OfflineMaps maps,Backend backend,long size,String storage) throws Exception {
        this(c,maps,new MapDownloadCatalog.Source(FILE_ID,NAME,size),backend,storage);
    }
    MapDownloads(Context c,OfflineMaps maps,MapDownloadCatalog.Source source,Backend backend,String storage){
        this.maps=maps;this.backend=backend;this.source=source;expectedSize=source.size;
        prefs=c.getSharedPreferences(storage,Context.MODE_PRIVATE);
        dir=new File(c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),"offline-maps");
    }
    private File file(){String n=prefs.getString("file","");return n.matches("[a-f0-9-]{36}\\.sqlitedb")?new File(dir,n):null;}
    synchronized JSONObject status() throws Exception {
        String nativeId=prefs.getString("nativeId","");File f=file();
        if(!nativeId.isEmpty()){
            if(f==null||!f.isFile()||!maps.hasDocument(nativeId)){reset();return new JSONObject().put("state","idle");}
            return new JSONObject().put("state",prefs.getBoolean("installed",false)?"installed":"ready")
                .put("file",new JSONObject().put("name",source.name).put("size",expectedSize).put("nativeId",nativeId));
        }
        long id=prefs.getLong("id",-1);
        if(id<0)return new JSONObject().put("state",resolving?"resolving":prefs.getString("error","").isEmpty()?"idle":"failed").put("error",prefs.getString("error",""));
        JSONObject s=backend.query(id);
        if(s.optString("state").equals("complete")){
            try{
                validate(f,expectedSize,!source.id.equals(GITHUB_ID));
                JSONObject descriptor=maps.registerDownload(f,source.name);
                if(!prefs.edit().putString("nativeId",descriptor.getString("nativeId")).putBoolean("installed",false).commit()){
                    maps.discardDownload(descriptor.getString("nativeId"));throw new IOException("Ne mogu sačuvati kartu");
                }
                return new JSONObject().put("state","ready").put("file",descriptor);
            }catch(Exception e){backend.remove(id);if(f!=null)f.delete();prefs.edit().remove("id").putString("error",e instanceof SourceException?e.getMessage():"Preuzeta karta nije potpuna ili ispravna. Pokušaj ponovo.").commit();return status();}
        }
        return s;
    }
    synchronized JSONObject start() throws Exception {
        JSONObject current=status();String state=current.optString("state");
        if(!state.equals("idle")&&!state.equals("failed"))return current;
        reset();if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("Nema pristupa prostoru za kartu");
        if(dir.getUsableSpace()<expectedSize+64L*1024*1024)throw new IOException("Oslobodi najmanje "+String.format(Locale.ROOT,"%.2f",(expectedSize+64L*1024*1024)/1e9)+" GB za kartu");
        String name=UUID.randomUUID()+".sqlitedb";
        if(!prefs.edit().putString("file",name).remove("error").commit())throw new IOException("Ne mogu sačuvati preuzimanje");
        resolving=true;final long token=++generation;final File target=new File(dir,name);
        network.execute(()->{
            try{
                String url=backend.resolve();
                synchronized(this){if(token!=generation)return;long id=backend.enqueue(url,target);
                    if(!prefs.edit().putLong("id",id).commit()){backend.remove(id);throw new IOException("Ne mogu sačuvati preuzimanje");}resolving=false;}
            }catch(Exception e){synchronized(this){if(token!=generation)return;resolving=false;
                prefs.edit().putString("error",e instanceof SourceException?e.getMessage():"Preuzimanje nije započelo. Provjeri internet i pokušaj ponovo.").commit();}}
        });
        return new JSONObject().put("state","resolving");
    }
    synchronized JSONObject cancel() throws Exception {reset();return new JSONObject().put("state","idle");}
    synchronized JSONObject installed(String nativeId) throws Exception {
        if(!nativeId.equals(prefs.getString("nativeId","")))throw new IOException("Karta više nije dostupna");
        if(!prefs.edit().putBoolean("installed",true).commit())throw new IOException("Ne mogu sačuvati status karte");return status();
    }
    private void reset() throws Exception {
        generation++;resolving=false;long id=prefs.getLong("id",-1);if(id>=0)backend.remove(id);
        String nativeId=prefs.getString("nativeId","");if(!nativeId.isEmpty()&&maps.hasDocument(nativeId))maps.discardDownload(nativeId);
        File f=file();if(f!=null)f.delete();prefs.edit().clear().commit();
    }
    static void validate(File f,long expected) throws Exception {validate(f,expected,true);}
    private static void validate(File f,long expected,boolean drive) throws Exception {
        if(f==null||!f.isFile())throw new IOException("Nepotpuna karta");
        // Older queued jobs can complete with Google's tiny quota/access HTML page.
        if(f.length()>0&&f.length()<=262144)try(InputStream in=new FileInputStream(f)){
            byte[] h=new byte[(int)f.length()];int n=in.read(h);
            String text=new String(h,0,Math.max(0,n),StandardCharsets.UTF_8).trim();
            if(text.startsWith("<"))throw drive?driveError(text):new SourceException("invalid_source","GitHub nije vratio fajl karte. Pokušaj ponovo kasnije.");
        }
        if(f.length()!=expected)throw new IOException("Nepotpuna karta");
        try(InputStream in=new FileInputStream(f)){byte[] h=new byte[16];int p=0,n;while(p<16&&(n=in.read(h,p,16-p))>0)p+=n;
            if(p!=16||!Arrays.equals(h,"SQLite format 3\0".getBytes(StandardCharsets.US_ASCII)))throw new IOException("Preuzet je pogrešan fajl");}
    }
    private static final class SystemBackend implements Backend {
        private final DownloadManager manager;private final MapDownloadCatalog.Source source;SystemBackend(Context c,MapDownloadCatalog.Source source){this.source=source;manager=(DownloadManager)c.getSystemService(Context.DOWNLOAD_SERVICE);}
        public String resolve() throws Exception {return source.id.equals(GITHUB_ID)?resolveGithub(source.size,MapDownloads::githubConnection):resolveDrive(source.id,source.size);}
        public long enqueue(String url,File file){return manager.enqueue(new DownloadManager.Request(Uri.parse(url))
            .setTitle("Dendro Map · "+source.name).setDescription("Offline karta — preuzimanje")
            .setDestinationUri(Uri.fromFile(file)).setMimeType("application/octet-stream")
            .addRequestHeader("Accept-Encoding","identity").addRequestHeader("Cache-Control","no-cache")
            .setAllowedOverMetered(true).setAllowedOverRoaming(false).setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN));}
        public JSONObject query(long id) throws Exception {
            try(Cursor c=manager.query(new DownloadManager.Query().setFilterById(id))){
                if(c==null||!c.moveToFirst())return new JSONObject().put("state","failed").put("error","Preuzimanje je uklonjeno. Pokušaj ponovo.");
                int state=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                int reason=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                String name=state==DownloadManager.STATUS_SUCCESSFUL?"complete":state==DownloadManager.STATUS_FAILED?"failed":state==DownloadManager.STATUS_PAUSED?"paused":"downloading";
                String error=reason==DownloadManager.ERROR_INSUFFICIENT_SPACE?"Nema dovoljno prostora na telefonu.":"Preuzimanje nije uspjelo. Provjeri internet i pokušaj ponovo.";
                return new JSONObject().put("state",name).put("bytes",c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)))
                    .put("total",c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))).put("error",state==DownloadManager.STATUS_FAILED?error:"");
            }
        }
        public void remove(long id){manager.remove(id);}
    }
    static boolean allowed(URL u){String h=u.getHost().toLowerCase(Locale.ROOT);return u.getProtocol().equals("https")&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null&&(h.equals("drive.google.com")||h.equals("drive.usercontent.google.com")||h.endsWith(".googleusercontent.com"));}
    static boolean githubAllowed(URL u){return u.getProtocol().equals("https")&&(u.getPort()==-1||u.getPort()==443)&&u.getUserInfo()==null&&(u.getHost().equalsIgnoreCase("github.com")&&u.getPath().equals("/pogonboskrupa/KARTE/releases/download/v1.0.0/KARTA_spd_GitHub.mbtiles")||u.getHost().equalsIgnoreCase("release-assets.githubusercontent.com"));}
    static HttpURLConnection githubConnection(String url,boolean range) throws Exception {
        for(int i=0;i<6;i++){
            URL u=new URL(url);if(!githubAllowed(u))throw new SourceException("unknown_source","Nepoznat GitHub izvor karte");
            HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Accept-Encoding","identity");c.setRequestProperty("Cache-Control","no-cache");c.setRequestProperty("User-Agent","AndroidDownloadManager");
            int status=c.getResponseCode();
            if(status>=300&&status<400){String next=c.getHeaderField("Location");c.disconnect();if(next==null)throw new SourceException("missing_source","GitHub nije vratio fajl karte");url=new URL(u,next).toString();continue;}
            if(status!=200&&status!=206){c.disconnect();throw new SourceException("github_access",status==429?"GitHub je privremeno ograničio pristup. Pokušaj kasnije.":"GitHub karta trenutno nije dostupna. Provjeri internet i pokušaj ponovo.");}
            return c;
        }throw new SourceException("redirects","Previše preusmjeravanja za GitHub kartu");
    }
    static String resolveGithub(long expected,ConnectionFactory transport) throws Exception {
        HttpURLConnection c=transport.open(GITHUB_URL,false);
        try{
            if(c.getResponseCode()!=200||c.getHeaderField("Content-Range")!=null)throw new SourceException("partial_response","GitHub je vratio samo dio karte. Pokušaj ponovo.");
            if(String.valueOf(c.getContentType()).toLowerCase(Locale.ROOT).contains("text/html"))throw new SourceException("invalid_source","GitHub nije vratio fajl karte. Pokušaj kasnije.");
            if(c.getContentLengthLong()!=expected)throw new SourceException("source_changed","Veličina GitHub karte se promijenila. Provjeri novu verziju aplikacije.");
            try(InputStream in=c.getInputStream()){
                byte[] h=new byte[16];int p=0,n;while(p<16&&(n=in.read(h,p,16-p))>0)p+=n;
                if(p!=16||!Arrays.equals(h,"SQLite format 3\0".getBytes(StandardCharsets.US_ASCII)))throw new SourceException("invalid_source","GitHub nije vratio ispravnu SQLite kartu.");
            }
            // Keep the public URL: its temporary CDN signature must be renewed after a long pause.
            return GITHUB_URL;
        }finally{c.disconnect();}
    }
    static HttpURLConnection connection(String url,boolean range) throws Exception {
        for(int i=0;i<6;i++){
            URL u=new URL(url);if(!allowed(u))throw new IOException("Nepoznat izvor karte");
            HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(false);c.setRequestProperty("Cache-Control","no-cache");
            if(range)c.setRequestProperty("Range","bytes=0-15");c.setRequestProperty("Accept-Encoding","identity");
            int code=c.getResponseCode();if(code>=300&&code<400){String location=c.getHeaderField("Location");c.disconnect();if(location==null)throw new IOException("Nedostaje izvor karte");url=new URL(u,location).toString();continue;}
            if(code!=200&&code!=206){
                try{if(code==429)throw driveError("quota exceeded");if(String.valueOf(c.getContentType()).contains("text/html"))throw driveError(readHtml(c));throw new IOException("Izvor karte nije dostupan");}
                finally{c.disconnect();}
            }return c;
        }throw new IOException("Previše preusmjeravanja");
    }
    static String confirmation(String html) throws Exception {return confirmation(html,FILE_ID);}
    static String confirmation(String html,String fileId) throws Exception {
        Matcher form=Pattern.compile("(?is)<form\\b([^>]*)>(.*?)</form>").matcher(html);
        while(form.find()){
            Map<String,String> a=attributes(form.group(1));String action=a.get("action");if(action==null)continue;
            URL url=new URL(action);if(!url.getHost().equals("drive.usercontent.google.com")||!allowed(url)||!url.getPath().equals("/download")||!"get".equalsIgnoreCase(a.getOrDefault("method","get")))continue;
            Map<String,String> values=new LinkedHashMap<>();Matcher input=Pattern.compile("(?is)<input\\b([^>]*)>").matcher(form.group(2));
            while(input.find()){Map<String,String> p=attributes(input.group(1));String name=p.get("name");if(Arrays.asList("id","export","confirm","uuid").contains(name))values.put(name,p.getOrDefault("value",""));}
            if(!fileId.equals(values.get("id"))||!"download".equals(values.get("export"))||!values.containsKey("confirm"))continue;
            Uri.Builder b=Uri.parse(action).buildUpon();for(Map.Entry<String,String> e:values.entrySet())b.appendQueryParameter(e.getKey(),e.getValue());return b.build().toString();
        }throw new IOException("Izvor nije potvrdio preuzimanje karte");
    }
    private static Map<String,String> attributes(String text){Map<String,String> out=new HashMap<>();Matcher m=Pattern.compile("([\\w-]+)\\s*=\\s*(['\"])(.*?)\\2",Pattern.DOTALL).matcher(text);while(m.find())out.put(m.group(1).toLowerCase(Locale.ROOT),m.group(3).replace("&amp;","&").replace("&quot;","\""));return out;}
    private static String resolveDrive(String fileId,long expectedSize) throws Exception {return resolveDrive(fileId,expectedSize,MapDownloads::connection);}
    static String resolveDrive(String fileId,long expectedSize,ConnectionFactory transport) throws Exception {
        String download="https://drive.google.com/uc?export=download&id="+fileId;
        for(int attempt=0;attempt<3;attempt++){
            // A Range probe can succeed while a full GET returns quota HTML.
            // Check the SAME request shape as DownloadManager, reading only 16 bytes.
            HttpURLConnection c=transport.open(download,false);
            try{
                if(String.valueOf(c.getContentType()).toLowerCase(Locale.ROOT).contains("text/html")){
                    String html=readHtml(c);String lower=html.toLowerCase(Locale.ROOT);
                    if(lower.contains("quota exceeded")||lower.contains("too many users")||lower.contains("downloadquotaexceeded"))throw driveError(html);
                    try{download=confirmation(html,fileId);}catch(Exception unavailable){throw driveError(html);}
                    continue;
                }
                if(c.getResponseCode()!=200||c.getHeaderField("Content-Range")!=null)throw new DriveException("partial_response","Drive je vratio samo dio fajla. Pokušaj ponovo kasnije.");
                long total=c.getContentLengthLong();if(total>=0&&total!=expectedSize)throw new DriveException("source_changed","Veličina karte na Driveu se promijenila. Osvježi dostupne karte pa pokušaj ponovo.");
                try(InputStream in=c.getInputStream()){byte[] h=new byte[16];int p=0,n;while(p<16&&(n=in.read(h,p,16-p))>0)p+=n;if(p!=16||!Arrays.equals(h,"SQLite format 3\0".getBytes(StandardCharsets.US_ASCII)))throw new DriveException("invalid_source","Drive nije vratio SQLite kartu. Provjeri izvorni fajl.");}
                return c.getURL().toString();
            }finally{c.disconnect();}
        }
        throw new DriveException("confirmation","Drive nije završio potvrdu preuzimanja. Pokušaj ponovo kasnije.");
    }
    static String readHtml(HttpURLConnection c) throws Exception {
        InputStream stream=c.getResponseCode()>=400?c.getErrorStream():c.getInputStream();if(stream==null)return "";
        try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))>0){if(out.size()+n>262144)throw new IOException("Odgovor izvora je prevelik");out.write(buffer,0,n);}return out.toString("UTF-8");
        }
    }
    static DriveException driveError(String html){
        String text=html.toLowerCase(Locale.ROOT);
        if(text.contains("quota exceeded")||text.contains("too many users")||text.contains("downloadquotaexceeded"))
            return new DriveException("drive_quota","Google Drive je privremeno ograničio preuzimanje ove karte zbog velikog broja pristupa. Pokušaj kasnije; Google navodi da ograničenje može trajati do 24 sata.");
        return new DriveException("drive_access","Google Drive nije omogućio preuzimanje. Provjeri javni pristup fajlu i dozvolu za preuzimanje.");
    }
}
