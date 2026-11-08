# FORMA. Personal · verzia 14

Mobilná osobná aplikácia v slovenčine, na GitHub Pages. **Lokálne profily podľa mena**, bez backendu a bez serverového prihlásenia. GitHub Pages len načítava webové súbory; **záznamy sú uložené v `localStorage` ako JSON a nevstupujú do GitHub repozitára**.

## Odkazy

- Web: https://serneyy.github.io/chudnutie-personal/
- Repo: https://github.com/serneyy/chudnutie-personal

Ak web nie je aktívny, v **Settings → Pages → Deploy from a branch → main / (root) → Save** zapni publikovanie.

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
