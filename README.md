# FORMA. Personal · verzia 3

Mobilná osobná aplikácia v slovenčine. Bez účtu, bez backendu. GitHub Pages slúži iba na načítanie webových súborov; **záznamy zostávajú lokálne v tvojom prehliadači**.

## Odkazy

- Web: https://serneyy.github.io/chudnutie-personal/
- Repo: https://github.com/serneyy/chudnutie-personal

Ak web nie je aktívny, v **Settings → Pages → Deploy from a branch → main / (root) → Save** zapni publikovanie.

## Funkcie

- **Dnes**: kalórie, cieľ, makrá, základné motivačné zobrazenie.
- **Jedlá**: raňajky / desiata / obed / olovrant / večera, detailné živiny, úprava aj odstránenie.
- **Skener**: automatické načítanie EAN cez kameru, alternatívny skenovací režim pre zariadenia bez natívneho rozpoznania, fotenie obalu a ručný EAN.
- **Open Food Facts**: doplnenie názvu produktu a živín na 100 g. Údaje si over podľa etikety.
- **Plán**: TDEE, deficit, makrá, približný čas, fitko, chôdza a zápis aktivít.
- **Progres**: záznamy váhy, trend, vzdialenosť od cieľa.
- **Zálohy**: export/import JSON.

### Ako naskenovať produkt

1. Otvor v mobile **HTTPS adresu** GitHub Pages (nie `file://`).
2. Dole klikni na žlté tlačidlo **Skenovať**.
3. Pri prvom použití potvrď **Povoliť kameru**.
4. Namier zadnú kameru na celý EAN čiarový kód s dostatočným svetlom. Skener **automaticky rozpozná číslice**, nespúšťa ukladanie fotografie na server.
5. Ak sa nedarí, klikni **Alternatívny skener**, alebo **Odfotiť obal** (mobilný fotoaparát), prípadne napíš číslo EAN.
6. Po nájdení produktu doplň **množstvo v gramoch** a over údaje podľa obalu.

Foto režim potrebuje prístup k obrázku. Po odfotení sa lokálne pokúsi rozpoznať EAN. Appka **nevytvára nový čiarový kód produktu**; číta existujúci.

### Súčasné obmedzenia

- Skenovanie v živom obraze vyžaduje HTTPS a povolenie kamery. iOS Safari nemusí podporovať natívne `BarcodeDetector`, vtedy sa používa HTML5 QR Code fallback.
- Ak výrobok nie je v Open Food Facts alebo nemá kompletné makrá, hodnoty môžeš zadať ručne.
- Pri prechode do iného prehliadača/na iné zariadenie sa lokálne dáta neprenesú. Stiahni zálohu v Nastaveniach.
- Odporúčaný výdaj z cvičenia je len odhad a **nepripočítava sa** ku kalorickému rozpočtu.
- Nejde o individuálne medicínske odporúčanie.

## Zdrojové súbory

- `index.html` – rozhranie a všetky mobilné obrazovky
- `styles.css` – vzhľad pre mobil + desktop
- `app.js` – dáta, kalorická kalkulačka, čítačka, import/export
- `manifest.webmanifest` + `icon.svg` – pridanie na plochu telefónu
- `tests/smoke.cjs` – automatizovaný mobilný browser test
- `.github/workflows/validate.yml` – validácia po každom pushi

## Zdroje

[Open Food Facts](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/) · [Mifflin–St Jeor](https://www.ncbi.nlm.nih.gov/sites/books/NBK278991/table/diet-treatment-obes.table12est/?report=objectonly) · [CDC pohyb](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html) · [WHO cukry](https://www.who.int/news-room/fact-sheets/detail/healthy-diet)
