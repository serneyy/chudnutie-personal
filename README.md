# FORMA. Personal · verzia 27

Mobilná osobná aplikácia v slovenčine, na GitHub Pages. **Lokálne profily podľa mena**, bez backendu a bez serverového prihlásenia. GitHub Pages len načítava webové súbory; **záznamy sú uložené v `localStorage` ako JSON a nevstupujú do GitHub repozitára**.

## Odkazy

- Web: https://serneyy.github.io/chudnutie-personal/
- Repo: https://github.com/serneyy/chudnutie-personal

Ak web nie je aktívny, v **Settings → Pages → Deploy from a branch → main / (root) → Save** zapni publikovanie.

## GitHub JSON databáza rodinných profilov (voliteľná synchronizácia)

FORMA zostáva hostovaná na GitHub Pages. JSON súbor s rodinnými profilmi je \`data/forma-family.json\` vo **zvolenom GitHub repozitári**. Prvý upload používateľ musí výslovne povoliť. Bez pripojenia zostáva aplikácia plne lokálna, staré záznamy sa nestratia.

**Ako zapnúť:**

1. Najbezpečnejšie je vytvoriť **samostatný súkromný repozitár** napríklad \`serneyy/forma-private-data\` na https://github.com/new. Existujúci \`serneyy/chudnutie-personal\` je verejný: všetky dáta nahrané doň, vrátane historických commitov, budú verejné.
2. Na https://github.com/settings/personal-access-tokens/new vytvor GitHub **fine-grained Personal Access Token**, nastav **Repository access: Only select repositories** (iba konkrétny dátový repozitár) a **Repository permissions → Contents: Read and write**. Tento token umožňuje meniť všetky súbory vo vybranom repozitári, nie iba profilový JSON; preto ho nikdy neukladaj do súborov ani neposielaj ďalším osobám.
3. V aplikácii otvor **Nastavenia → GitHub databáza**, vyplň repozitár a token. Ak je repozitár verejný, musíš explicitne potvrdiť zverejnenie osobných údajov a ďalšie potvrdenie pred uploadom.
4. Po úspešnom pripojení sa profily a jedlá priebežne zapisujú na GitHub cez REST Contents API. Pri ďalšom zariadení v úvodnom výbere klikni **Načítať rodinné profily z GitHubu** a prepoj rovnaký repozitár.
5. Načítanie z GitHubu sa vykoná pri pripojení, pri obnovení karty a po návrate do aplikácie. V Nastaveniach môžeš použiť **Načítať z GitHubu** aj manuálne.

**Obmedzenia a bezpečnosť:** GitHub API vyžaduje token na zápis; FORMA ho ukladá iba v \`sessionStorage\` (v relácii prehliadača). Pri ukončení relácie môže byť potrebné token vložiť znova. Token nie je súčasťou GitHub JSON, uložených profilov ani zdrojového kódu. Pri súčasných zmenách na viacerých zariadeniach sa podľa času \`updatedAt\` zachová novšia verzia **celého profilu**, takže úpravy toho istého profilu na dvoch mobiloch naraz sa môžu vzájomne prepísať. GitHub história uchováva staršie verzie vrátane zmazaných údajov. Pre zabezpečenú produkčnú rodinnú aplikáciu je vhodnejšie použiť samostatný autentifikovaný backend namiesto PAT v klientskom prehliadači.

**Dôležité:** prepojený GitHub connector v ChatGPT neprenáša automaticky lokálne dáta z telefónu. Súbor vytvorený v repozitári má zatiaľ prázdny zoznam profilov; osobné záznamy sa nahrajú iba po explicitnom pripojení v aplikácii.


## Profily pre viac členov rodiny

- Pri prvom otvorení zadaj meno, aktuálnu a cieľovú váhu, výšku, vek a pohlavie pre výpočet.
- Každý profil si drží **vlastný denník jedál, históriu váhy, tréningy a kalorický plán**.
- Vpravo hore klikni na písmeno mena a vyber iný profil. V Nastaveniach je aj premenovanie profilu.
- Ak na tejto adrese v tomto prehliadači už boli údaje z predošlej verzie, automaticky sa nakopírujú do profilu **Môj pôvodný profil**. Je možné ho premenovať.
- JSON záloha v Nastaveniach obsahuje **iba údaje práve otvoreného profilu**.
- **Nie je to účet s heslom ani synchronizovaná databáza.** Profily nie sú súkromné pred iným človekom na tom istom telefóne a nebudú dostupné na inom zariadení bez exportu/importu. Na synchronizáciu medzi tvojím telefónom a maminým by bolo potrebné pridať autentifikovaný online backend.

## Fotografie výrobkov a overenie výpočtov

- **Open Food Facts fotografie:** pri textovom vyhľadávaní alebo skene EAN sa načíta predná fotografia produktu, pokiaľ existuje. Zobrazuje sa v návrhoch, detaili vybraného výrobku a pri uloženom jedle. Fotografie sú čítané len z oficiálnych obrazových domén Open Food Facts. Pri produktoch bez fotografie zostáva jednoduchá ikonka; orientačné domáce/reštauračné jedlá nepoužívajú vymyslené produktové fotografie.
- **Výpočet energie a makier**: hodnoty na 100 g sa násobia skutočne zadanými gramami / 100; napr. výrobok 180 kcal, 8 g bielkovín, 12 g sacharidov, 9 g tuku na 100 g má pri 150 g **270 kcal, 12 g bielkovín, 18 g sacharidov a 13,5 g tuku**. Programový test overuje aj cukry, vlákninu a uloženie do profilu.
- **Pozor na mililitre:** databáza môže uvádzať 100 g, ale nápoj sa zapisuje v ml; preto FORMA uvádza, že prepočet ml používa orientačnú konverziu 1 ml ≈ 1 g. Presný prepočet pri inom druhu nápoja závisí od hustoty a údajov na etikete.
- **Rozdiel kcal a makrá:** kcal podľa etikety alebo databázy sa **neprepočítavajú nanovo zo vzorca 4/4/9**, pretože kalorická energia môže zohľadňovať vlákninu, polyoly a zákonné zaokrúhľovanie. Skontroluj hodnoty na obale, ak záznam databázy vyzerá nezvyčajne.
- **Čo test neoverí:** kvalitu nutričných údajov každého externého produktu ani presnú hmotnosť receptu z reštaurácie. Výpočtové pravidlo je overené, ale správnosť vstupu závisí od etikety/databázy.

## Cloudflare Worker a automatické GitHub zálohy

- Source servera: `cloudflare/forma-github-sync.js`. Určený **výhradne** na nový Cloudflare Worker `forma-github-sync` v existujúcom účte s workers.dev subdoménou `teenwear-eu`. **Nemení** existujúce Workers, ich DNS, routes ani konfiguráciu.
- Server používa URL `https://weathered-feather-e501.teenwear-eu.workers.dev`. GET `/health` vráti, či je nakonfigurovaný serverový GitHub token `GITHUB_TOKEN`. GET a POST `/profiles` načítavajú a ukladajú `data/forma-family.json` v repozitári `serneyy/chudnutie-personal`. Server zlúči profily podľa `updatedAt` a opakuje zápis pri konfliktoch GitHub SHA.
- **V prehliadači nie je GitHub PAT**, žiadne prihlasovanie do GitHubu ani formulár s tokenom. Nastavenie secretu sa robí raz v Cloudflare Worker Settings → Variables and Secrets → Add secret. Hodnota: GitHub fine-grained PAT obmedzený na `serneyy/chudnutie-personal` s `Contents: Read and write`. Secret sa nesmie commitovať.
- **Dôležité:** nasadenie Cloudflare Worker robí vlastník ručne. Kým Worker nebeží a `GITHUB_TOKEN` nastavený, automatická GitHub záloha **nie je funkčná**. Aplikácia sa musí viditeľne prepnúť do režimu lokálneho ukladania a nikdy nesmie tvrdiť, že GitHub má aktuálne údaje.
- Prvá synchronizácia lokálne dáta nevymaže; profily sa zlúčia podľa času poslednej úpravy, pri zlyhaní servera sa zachovajú v `localStorage`. Mobilné testy simulujú dve zariadenia a nedostupný server.
- Upozornenie: verejný GitHub repo umožňuje komukoľvek prezerať údaje v histórii commitov. Endpoint POST nie je autentifikovaný na strane používateľa (požiadavka na rodinný prototyp); CORS/Origin nie je bezpečnostné overenie klienta, takže endpoint nie je vhodný pre produkčné osobné údaje.

