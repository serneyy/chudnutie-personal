# FORMA. | Osobná aplikácia na chudnutie

Jednoduchá slovenská mobilná webová aplikácia v jednom súbore `index.html`, bez databázy a bez registrácie.

## Funkcie
- Denník jedál podľa raňajok, desiaty, obeda, olovrantu a večere
- Ručný zápis a skenovanie EAN/UPC cez kameru (Open Food Facts)
- Denné kalórie, bielkoviny, sacharidy, tuky a celkové cukry
- Osobná kalkulačka podľa výšky, váhy, veku, aktivity a cieľovej hmotnosti
- Odhad dĺžky chudnutia a samostatný plán pohybu / fitka
- Záznam tréningov, graf hmotnosti a história vážení
- Export a import JSON zálohy

## Spustenie cez GitHub Pages
1. Otvor **Settings → Pages**.
2. V časti **Build and deployment** nastav **Deploy from a branch**.
3. Vyber vetvu **main** a priečinok **/(root)** a ulož.
4. Stránka: https://serneyy.github.io/chudnutie-personal/

GitHub konektor nemá prístup k zmene nastavení Pages. Nastavenie je potrebné vykonať ručne jedenkrát.

## Súkromie a dáta
Záznamy hmotnosti a jedla sú v `localStorage` prehliadača. Verejný GitHub repozitár obsahuje len aplikáciu, nie tvoje osobné dáta. Vymazanie dát prehliadača záznamy odstráni; pravidelne používaj **Nastavenia → Stiahnuť zálohu**.

Open Food Facts má komunitné údaje, pri produktoch treba overovať etiketu. Kamera potrebuje HTTPS a povolenie; ak knižnica alebo API zlyhajú, zadávaj hodnoty ručne.

## Ako sa počíta plán
Mifflin–St Jeor pre BMR, orientačný násobiteľ aktivity pre TDEE, približný deficit podľa tempa chudnutia, orientačná prognóza a makrá. Voľné cukry podľa WHO pod 10 % energetického príjmu sa **nesmú zamieňať** s celkovými cukrami na etikete. Výdaj pri aktivite je len orientačný MET odhad a nepripočítava sa ku kalorickému rozpočtu.

Zdroje: [BMR](https://www.ncbi.nlm.nih.gov/sites/books/NBK278991/table/diet-treatment-obes.table12est/?report=objectonly), [CDC chudnutie](https://www.cdc.gov/healthy-weight-growth/losing-weight/), [CDC pohyb](https://www.cdc.gov/physical-activity-basics/guidelines/adults.html), [WHO cukry](https://www.who.int/news-room/fact-sheets/detail/healthy-diet), [Open Food Facts API](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/), [Compendium MET](https://pacompendium.com/adult-compendium/).

Aplikácia je pre dospelých a jej výpočty nie sú lekárskym odporúčaním.
