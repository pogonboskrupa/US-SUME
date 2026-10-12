# US-SUME — upute za Codex

- Radna grana je isključivo `CODEX-US-SUME`. Ne mijenjaj, ne spajaj i ne briši druge grane. Historijska uputa za push na Claude granu u `CLAUDE.md` NE važi za naš rad.
- Prije rada pročitaj `docs/CODEX_CONTEXT.md` i `CLAUDE.md`, zatim provjeri stvarni kod relevantnog toka. Historijske bilješke i prolazni mock-testovi nisu dokaz da cijela aplikacija radi.
- Prioriteti: očuvanje terenskih podataka, pouzdan offline/GPS rad, stabilan Android WebView APK. GitHub Pages i Flutter projekat u `doznaka/` nisu zamjena za taj APK.
- Ne popravljaj funkcionalni kod samo zato što pregled otkrije problem. Za naredne popravke korisnik bira zadatak; mali, provjerljivi zahvati, bez masovnog refaktorisanja.
- Ne pokreći produkcijske migracije, instalaciju APK-a, deployment ili workflow bez izričitog zahtjeva. Testove izvršavaj lokalno s lažnim podacima i servisima.
- Sačuvaj postojeće izmjene. Prije commita provjeri granu, diff i da nema tajni. Ne zapisuj kredencijale ni njihove stvarne vrijednosti u dokumentaciju ili logove.
- Za funkcionalne izmjene prati verzioniranje iz `CLAUDE.md`: `index.html`, `sw.js`, Android `versionName` i rastući `versionCode`. Samo dokumentacija ne traži bump.
- Provjeri sintaksu inline JS blokova i pokreni relevantne testove, po mogućnosti cijeli lokalni skup. Posebno navedi šta NIJE testirano na pravom Android uređaju/Supabase bazi.
- Build skripta prihvata isključivo `CODEX-US-SUME`, ne mijenja granu i odbija rad iz prljavog stabla. Build/workflow ipak ne pokreći bez izričitog zahtjeva; vidi ograničenja builda i potpisa u kontekstu.
- Piši bosansku terminologiju i jasne commit poruke na bosanskom. Ažuriraj kontekst kad nova provjera promijeni nalaz ili arhitekturu.