## FORMA v27: oprava opakovaných chýb online katalógu

- Diagnostika na živých Open Food Facts endpointoch z GitHub Actions 8. novembra 2026: `search.openfoodfacts.org/search` síce vracia HTTP 200, ale **bez `Access-Control-Allow-Origin`**, takže JavaScript v prehliadači jeho výsledky z inej domény nemôže čítať. `world.openfoodfacts.org/cgi/search.pl` vracal HTTP 200 a `Access-Control-Allow-Origin: *`. Niektoré API v2 požiadavky súčasne vracali HTTP 503.
- Aplikácia predtým volala CORS-nefunkčný endpoint ako prvý a na celú sekvenciu mala iba 6,5-sekundový timeout. To často zabránilo akémukoľvek volaniu funkčného legacy vyhľadávania. Teraz v prehliadači používa priamo legacy CGI a 9-sekundový timeout, bez zbytočného volania Search-a-licious.
- Pôvodné diakritické názvy sa do externého katalógu posielajú **bez odstraňovania diakritiky** (`čoko` zostane `čoko`), zatiaľ čo lokálne porovnávanie a cache zostávajú normalizované.
- Lokálne základné návrhy fungujú ihneď. Pridané sú mliečna a horká čokoláda, Lidl Fin Carré 52 % a kakao, všetky so zdrojmi KalorickéTabuľky.sk a upozornením na orientačný charakter hodnôt.
- Ak sa externý katalóg nepodarí načítať, ale miestne návrhy existujú, používateľ dostane tieto návrhy bez rušivej chybovej karty. Ak návrhy chýbajú, dostupné zostane manuálne zadanie a opakovanie pokusu.
- Tretia strana môže stále krátkodobo vracať 503; bez vlastného backendu a plnej lokálnej potravinovej databázy nie je možné sľúbiť 100 % dostupnosť vyhľadávania všetkých výrobkov.

