package ba.spd.uss.vlake;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.regex.*;

/** Published GitHub raster assets; existing Drive jobs stay resumable. */
final class MapDownloadCatalog {
    private static MapDownloadCatalog instance;
    private Context notificationContext;
    static synchronized MapDownloadCatalog shared(Context c,OfflineMaps maps) throws Exception {
        if(instance==null)instance=new MapDownloadCatalog(c,maps==null?new OfflineMaps(c):maps);
        return instance;
    }
    static final String FOLDER_ID="1iOjb0jeu6IYAx9XG-w8UfDeaZ-Bpm2H0";
    static final class Source {
        final String id,name,url,release;final long size;
        Source(String id,String name,long size) throws IOException {
            this(id,name,size,MapDownloads.GITHUB_ID.equals(id)?MapDownloads.GITHUB_URL:"","");
        }
        Source(String id,String name,long size,String url,String release) throws IOException {
            if(id==null||!id.matches("[\\w-]{10,100}")||name==null||name.length()>240||name.matches("(?s).*[\\p{Cntrl}/\\\\].*")||!name.toLowerCase(Locale.ROOT).matches(".*\\.(mbtiles|sqlitedb|sqlite|db|gpkg)")||size<16||size>64L*1024*1024*1024)throw new IOException("Nevažeća karta u folderu");
            boolean github=MapDownloads.GITHUB_ID.equals(id)||id.matches("github-asset-[1-9][0-9]{0,18}");
            if(url==null||release==null||release.length()>240||release.matches("(?s).*[\\p{Cntrl}].*")||github!=(!url.isEmpty())||(!url.isEmpty()&&!MapDownloads.githubAssetURL(new URL(url))))throw new IOException("Nevažeći izvor karte");
            this.id=id;this.name=name;this.size=size;this.url=url;this.release=release;
        }
        boolean isGithub(){return !url.isEmpty();}
        static Source fromJSON(JSONObject o) throws Exception {String id=o.getString("id");return new Source(id,o.getString("name"),o.getLong("size"),o.optString("url",MapDownloads.GITHUB_ID.equals(id)?MapDownloads.GITHUB_URL:""),o.optString("release",""));}
        JSONObject json() throws Exception {return new JSONObject().put("id",id).put("name",name).put("size",size).put("url",url).put("release",release).put("provider",isGithub()?"GitHub":"Google Drive");}
    }
    interface Provider {List<Source> fetch() throws Exception;}
    interface Factory {MapDownloads create(Source source) throws Exception;}
    private final SharedPreferences prefs;
    private final Provider provider;
    private final Factory factory;
    private volatile List<Source> catalog;
    private final Map<String,MapDownloads> jobs=new HashMap<>();
    private final java.util.concurrent.ExecutorService commands=Executors.newFixedThreadPool(2);
    MapDownloadCatalog(Context c,OfflineMaps maps) throws Exception {
        this(c.getApplicationContext(),MapDownloadCatalog::fetchGithub,productionFactory(c.getApplicationContext(),maps),"drive-map-catalog-v1");
        // Never fetch on activity/service construction. Cached sources work offline;
        // a fresh install can display the known public map before its first refresh.
        if(catalog.stream().noneMatch(Source::isGithub))catalog=Collections.singletonList(new Source(MapDownloads.GITHUB_ID,MapDownloads.GITHUB_NAME,MapDownloads.GITHUB_SIZE));
        notificationContext=c.getApplicationContext();
        // v2.5.1 transfers remain resumable even though the source folder has changed.
        if(c.getSharedPreferences("unsko-download-v1",Context.MODE_PRIVATE).contains("file"))remember(new Source(MapDownloads.FILE_ID,MapDownloads.NAME,MapDownloads.SIZE));
    }
    private static Factory productionFactory(Context app,OfflineMaps maps){
        return source->new MapDownloads(app,maps,source,source.id.equals(MapDownloads.FILE_ID)?"unsko-download-v1":"drive-map-"+source.id);
    }
    MapDownloadCatalog(Context c,Provider provider,Factory factory,String storage) throws Exception {
        prefs=c.getSharedPreferences(storage,Context.MODE_PRIVATE);this.provider=provider;this.factory=factory;
        try{catalog=decode(prefs.getString("catalog","[]"));}catch(Exception corruptCache){catalog=new ArrayList<>();}
    }
    private static List<Source> decode(String raw) throws Exception {List<Source> out=new ArrayList<>();JSONArray a=new JSONArray(raw);if(a.length()>300)throw new IOException("Popis karata je prevelik");for(int i=0;i<a.length();i++)out.add(Source.fromJSON(a.getJSONObject(i)));return out;}
    private static JSONArray encode(List<Source> files) throws Exception {JSONArray a=new JSONArray();for(Source s:files)a.put(s.json());return a;}
    JSONObject list(boolean refresh) throws Exception {
        String error="";
        if(refresh)try{List<Source> files=provider.fetch();if(!prefs.edit().putString("catalog",encode(files).toString()).putLong("updated",System.currentTimeMillis()).commit())throw new IOException();catalog=files;}
        catch(Exception e){error="GitHub popis trenutno nije dostupan. Prikazujem sačuvane karte; pokušaj osvježiti kasnije.";}
        return new JSONObject().put("ok",error.isEmpty()||!catalog.isEmpty()).put("files",encode(catalog)).put("stale",!error.isEmpty()).put("error",error).put("updated",prefs.getLong("updated",0));
    }
    private synchronized void remember(Source source) throws Exception {JSONObject all=new JSONObject(prefs.getString("jobs","{}"));all.put(source.id,source.json());if(!prefs.edit().putString("jobs",all.toString()).commit())throw new IOException("Ne mogu sačuvati posao preuzimanja");}
    private synchronized MapDownloads job(Source source) throws Exception {MapDownloads j=jobs.get(source.id);if(j==null){j=factory.create(source);jobs.put(source.id,j);}return j;}
    private Source activeSource(String id) throws Exception {JSONObject s=new JSONObject(prefs.getString("jobs","{}")).optJSONObject(id);if(s==null)throw new IOException("Karta nema pokrenuto preuzimanje");return Source.fromJSON(s);}
    JSONObject statuses() throws Exception {
        JSONObject all=new JSONObject(prefs.getString("jobs","{}"));JSONArray out=new JSONArray();
        for(Iterator<String> keys=all.keys();keys.hasNext();){String id=keys.next();Source source=activeSource(id);JSONObject state=job(source).status();
            boolean listed=catalog.stream().anyMatch(s->s.id.equals(id));
            if(!listed&&state.optString("state").equals("failed"))state=job(source).cancel();
            // Always reconcile terminal states, including jobs whose source disappeared from the folder.
            // The UI hides inactive unlisted jobs; omission would leave their old progress polling forever.
            out.put(source.json().put("status",state));
        }
        if(notificationContext!=null&&!MapDownloadService.isRunning())for(int i=0;i<out.length();i++)if(MapDownloadService.isActive(out.getJSONObject(i).getJSONObject("status").optString("state"))){MapDownloadService.ensure(notificationContext);break;}
        return new JSONObject().put("ok",true).put("files",out);
    }
    JSONObject action(JSONObject msg) throws Exception {
        String type=msg.getString("type");if(type.equals("notice")){boolean open=MapDownloadService.openRequested;MapDownloadService.openRequested=false;return new JSONObject().put("ok",true).put("open",open);}
        if(type.equals("list"))return list(msg.optBoolean("refresh"));if(type.equals("statuses"))return statuses();
        String id=msg.getString("sourceId");MapDownloads j;
        if(type.equals("start")){
            Source source=null;for(Source s:catalog)if(s.id.equals(id))source=s;
            if(source==null)throw new IOException("Karta nije u katalogu dostupnih karata. Osvježi popis.");
            // Existing jobs use their original immutable size/name until removed. Never reinterpret a partial file after a Drive edit.
            JSONObject all=new JSONObject(prefs.getString("jobs","{}"));Source saved=all.has(id)?activeSource(id):source;
            j=job(saved);String state=j.status().optString("state");
            if((state.equals("idle")||state.equals("failed"))&&(!saved.name.equals(source.name)||saved.size!=source.size||!saved.url.equals(source.url))){
                synchronized(this){jobs.remove(id);}saved=source;j=job(saved);
            }
            remember(saved);JSONObject started=j.start().put("ok",true);if(notificationContext!=null&&MapDownloadService.isActive(started.optString("state")))MapDownloadService.ensure(notificationContext);return started;
        }
        j=job(activeSource(id));JSONObject result;
        if(type.equals("cancel"))result=j.cancel();else if(type.equals("installed"))result=j.installed(msg.getString("nativeId"));else throw new IOException("Nepoznata radnja preuzimanja");return result.put("ok",true);
    }
    static List<Source> parseGithub(JSONArray releases) throws Exception {
        List<Source> out=new ArrayList<>();Set<String> ids=new HashSet<>();
        for(int i=0;i<releases.length();i++){
            JSONObject r=releases.getJSONObject(i);if(r.optBoolean("draft"))continue;
            String tag=r.getString("tag_name"),title=r.optString("name",tag);if(title.isEmpty())title=tag;
            JSONArray assets=r.getJSONArray("assets");
            for(int k=0;k<assets.length();k++){
                JSONObject a=assets.getJSONObject(k);String name=a.getString("name");
                if(!name.toLowerCase(Locale.ROOT).matches(".*\\.(mbtiles|sqlitedb|sqlite|db|gpkg)")||!"uploaded".equals(a.optString("state","uploaded")))continue;
                long asset=a.getLong("id");if(asset<=0)throw new IOException("Nevažeći GitHub asset");
                String url=a.getString("browser_download_url"),id="github-asset-"+asset;
                if(MapDownloads.GITHUB_URL.equals(url)){id=MapDownloads.GITHUB_ID;name=MapDownloads.GITHUB_NAME;}
                else if(tag.equals("stara_verzija"))name="Unsko_2010-2020"+(assets.length()>1?" · "+name.substring(0,name.lastIndexOf('.')):"")+name.substring(name.lastIndexOf('.'));
                Source s=new Source(id,name,a.getLong("size"),url,title);if(ids.add(id))out.add(s);
                if(out.size()>300)throw new IOException("Popis karata je prevelik");
            }
        }
        // Current period first, old period next; generic future maps retain API order.
        out.sort(Comparator.comparingInt(s->s.id.equals(MapDownloads.GITHUB_ID)?0:s.name.startsWith("Unsko_2010-2020")?1:2));return out;
    }
    private static List<Source> fetchGithub() throws Exception { return parseGithub(fetchGithubReleases()); }
    static JSONArray fetchGithubReleases() throws Exception {
        JSONArray releases=new JSONArray();long deadline=System.currentTimeMillis()+45000;
        for(int page=1;page<=3;page++){
            if(System.currentTimeMillis()>=deadline)throw new IOException("GitHub katalog nije odgovorio");
            HttpURLConnection c=(HttpURLConnection)new URL("https://api.github.com/repos/pogonboskrupa/KARTE/releases?per_page=100&page="+page).openConnection();
            int timeout=(int)Math.min(10000,Math.max(1,(deadline-System.currentTimeMillis())/2));
            c.setConnectTimeout(timeout);c.setReadTimeout(timeout);c.setInstanceFollowRedirects(false);c.setRequestProperty("Accept","application/vnd.github+json");c.setRequestProperty("User-Agent","DendroMap");
            try{
                if(c.getResponseCode()!=200)throw new IOException("GitHub katalog nije dostupan");
                try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                    byte[] b=new byte[8192];int n;while((n=in.read(b))>0){if(System.currentTimeMillis()>=deadline)throw new IOException("GitHub katalog nije odgovorio");if(out.size()+n>4*1024*1024)throw new IOException("Pregled karata je prevelik");out.write(b,0,n);}
                    JSONArray rows=new JSONArray(out.toString("UTF-8"));for(int i=0;i<rows.length();i++)releases.put(rows.getJSONObject(i));
                }
                if(!String.valueOf(c.getHeaderField("Link")).contains("rel=\"next\""))return releases;
            }finally{c.disconnect();}
        }
        throw new IOException("GitHub katalog nije potpun");
    }
    final class Bridge {
        private final WebView view;private final MapHttpTransfer.Network network;
        Bridge(WebView view){this(view,()->MapHttpTransfer.hasNetwork(view.getContext()));}
        Bridge(WebView view,MapHttpTransfer.Network network){this.view=view;this.network=network;}
        @JavascriptInterface public boolean networkAvailable(){return network.available();}
        @JavascriptInterface public boolean notificationsEnabled(){
            if(notificationContext==null)return true;
            if(!androidx.core.app.NotificationManagerCompat.from(notificationContext).areNotificationsEnabled())return false;
            if(android.os.Build.VERSION.SDK_INT>=26){android.app.NotificationChannel c=notificationContext.getSystemService(android.app.NotificationManager.class).getNotificationChannel(MapDownloadService.CHANNEL);if(c!=null&&c.getImportance()==android.app.NotificationManager.IMPORTANCE_NONE)return false;}
            return true;
        }
        @JavascriptInterface public void notificationSettings(){
            if(notificationContext==null)return;
            try{android.content.Intent i=new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,notificationContext.getPackageName()).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);notificationContext.startActivity(i);}catch(RuntimeException ignored){}
        }
        @JavascriptInterface public void request(long id,String raw){commands.execute(()->{
            JSONObject result;try{result=action(new JSONObject(raw));}catch(Exception e){result=new JSONObject();try{result.put("ok",false).put("error",e.getMessage());}catch(Exception ignored){}}
            final String text=result.toString();view.post(()->view.evaluateJavascript("window.MapDownloads&&MapDownloads.reply("+id+","+text+")",null));
        });}
    }
    static List<Source> parse(String html) throws Exception {
        JSONArray rows=folderRows(html);
        return parseRows(rows);
    }
    static JSONArray folderRows(String html) throws Exception {
        // Decode a JSON payload, never execute Google's script or file names.
        Matcher m=Pattern.compile("_DRIVE_ivd(?:['\"]\\]|\\s*)\\s*=\\s*'((?:\\\\.|[^'\\\\])*)'",Pattern.DOTALL).matcher(html);
        if(!m.find())throw new IOException("Nije dostupan javni pregled foldera");
        JSONArray data=new JSONArray(unescape(m.group(1)));if(data.length()<1||!(data.get(0) instanceof JSONArray))throw new IOException("Nepoznat pregled foldera");
        if(data.length()>1&&!data.isNull(1))throw new IOException("Google nije vratio cijeli popis karata");
        JSONArray rows=data.getJSONArray(0);if(rows.length()>300)throw new IOException("Popis karata je prevelik");
        return rows;
    }
    private static List<Source> parseRows(JSONArray rows) throws Exception {
        List<Source> out=new ArrayList<>();Set<String> ids=new HashSet<>();
        for(int i=0;i<rows.length();i++){
            JSONArray row=rows.getJSONArray(i);if(row.length()<14)throw new IOException("Nepotpun pregled karte");
            JSONArray parents=row.optJSONArray(1);boolean own=false;if(parents!=null)for(int k=0;k<parents.length();k++)if(FOLDER_ID.equals(parents.optString(k)))own=true;
            String name=row.optString(2);if(row.optString(3).startsWith("application/vnd.google-apps."))continue;if(!own||!name.toLowerCase(Locale.ROOT).matches(".*\\.(mbtiles|sqlitedb|sqlite|db|gpkg)"))continue;
            Source s=new Source(row.getString(0),name,row.getLong(13));if(ids.add(s.id))out.add(s);
        }
        out.sort(Comparator.comparing(s->s.name.toLowerCase(Locale.ROOT)));return out;
    }
    private static String unescape(String s) throws Exception {
        StringBuilder out=new StringBuilder();for(int i=0;i<s.length();i++){
            char c=s.charAt(i);if(c!='\\'){out.append(c);continue;}if(++i>=s.length())throw new IOException("Nepotpuni podaci foldera");c=s.charAt(i);
            if(c=='x'||c=='u'){int len=c=='x'?2:4;if(i+len>=s.length())throw new IOException("Nepotpuni podaci foldera");out.append((char)Integer.parseInt(s.substring(i+1,i+len+1),16));i+=len;}
            else if(c=='\\'||c=='\''||c=='"'||c=='/')out.append(c);
            else if(c=='n')out.append('\n');else if(c=='r')out.append('\r');else if(c=='t')out.append('\t');else if(c=='b')out.append('\b');else if(c=='f')out.append('\f');else throw new IOException("Nepoznat zapis foldera");
        }return out.toString();
    }
    private static List<Source> fetchFolder() throws Exception {return parseRows(fetchFolderRows());}
    static JSONArray fetchFolderRows() throws Exception {
        String url="https://drive.google.com/drive/folders/"+FOLDER_ID+"?hl=en&catalog="+System.currentTimeMillis();HttpURLConnection c=MapDownloads.connection(url,false);
        try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))>0){if(out.size()+n>4*1024*1024)throw new IOException("Pregled foldera je prevelik");out.write(b,0,n);}return folderRows(out.toString("UTF-8"));
        }finally{c.disconnect();}
    }
}
