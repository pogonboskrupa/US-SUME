package ba.spd.uss.vlake;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** One silent notification for native mobile transfers and legacy system downloads. */
public final class MapDownloadService extends Service {
    static final String CHANNEL="offline-map-downloads-v1";
    static final int NOTICE=2540;
    private static volatile boolean running;
    static volatile boolean openRequested;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    private final Set<String> watched=new HashSet<>();
    private String last="";
    private volatile int lastStartId;
    static boolean isRunning(){return running;}
    static void ensure(Context c) {
        try { Intent i=new Intent(c,MapDownloadService.class);
            if(Build.VERSION.SDK_INT>=26)c.startForegroundService(i);else c.startService(i);
        } catch(RuntimeException unavailable) { /* Transfer survives; in-app progress remains available. */ }
    }
    @Override public void onCreate(){
        super.onCreate();running=true;
        Notification n=notice(this,new JSONArray(),true);
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTICE,n);
        worker.scheduleWithFixedDelay(this::tick,0,3,TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent i,int flags,int id){lastStartId=id;return START_STICKY;}
    @Override public IBinder onBind(Intent i){return null;}
    @Override public void onDestroy(){running=false;worker.shutdownNow();super.onDestroy();}
    private void tick(){
        try {
            int startId=lastStartId;
            JSONArray rows=MapDownloadCatalog.shared(this,null).statuses().getJSONArray("files"),visible=new JSONArray();boolean active=false;boolean restoring=watched.isEmpty();
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.getJSONObject(i);String id=row.getString("id"),state=row.getJSONObject("status").optString("state");
                if(isActive(state)){watched.add(id);active=true;}
                if(restoring&&(state.equals("ready")||state.equals("failed")))watched.add(id);
                if(watched.contains(id)&&!state.equals("idle"))visible.put(row);
            }
            String next=visible.toString();
            if(active){
                if(!next.equals(last)){getSystemService(NotificationManager.class).notify(NOTICE,notice(this,visible,true));last=next;}
            }else if(startId>0){
                // Detach BEFORE stopping: stopSelfResult may destroy the service and
                // cancel its foreground notification before a worker can detach it.
                // Serialize with onStartCommand so a newer download keeps its service.
                final Notification finished=visible.length()==0?null:notice(this,visible,false);
                new Handler(Looper.getMainLooper()).post(()->{
                    if(startId!=lastStartId)return;
                    // Android strips the foreground flag asynchronously using
                    // ServiceRecord's last foreground notification. Update that
                    // snapshot first: otherwise a stale "Čekam internet" can
                    // overwrite the completion notice after notify() returns.
                    if(finished!=null){
                        if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,finished,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTICE,finished);
                    }
                    stopForeground(finished==null?STOP_FOREGROUND_REMOVE:STOP_FOREGROUND_DETACH);
                    if(finished!=null)getSystemService(NotificationManager.class).notify(NOTICE,finished);
                    stopSelfResult(startId);
                });
            }
        } catch(Exception e) { // A temporary query failure must not cancel the downloaded bytes.
            getSystemService(NotificationManager.class).notify(NOTICE,notice(this,new JSONArray(),true));
        }
    }
    static boolean isActive(String s){return s.equals("resolving")||s.equals("downloading")||s.equals("paused");}
    static Notification notice(Context c,JSONArray rows,boolean ongoing){
        NotificationManager nm=c.getSystemService(NotificationManager.class);
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Preuzimanje offline karata",NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Tihi napredak skidanja karata, bez ponavljanja zvuka i vibracije");
            channel.setSound(null,null);channel.enableVibration(false);channel.setShowBadge(false);nm.createNotificationChannel(channel);
        }
        int active=0,ready=0,failed=0;long bytes=0,total=0;String name="",state="",pause="";List<String> lines=new ArrayList<>();
        for(int i=0;i<rows.length();i++)try{
            JSONObject row=rows.getJSONObject(i),s=row.getJSONObject("status");String st=s.optString("state");
            if(isActive(st)){active++;state=st;pause=s.optString("message","");name=row.optString("name");long max=s.optLong("total",row.optLong("size"));if(max<=0)max=row.optLong("size");total+=Math.max(0,max);bytes+=Math.max(0,Math.min(s.optLong("bytes"),max));}
            else if(st.equals("failed"))failed++;else if(st.equals("ready")||st.equals("installed"))ready++;
            lines.add(row.optString("name")+" · "+(st.equals("paused")?s.optString("message","Čekam vezu"):st.equals("resolving")?"Pripremam":st.equals("failed")?"Prekinuto — pokušaj ponovo":isActive(st)?format(s.optLong("bytes"))+" / "+format(row.optLong("size")):"Preuzeta"));
        }catch(JSONException ignored){}
        int percent=total>0?(int)Math.min(100,bytes*100.0/total):0;
        String title=ongoing?(active==1?name:"Preuzimanje karata" ):failed>0?"Preuzimanje traži pažnju":"Karta je preuzeta";
        String body=ongoing?(state.equals("paused")&&active==1?(pause.isEmpty()?"Čekam internet — nastavak je automatski":pause):active==0||state.equals("resolving")&&active==1?"Pripremam preuzimanje…":percent+"% · "+format(bytes)+" / "+format(total)):
            failed>0?failed+" prekinuto · "+ready+" preuzeto. Otvori pregled karata.":"Otvori aplikaciju da se karta doda u Moje karte.";
        Intent open=new Intent(c,MainActivity.class).setAction("ba.spd.uss.vlake.OPEN_MAP_DOWNLOADS").setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap=PendingIntent.getActivity(c,NOTICE,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b=new NotificationCompat.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_map_download)
            .setContentTitle(title).setContentText(body).setContentIntent(tap).setOngoing(ongoing).setAutoCancel(!ongoing)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setOnlyAlertOnce(true).setSilent(true).setShowWhen(false).setPriority(NotificationCompat.PRIORITY_LOW)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body+(lines.isEmpty()?"":"\n"+String.join("\n",lines.subList(0,Math.min(lines.size(),5))))));
        if(ongoing)b.setProgress(100,percent,total==0||state.equals("resolving")&&active==1);
        return b.build();
    }
    private static String format(long b){return String.format(Locale.ROOT,b>=1_000_000_000?"%.2f GB":"%.1f MB",Math.max(0,b)/(b>=1_000_000_000?1e9:1e6));}
}