## FORMA v26: lokálne pečivo, Lidl a zdroje

- Offline katalóg obsahuje biely rožok, celozrnný rožok Lidl, cereálnu kaiserku Lidl, horskú, fitness, proteínovú a špaldovú žemľu Lidl, kornbagetu, maslový croissant, praclík, bielu bagetu a pizza taštičku Lidl.
- Všetky nutričné hodnoty (na 100 g) majú individuálny odkaz na zdroj na KalorickéTabuľky.sk. Nejde o certifikované údaje výrobcu. Porcie sú orientačné a možno ich zmeniť; pri alternatívnych receptúrach rovnakého pečiva sa čísla môžu líšiť.
- Fotky sú ilustračné, nie sú to presné produktové fotografie Lidl. V aplikácii sú odkazy na ich zdroj. Všetky použité fotografie z Wikimedia Commons sú CC0: Rohlík bílý tukový.jpg; Home-baked breadrolls.jpg; Baguette-246424.jpg; Croissant bread.jpg; Mini pretzel.jpg.
- V rýchlom výbere pribudlo rozbaľovacie pečivo z Lidla. Chybná hláška „Nič som nenašiel“ počas načítavania sa už nezobrazuje. Zobrazenie vyhľadávania a lokálne výsledky nevyžadujú fungujúce externé API.

## FORMA v25: registrácia na naberanie a odolnejšie vyhľadávanie

