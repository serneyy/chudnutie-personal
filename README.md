# FORMA. Personal · verzia 11

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
