// lib/core/constants.dart

class AppConstants {
  // ============================================================
  // Supabase — zamijeni sa tvojim URL-om i anon keyom
  // Nađi na: https://app.supabase.com → Settings → API
  // ============================================================
  static const supabaseUrl = 'https://TVOJ_PROJECT_ID.supabase.co';
  static const supabaseAnonKey = 'TVOJ_ANON_KEY';

  // GPS
  static const gpsIntervalMs = 3000;        // Snimanje svake 3 sekunde
  static const gpsMinDistanceM = 2.0;       // Min pomak 2m između tački
  static const gpsAccuracyThresholdM = 15.0; // Ignoriši tačke lošije od 15m

  // Boje inženjera (10 unaprijed definirane)
  static const engineerColors = [
    '#E63946', // Crvena
    '#3B8BD4', // Plava
    '#2DC653', // Zelena
    '#FF9F1C', // Narandžasta
    '#9B5DE5', // Ljubičasta
    '#F72585', // Roza
    '#00BBF9', // Svetloplava
    '#FFBE0B', // Žuta
    '#06D6A0', // Tirkizna
    '#8D99AE', // Siva
  ];

  // Mapa
  static const defaultZoom = 16.0;
  static const maxZoom = 20.0;
  static const minZoom = 10.0;
  static const osmTileUrl =
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Supabase tabele — vlake
  static const tProfiles = 'profiles';
  static const tProjects = 'projects';
  static const tMembers = 'project_members';
  static const tTrackPoints = 'track_points';
  static const tZones = 'engineer_zones';

  // Supabase tabele — doznaka
  static const tDoznakaProj   = 'doznaka_projekti';
  static const tDoznakaTrasa  = 'doznaka_trasa';
  static const tDoznakaTacke  = 'doznaka_tacke';

  // Doznaka — granica pojasa (koliko metara od traga do gornje granice poligona
  // aktivira pitanje 'Je li ovo zadnji pojas?')
  static const doznakaNearBoundaryM = 50.0;
}