- Pri zakladaní profilu má používateľ voľbu Schudnúť / Udržať váhu / Nabrať svaly. Cieľ vyšší než aktuálna váha automaticky predvolí Nabrať svaly; cieľ rovný váhe predvolí Udržať váhu. Validácia kontroluje smer cieľa podľa režimu a existujúce profily zostávajú nezmenené.
- Názvy zo starších vyhľadávaní Open Food Facts aj z vlastného denníka sa ponúkajú **okamžite** (aj pri zadaní časti názvu), bez čakania na API. Výsledky sa uchovávajú lokálne 7 dní a priebežne aktualizujú.
- Nový dotaz na server sa spustí po 850 ms nečinnosti. Zachované je obmedzenie na najviac 8 dopytov za minútu kvôli limitom Open Food Facts (10 vyhľadávaní/min/IP). Pri preťažení alebo nedostupnosti servera zostanú dostupné miestne návrhy a zrozumiteľná možnosť opakovania. Pri online vyhľadávaní nemožno sľúbiť 100 % dostupnosť externého API.

## FORMA v24: rýchlosť naberania, profilové heslá, odstránenie Dedko

- Režim Nabrať svaly obsahuje voľbu pomaly (+150 kcal), stredne (+250 kcal) a rýchlejšie (+350 kcal) nad odhad TDEE, pred zaokrúhlením na 50 kcal. Nejde o sľúbený rast svalstva; rýchlejší nadbytok môže zvýšiť ukladanie tuku. Voľba sa ukladá samostatne v každom profile do JSON.
- Každý člen rodiny môže v Nastaveniach nastaviť heslo aspoň 6 znakov, pri vytváraní nového profilu je voliteľné. Heslo sa nikdy neukladá ako čitateľný text, ale ako náhodne solený PBKDF2-SHA256 hash. Pri otvorení uzamknutého profilu sa vyžaduje heslo vrátane obnovenia stránky.
- **Bezpečnostné obmedzenie:** Verejný GitHub JSON a Cloudflare Worker API nie sú autentifikované heslom. Zamykanie chráni len bežný prístup cez UI, **nie súkromie dát v GitHube** a nie je náhradou za serverovú autentifikáciu.
- Profil Dedko identifikovaný podľa ID `02c947bf-dd36-4ddc-bf9d-2a0a055c0ac0` je blokovaný v novej verzii klienta. Priamy zápis do existujúceho GitHub JSON bol zamietnutý konektorom, preto ho ešte treba z cloud súboru odstrániť. Staršie klienty ho môžu znovu synchronizovať, pokým nie je aktualizovaný aj Cloudflare Worker.

## FORMA v23: detail potravín, makier a naberanie svalov

- Ťuknutie na zapísané jedlo na domovskej stránke alebo v Denníku ukáže detail so 6 hodnotami pre jeho skutočnú porciu: kalórie, bielkoviny, sacharidy, tuky, cukry a vláknina. Neznáme hodnoty sa uvádzajú ako „Neznáme“ a neskrývajú pod nulu.
- Ťuknutie na kruh bielkovín, sacharidov, tukov, cukrov a vlákniny alebo na kartu kalórií zobrazí všetky dnešné jedlá zoradené podľa príspevku k zvolenej metrike. Riadok je možné otvoriť pre podrobnejší detail. Pôvodné tlačidlo Pridať jedlo zostáva jediné.
- Plán má nový cieľ **Nabrať svaly**. Orientačný príjem je TDEE + 250 kcal zaokrúhlených na 50 kcal, bielkoviny 1,8 g/kg aktuálnej hmotnosti, tuky približne 0,8 g/kg a zostávajúce kalórie zo sacharidov. Pri naberaní sa požaduje vyššia cieľová hmotnosť, tempo chudnutia sa nezobrazuje a kalorický rozdiel sa označí ako nadbytok. Výpočet je iba orientačný; budovanie svalov si vyžaduje progresívny silový tréning. Režim sa bezpečne ukladá v JSON, staré profily zostávajú nezmenené.

## FORMA v22: nastavenia a pridávanie jedla

- Stav GitHub zálohy zostáva v **Nastavenia → Automatická GitHub záloha**; z domovskej obrazovky je odstránený.
- Meno aktívneho profilu sa upravuje priamo v Nastaveniach cez formulár (bez systémového promptu). Tlačidlo **Odhlásiť sa z profilu** iba odstráni aktívny výber z tejto relácie a zobrazí zoznam profilov; neodstraňuje profily, jedlá ani cloudovú databázu.
- Pridávanie jedla je kompaktnejšie: vyhľadávanie a 5 rýchlych volieb sú na prvom mieste, ďalšie hotové jedlá sa otvoria cez detail, príslušná porcia a výživové údaje zostávajú funkčné.

