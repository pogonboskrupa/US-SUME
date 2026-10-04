# DENDRO MAP 2.3.0 — Server, Projekat, Vlake i dvosmjer

Korisnik autorizovao dopune postojećeg rada i novu verziju APK-a. Grana
CODEX-US-SUME-2026-10-01; 2.3.0 / versionCode500. Nema produkcijskih migracija.

## Pregledano i izmijenjeno

- Server: postojeći ručni write prozor, red, priprema vlaka/GPS doznake,
  paginirano preuzimanje projekata i vlaka, zaštita živog neposlanog rada,
  doznaka strict prijem i mali pregled potvrda. Funkcije vraćaju rezultate
  umjesto nagađanja uspjeha iz toasta. Jedno dugme **Pošalji i primi** poziva
  redom slanje, prijem svih dostupnih projekata i prijem doznake. Prijem
  doznake uključuje listu odjela i slojeve odjela otvorenog pri pritisku;
  bez otvorenog odjela izričito se prikazuje da nisu preuzeti GPS pojasevi.
  Tri statusa i vrijeme pokušaja čuvaju se po nalogu. Djelimično slanje ne
  blokira prijem, a nije označeno kao potpun uspjeh. Promjena naloga prekida
  naredne korake. Automatsko slanje i dalje zabranjeno, write prozor zatvara
  se prije prijema. Grupiranje po projektu/danu i posljednja tri projekta
  zadržani. GPS/queue/IDB geometrije nisu premještane.
- Projekat: projekti i aktiviranje -> vlake aktivnog projekta -> sklopiva
  statistika (rekap, teren, STD) -> dnevnik -> izvoz/sigurnosna kopija ->
  poligon/teren -> boje -> strelice na dnu. Kratka navigacija do odjeljaka.
  Aktiviranje je iznad detaljne statistike i članova. Brisanje sklopljeno.
  Aktivne sekcije ne pokazuju se bez aktivnog projekta ni uz drugi projekat.
- Vlake: vlastite vlake i kolege na vrhu, radnje Snimi/Nacrtaj/Pregled
  projekta, zatim bafer i referentna karta kao sklopive sekcije. Poštovane
  uloge i aktivni projekat. Liste, indeksi vlaka i geometrije ne mijenjaju se.
- Dvosmjer: sav korisnički naziv razdjelnica zamijenjen. Jedan ↔ znak sa
  dvije glave, istog poteza/boje/veličine i smjera tangente kao obična strelica.
  Tačka koju bira projektant i postojeći lokalni zapisi ostaju kompatibilni;
  unutrašnji separator/split ključ nije preimenovan. Nema automatske polovine.
- Položaj strelica: jedno select polje Na vlaci / Pored vlake, po nalogu i
  projektu. Svi znakovi (i ↔) imaju isti položaj; nema duple kopije. Lateralni
  razmak u CSS pikselima prati težinu linije i visinu znaka te se osvježava pri
  zumiranju. Pri 1:10.000 preporučeni automatski broj 1/2 i veličina 30 px.
  Vlastite/kolegine vlake rade jednako. Geografska tačka dvosmjera nije pomjerena.
- Snimanje: dvosmjer u donjoj traci između Desnog kraka i Pauze. Uklonjene
  UI opcije Precizna tačka i Slobodan pogled; skriven prazan duplirani red
  banera. Zadržani početak, krakovi, povratak na roditelja, pauza i završetak,
  zaštita zadnje prihvaćene GPS tačke i automatsko oslobađanje praćenja pri
  povlačenju karte. Postojeći nepozvani precizni helperi nisu prepisivani.

## Provjere

Lokalno: inline/staticki JS sintaksa, 86 JS test fajlova; dodatnih devet
Server scenarija (ukupno 40), postojeća GPS/5.400m simulacija i provjere
redova, bez izmjene podataka. Python browser fixture sintaksa/import provjereni.
Browser proširen za jednu ručnu razmjenu/disable, stvarne panele Projekat i
Vlake, kompaktan baner, jedan ↔ i ekskluzivan odmak, poligon pri stvarnom
app izračunu 1:10.000 te dnevni/tamni prikaz na 320/390px i landscape.

CI 37203728695 na 2f8750bdb4f2fc4651098dafa106659716bf62b5 uspješan:
86 JS fajlova, 10 browser skripti, Android build/asset SHA provjera i online
OCR offline gate instrumentacija. Pregledani PNG Server 320px, Projekat
320px, dvosmjer/pored odjela 1:10.000 i kompaktni recording banner 320px.
Prvi CI zaustavljen u testu SVGRect.toJSON; test ispravljen getBBox poljima.
Objavljen v2.3.0: 23.890.289 B, code500. Preuzeti APK: sedam izmijenjenih
web asseta byte-identično izvoru, GRANICE >10 MB, stvarni v2 cert isti kao
2.2.9/2.2.8. Release SHA256 potvrđen:
0f9bb3239c578a36d41ee7fd29f882e0929e482bb9867903de423622901b3ce8.
https://github.com/pogonboskrupa/US-SUME/releases/tag/v2.3.0
 Lokalni Chromium
ograničen sandbox socket pravilima; pregled PNG-a radi se iz CI artefakta.
Nije testirano na fizičkom Redmi/Xiaomi telefonu, stvarnom GPS-u ni
produkcijskom Supabase-u. Simulacije ne potvrđuju potrošnju baterije/OEM
background ograničenja ili serverske RLS dozvole konkretnog naloga.