## Denník: výživové súčty podľa jedla

- Raňajky, desiata, obed, olovrant, večera a ostatné zobrazujú oddelene **kalórie, bielkoviny, sacharidy a tuky**.
- Každý súčet sa vyráta zo všetkých zapísaných potravín v príslušnej kategórii a zvolenom dni. Hodnoty sa po pridaní, úprave alebo odstránení jedla aktualizujú.
- Pri prázdnej kategórii sú súčty nulové a veľký prázdny biely blok je nahradený úzkou správou. Pôvodné tlačidlá „+ Pridať“ zostávajú.
- Nezmenené: uložené údaje, makrá výrobkov, jedálniček ani celkové denné hodnoty.

## Domovská stránka: kruhové ciele a pohyb

- Päť kruhových indikátorov ukazuje, **koľko gramov ešte zostáva** do denného cieľa pre bielkoviny, sacharidy, tuky, vlákninu a európsku referenčnú hodnotu celkových cukrov. Pri splnení sa zobrazuje 0 / „splnené“. Referencia cukrov 90 g nie je pevný zdravotný limit.
- Dlhý vysvetľujúci odsek pod makrami bol odstránený. Detail o rozdiele celkových a voľných cukrov zostal v Pláne.
- Zelená karta cieľa obsahuje **odporúčanú orientačnú dennú aktivitu**: približne 25 minút svižnej chôdze (priemer 150 minút týždenne), prepočítanú cez MET a poslednú známu hmotnosť na kcal. Sčíta aj dnešné zaznamenané aktivity.
- **Dôležité:** pohybový cieľ nie je povinnosť spáliť kalórie navyše kvôli jedlu a *nepripočítava* kcal k stravovaciemu rozpočtu. Sú to orientačné odhady, nie presné energetické merania.

## Ciele bielkovín a cukrov

- **Bielkoviny sa teraz prispôsobujú bežnej aktivite.** Pri sedavej práci a chudnutí sa počíta 1,3 g/kg cieľovej hmotnosti (pri cieli 88 kg približne 114 g/deň); pri ľahkej aktivite 1,4 g/kg; pri strednej a vysokej 1,6 g/kg. Pri udržiavaní váhy je to 1,2 až 1,6 g/kg aktuálnej hmotnosti. Ide o orientačné čísla pre zdravého dospelého, nie individuálne medicínske odporúčanie. [ISSN 2026 pre chudnutie: 1,2–1,6 g/kg](https://pmc.ncbi.nlm.nih.gov/articles/PMC13665703/).
- **Cukry celkom: 90 g/deň** je *referenčný príjem pre dospelých* podľa európskych pravidiel (pri 2 000 kcal), nie zdravotný bezpečný limit. Aplikácia ukazuje dnešný súčet a pomer k tomuto referenčnému číslu. [EÚ 1169/2011, príloha XIII](https://www.legislation.gov.uk/eur/2011/1169/annex/XIII).
- **Voľné cukry:** podľa WHO menej než 10 % dennej energie, ideálne menej než 5 %; pri 2 100 kcal teda pod približne 52 g, ideálne 26 g. Medzi voľné cukry patria aj cukry pridané do kávy, med, sirupy a ovocné šťavy. [WHO](https://www.who.int/news-room/fact-sheets/detail/healthy-diet).
- **Dôležité:** Open Food Facts uvádza najmä *celkové cukry*. Z tých sa nedá spoľahlivo rozlíšiť množstvo *voľných cukrov*, preto aplikácia nesmie porovnávať súčet celkových cukrov s limitom WHO.
- Obe hodnoty sa rátajú pri každom otvorení denníka a Plánu bez zásahu do uložených potravín alebo rodinných profilov.

## Praženica a varenie podľa počtu kusov

- Pridať jedlo → **Praženica** alebo vyhľadať **„praženica z 3 vajíčok“**.
- Vyber počet vajec tlačidlami **− / +** (1 až 8 vajec) a či si použil maslo alebo olej.
- Jedno väčšie vajce (50 g) má orientačne **72 kcal a 6,3 g bielkovín**. Tri vajcia bez tuku ≈ **216 kcal**. Pri 5 g masla ≈ **252 kcal**; pri 5 g oleja ≈ **261 kcal**.
- Jedlo sa uloží ako jedna položka vrátane vajec a zvoleného tuku. Chlieb, slaninu, mlieko a ďalšie suroviny treba pridať osobitne.
- Odhad podľa [USDA referenčného veľkého vajca](https://www.myfoodanalysis.com/food/whole-egg-raw-171287). Skutočná veľkosť vajec a množstvo tuku výsledok menia.

## Hotové a reštauračné jedlá

- Klikni **Pridať jedlo** a vyhľadaj napr. `tikka masala`, `pizza`, `rizoto`, `bolognese`, `halušky`, `guláš`, `rezeň` alebo `sushi`.
- Pri **Chicken tikka masala** sú **dva samostatné záznamy: s ryžou a bez ryže**. Zvolíš správnu verziu, aby sa príloha nezapočítavala dvakrát.
- Ak nevieš gramáž, vyber **Menšia / Bežná / Väčšia porcia**. Ak vieš viac, prepíš počet gramov v strede.
- Kalórie, bielkoviny, sacharidy, tuky, cukry a vláknina sa vyplnia ako jeden pokrm. Hodnoty sú **hrubý orientačný odhad**, nie certifikované nutričné hodnoty tvojho jedla.
- Recepty sa výrazne líšia: napríklad tikka masala **s ryžou** môže mať v balených výrobkoch asi **130–173 kcal na 100 g**; bez ryže sa podiel bielkovín a tukov podstatne zmení. Ak poznáš jedáleň či presný recept, radšej použi ich údaje.
- Príklady zdrojov: [Tesco SK tikka s ryžou, 137 kcal/100g](https://potravinydomov.itesco.sk/shop/en-SK/products/105006688), [Patient.info tikka bez ryže, 156 kcal/100g](https://patient.info/nutrition/foods/curry-chicken-tikka-masala-retail-reheated), [Lidl variant v Open Food Facts, 173 kcal/100g](https://www.foodnutrifacts.com/products/lidl-deluxe-chicken-tikka-masala-w-rice-4056489899792).

## Jednoduché ovládanie pre rodinu

- **Dnes → Pridať jedlo**: vyber **Proteín, Skyr, Banán alebo Cappuccino** jedným ťuknutím. Prípadne začni písať a vyber zo zoznamu.
- Bežné potraviny fungujú aj bez Open Food Facts. Pridali sme aj whey proteín, proteínový nápoj, tyčinku, puding, tvaroh, cottage, jogurt, zemiaky a iné základné potraviny.
- **Množstvo → Uložiť jedlo**: nutričné hodnoty sa prepočítajú automaticky. Posledné jedlá sa ponúknu na opätovné vloženie.
- **Nenašiel si jedlo?** Ťukni na položku na manuálne zadanie výživových hodnôt.
- Vstupy na iPhone sú nastavené na minimálne 16px, aby sa formulár pri kliknutí svojvoľne nepribližoval. Veľké tlačidlá sú vhodnejšie aj na starší mobil.
- Hodnoty pri základných jedlách (obzvlášť proteínový prášok/tyčinky) sú **iba orientačné**, líšia sa podľa výrobcu. Pri balenom produkte radšej naskenuj obal.

## Funkcie

- **Dnes**: kalórie, cieľ, makrá, základné motivačné zobrazenie.
- **Jedlá**: raňajky / desiata / obed / olovrant / večera, návrhy pri písaní, detailné živiny, úprava aj odstránenie.
- **Skener**: automatické načítanie EAN cez kameru, nezávislý ZXing-C++ dekodér WebAssembly (lokálne v repozitári), prepínanie kamery, fotenie obalu a ručný EAN.
- **Open Food Facts**: textové vyhľadávanie značkových výrobkov cez legacy search API, vyhľadanie EAN, údaje na 100 g a porcia z etikety, ak existuje. Vyhľadávanie po dopísaní textu je spomalené, obmedzené na 3 požiadavky za minútu na zariadenie a úspešné výsledky sa na 24 hodín ukladajú lokálne. Pri 503/429 majú prednosť lokálne jedlá a skener čiarových kódov.
- **Bežné jedlá**: prednastavené orientačné hodnoty napr. cappuccino s polotučným mliekom a porcia 180 ml, banán alebo ryža. Odhad nie je údaj od výrobcu.
- **Plán**: TDEE, deficit, makrá, približný čas, fitko, chôdza a zápis aktivít.
- **Progres**: záznamy váhy, trend, vzdialenosť od cieľa.
- **Zálohy**: export/import JSON.

### Ako naskenovať produkt

1. Otvor v mobile **HTTPS adresu** GitHub Pages (nie `file://`).
2. Dole klikni na žlté tlačidlo **Skenovať**.
3. Pri prvom použití potvrď **Povoliť kameru**.
4. Namier zadnú kameru na celý EAN čiarový kód s dostatočným svetlom. Skener **automaticky rozpozná číslice**, nespúšťa ukladanie fotografie na server.
5. Ak sa nedarí, klikni **Prepnúť kameru**, alebo **Odfotiť obal** (mobilný fotoaparát), prípadne napíš číslo EAN.
6. Po nájdení produktu uprav **množstvo v gramoch alebo mililitroch** a over údaje podľa obalu.

Foto režim potrebuje prístup k obrázku. Po odfotení sa lokálne pokúsi rozpoznať EAN. Appka **nevytvára nový čiarový kód produktu**; číta existujúci.

### Vyhľadanie jedla pri písaní

1. Otvor **Pridať jedlo** a napíš napr. `capucino`, `banán` alebo názov značkového výrobku.
2. Ťukni na návrh. Aplikácia vyplní výživové hodnoty a predvolenú porciu (`180 ml` pri bežnom cappuccine). Porciu môžeš zmeniť tlačidlami alebo zadaním čísla.
3. Klikni **Uložiť jedlo**. Technické hodnoty sú schované pod rozbaľovacím detailom.

Vyhľadávanie je oneskorené a obmedzené na najviac 8 vyhľadávaní za minútu na jednom zariadení, lebo Open Food Facts má limit 10 vyhľadávaní za minútu na IP. Bežné potraviny sa filtrujú priamo v prehliadači a fungujú aj pri nedostupnosti API.

### Súčasné obmedzenia

- Skenovanie v živom obraze vyžaduje HTTPS a povolenie kamery. iOS Safari nemusí podporovať natívne `BarcodeDetector`; preto je základom aj samostatný ZXing-C++ dekodér vo WebAssembly. Všetky obrazové dáta sa dekódujú lokálne.
- Ak výrobok nie je v Open Food Facts alebo nemá kompletné makrá, hodnoty môžeš zadať ručne.
- Pri prechode do iného prehliadača/na iné zariadenie sa lokálne dáta neprenesú. Stiahni zálohu v Nastaveniach.
- Odporúčaný výdaj z cvičenia je len odhad a **nepripočítava sa** ku kalorickému rozpočtu.
- Nejde o individuálne medicínske odporúčanie.

## Zdrojové súbory

- `index.html` – rozhranie a všetky mobilné obrazovky
- `styles.css` – vzhľad pre mobil + desktop
- `app.js` – dáta, kalorická kalkulačka, čítačka, import/export
- `manifest.webmanifest` + `icon.svg` – pridanie na plochu telefónu
- `vendor/zxing-reader.js` a `vendor/zxing_reader.wasm` – lokálny skener, bez externého CDN
- `.github/workflows/vendor-scanner.yml` – verzovanie knižnice skenera
- `tests/smoke.cjs` – automatizovaný mobilný browser test
- `.github/workflows/validate.yml` – validácia po každom pushi

## Zdroje

[Open Food Facts](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) · [Mifflin–St Jeor](https://www.ncbi.nlm.nih.gov/sites/books/NBK278991/table/diet-treatment-obes.table12est/?report=objectonly) · [CDC pohyb](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html) · [WHO cukry](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)
