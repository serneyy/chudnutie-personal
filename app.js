/* FORMA 3.0 | mobile-first personal tracker | no server-side account */
(function(){
"use strict";
const KEY="forma-personal-v2"; // Legacy single-profile data, retained as a safety backup
const PROFILE_STORE_KEY="forma-local-profiles-v1";
const PROFILE_ACTIVE_KEY="forma-active-profile-v1";
const PROFILE_REMEMBER_KEY="forma-remembered-profile-v1";
const GITHUB_REPO_KEY="forma-github-repository-v1";
const PROFILE_LOGGED_OUT_KEY="forma-profile-logged-out-v1";
const REMOVED_PROFILE_IDS=new Set(["02c947bf-dd36-4ddc-bf9d-2a0a055c0ac0"]);
let pendingUnlockId=null,unlockedProfileId=null;
const GAIN_SURPLUS={slow:150,moderate:250,fast:350};
function validPasswordRecord(p){return p&&p.algorithm==="PBKDF2-SHA256"&&Number.isInteger(p.iterations)&&p.iterations>=100000&&p.iterations<=500000&&/^[0-9a-f]{32}$/.test(p.salt)&&/^[0-9a-f]{64}$/.test(p.hash)}
function normalizePasswordRecord(p){return validPasswordRecord(p)?{algorithm:"PBKDF2-SHA256",iterations:p.iterations,salt:p.salt,hash:p.hash}:null}
async function passwordHash(input,salt,iterations){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(input),"PBKDF2",false,["deriveBits"]);
 const saltBytes=Uint8Array.from(salt.match(/.{2}/g),x=>parseInt(x,16));
 const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:saltBytes,iterations,hash:"SHA-256"},key,256);
 return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,"0")).join("");
}
async function createPasswordRecord(password){
 const salt=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
 return {algorithm:"PBKDF2-SHA256",iterations:210000,salt,hash:await passwordHash(password,salt,210000)};
}
async function verifyProfilePassword(password,record){
 if(!validPasswordRecord(record))return false;
 const candidate=await passwordHash(password,record.salt,record.iterations);
 let diff=0;
 for(let i=0;i<record.hash.length;i++)diff|=record.hash.charCodeAt(i)^candidate.charCodeAt(i);
 return diff===0;
}
const GITHUB_SESSION_KEY="forma-github-session-v1";
const GITHUB_JSON_PATH="data/forma-family.json";
const GITHUB_DEFAULT_REPO="serneyy/chudnutie-personal";
let githubConnection=null,githubSyncEnabled=false,githubSyncInFlight=null,githubSyncAgain=false,githubSyncTimer=null;
let githubSyncRevision=0,githubSyncLastRead=0;
const $=id=>document.getElementById(id);
const $all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const today=dateLocal(new Date());
const MEALS=[["ranajky","Raňajky"],["desiata","Desiata"],["obed","Obed"],["olovrant","Olovrant"],["vecera","Večera"],["ine","Ostatné"]];
const EXERCISES={gym:{name:"Fitko / silový tréning",met:3.5},walk:{name:"Svižná chôdza",met:4.8},bike:{name:"Bicykel",met:6},run:{name:"Beh",met:8}};
const DEFAULT={profile:{weight:94,height:189,target:88,age:22,sex:"male",activity:1.2,rate:.3,mode:"lose",lossTarget:88},foods:[],weights:[],workouts:[]};
let state=structuredCloneSafe(DEFAULT);
let profileStore={version:1,profiles:[]},activeProfileId=null;
let selectedDay=today,foodContextMeal="ranajky",activeView="home",toastTimer,activeLookupNonce=0,lossTargetDraft=88;
let nativeStream=null,nativeTimer=null,scanSession=0,barcodeBusy=false,frameInFlight=false;
let cameraDevices=[],cameraIndex=0,requestedDeviceId=null,scanStartedAt=0,scanAttempts=0;
let nativeDetector=null,zxingPromise=null,zxingReady=false,photoProcessing=false;
const frameCanvas=document.createElement("canvas");
const frameContext=frameCanvas.getContext("2d",{willReadFrequently:true});
const BARCODE_FORMATS=["EAN13","EAN8","UPCA","UPCE","Code128","Code39","ITF"];
const LIB_VERSION="3.1.6";

/* Nutričné údaje všeobecných jedál sú orientačné na 100 g/ml.
   Veľkosť porcie nie je univerzálna: používateľ ju vždy môže upraviť. */
const COMMON_FOODS=[
 ...(Array.isArray(window.SLOVAK_FOODS)?window.SLOVAK_FOODS:[]),

 // HOTOVÉ JEDLÁ: hrubé orientačné hodnoty hotového jedla na 100 g.
 // Pri tikka masale existujú napr. balené varianty 130–173 kcal/100g s ryžou,
 // alebo 156 kcal/100g bez ryže. Reštauračná porcia môže mať celkom iné hodnoty.
 // Pri zložitejších pokrmoch nejde o laboratórne overené údaje konkrétneho receptu.
 {key:"tikka_rice",dish:true,name:"Chicken tikka masala s ryžou",aliases:["tikka masala","tikku masalu","tikka","chicken tikka","chicken tikka masala","tikka s ryzou","tikka masala s ryzou","tiku masalu","tikamasala","masala s ryzou"],unit:"g",portion:450,kcal:150,protein:8,carbs:16,fat:6,sugar:2.5,fiber:1.3},
 {key:"tikka_no_rice",dish:true,name:"Chicken tikka masala bez ryže",aliases:["tikka bez ryze","tikka masala bez ryze","tikka bez prilohy","masala bez ryze","curry bez ryze"],unit:"g",portion:300,kcal:156,protein:12,carbs:4.9,fat:9.8,sugar:3.6,fiber:1.4},
 {key:"spaghetti_bolo",dish:true,name:"Špagety bolognese (s omáčkou)",aliases:["spagety bolognese","spagety bolonske","spaghetti bolognese","boloňské špagety","bolonske spagety","bolognese","bolonske"],unit:"g",portion:400,kcal:160,protein:8,carbs:19,fat:6,sugar:3,fiber:1.5},
 {key:"pizza_margherita",dish:true,name:"Pizza Margherita (celá)",aliases:["pizza","pizza margherita","margherita","pica"],unit:"g",portion:350,kcal:250,protein:10,carbs:30,fat:10,sugar:3,fiber:1.8},
 {key:"chicken_rice",dish:true,name:"Kuracie prsia s ryžou (bez omáčky)",aliases:["kuracie s ryzou","kuracie prsia ryza","kuracie maso s ryzou","kuracie s ryzou","chicken rice"],unit:"g",portion:400,kcal:140,protein:16,carbs:16,fat:1.5,sugar:0.2,fiber:0.5},
 {key:"chicken_curry",dish:true,name:"Kuracie kari s ryžou",aliases:["kuracie kari","kuracie curry","chicken curry","curry s ryzou","kari s ryzou"],unit:"g",portion:450,kcal:155,protein:8,carbs:17,fat:6,sugar:2.5,fiber:1.2},
 {key:"risotto",dish:true,name:"Kuracie rizoto",aliases:["rizoto","kuracie rizoto","risotto","ryzove rizoto"],unit:"g",portion:400,kcal:155,protein:9,carbs:18,fat:5,sugar:1.4,fiber:1},
 {key:"schnitzel_potatoes",dish:true,name:"Kurací rezeň so zemiakmi",aliases:["rezen so zemiakmi","kuraci rezen","rezen","schnitzel"],unit:"g",portion:420,kcal:190,protein:10,carbs:20,fat:8,sugar:1.4,fiber:1.5},
 {key:"sushi",dish:true,name:"Sushi maki mix",aliases:["sushi","maki","sushi mix"],unit:"g",portion:300,kcal:160,protein:6,carbs:28,fat:2.5,sugar:2.5,fiber:0.8},
 {key:"bryndza",dish:true,name:"Bryndzové halušky",aliases:["bryndzove halusky","halusky","bryndza halusky"],unit:"g",portion:400,kcal:245,protein:7,carbs:31,fat:10,sugar:1.4,fiber:1},
 {key:"goulash",dish:true,name:"Hovädzí guláš s knedľou",aliases:["gulas s knedlou","hovadzi gulas","gulas","guláš","goulash"],unit:"g",portion:450,kcal:175,protein:8,carbs:20,fat:7,sugar:2,fiber:1.5},
 {key:"caesar",dish:true,name:"Caesar šalát s kuracím mäsom",aliases:["cezar salat","caesar salat","caesar","cezar","caesar salad"],unit:"g",portion:350,kcal:170,protein:12,carbs:8,fat:10,sugar:1.8,fiber:2},
 {key:"fried_cheese",dish:true,name:"Vyprážaný syr s hranolkami",aliases:["vyprazany syr hranolky","syr s hranolkami","vyprazany syr","vyprazak"],unit:"g",portion:420,kcal:285,protein:12,carbs:25,fat:15,sugar:2,fiber:2},
 // Všeobecné potraviny: orientačné nutričné hodnoty (na 100 g/100 ml), nie náhrada etikety.
 {key:"whey",name:"Proteínový prášok (whey), s vodou",aliases:["protein","proteín","proteinovy prasok","proteínový prášok","whey","whey protein","protein prach","srvátkový proteín","protein powder"],unit:"g",portion:30,kcal:395,protein:78,carbs:7,fat:6,sugar:4,fiber:0},
 {key:"protein_drink",name:"Proteínový nápoj z prášku a vody",aliases:["protein drink","proteinovy napoj","proteínový nápoj","protein shake","proteínový šejk","protein sejk","proteinovy shake"],unit:"ml",portion:300,kcal:40,protein:7.8,carbs:0.7,fat:0.6,sugar:0.4,fiber:0},
 {key:"protein_bar",name:"Proteínová tyčinka (odhad)",aliases:["proteinova tycinka","proteínová tyčinka","protein bar","protein tycinka","proteinka"],unit:"g",portion:55,kcal:380,protein:30,carbs:35,fat:12,sugar:5,fiber:10},
 {key:"protein_pudding",name:"Proteínový puding (odhad)",aliases:["proteinovy puding","proteínový puding","protein pudding","proteín puding","protein dessert"],unit:"g",portion:200,kcal:75,protein:10,carbs:6,fat:1,sugar:4,fiber:0},
 {key:"skyr",name:"Skyr biely",aliases:["skyr","islandsky jogurt","skyr biely","proteinovy jogurt"],unit:"g",portion:150,kcal:61,protein:11,carbs:4,fat:0.2,sugar:4,fiber:0},
 {key:"curd",name:"Tvaroh nízkotučný",aliases:["tvaroh","tvaroh nizkotucny","nizkotucny tvaroh","cottage tvaroh"],unit:"g",portion:150,kcal:72,protein:12,carbs:4,fat:0.5,sugar:3.8,fiber:0},
 {key:"cottage",name:"Cottage cheese",aliases:["cottage","cottage cheese","zrnkavy syr","zrnkavy tvaroh"],unit:"g",portion:150,kcal:98,protein:12,carbs:3,fat:4.5,sugar:2.5,fiber:0},
 {key:"yogurt",name:"Biely jogurt (3 % tuku)",aliases:["jogurt","jogurt biely","biely jogurt","yogurt"],unit:"g",portion:150,kcal:63,protein:3.8,carbs:4.7,fat:3.1,sugar:4.7,fiber:0},
 {key:"greek",name:"Grécky jogurt 0 % tuku",aliases:["grecky jogurt","grécky jogurt","greek yogurt"],unit:"g",portion:150,kcal:59,protein:10.3,carbs:3.6,fat:0.4,sugar:3.6,fiber:0},
 {key:"potato",name:"Zemiaky varené",aliases:["zemiaky","varene zemiaky","zemiak","potatoes"],unit:"g",portion:200,kcal:86,protein:1.8,carbs:20,fat:0.1,sugar:0.9,fiber:1.8},
 {key:"pasta",name:"Cestoviny varené",aliases:["cestoviny","spagety","spaghetti","pasta"],unit:"g",portion:200,kcal:157,protein:5.8,carbs:30.9,fat:0.9,sugar:0.6,fiber:1.8},
 {key:"salmon",name:"Losos pečený bez oleja",aliases:["losos","salmon","peceny losos"],unit:"g",portion:150,kcal:206,protein:22,carbs:0,fat:12.4,sugar:0,fiber:0},
 {key:"cheese",name:"Eidam 30 % tuku v sušine",aliases:["eidam","syr","syr eidam","cheese"],unit:"g",portion:30,kcal:263,protein:29,carbs:1,fat:16,sugar:0.5,fiber:0},
 {key:"butter",name:"Maslo",aliases:["maslo","butter"],unit:"g",portion:10,kcal:717,protein:0.9,carbs:0.1,fat:81,sugar:0.1,fiber:0},
 {key:"oliveoil",name:"Olivový olej",aliases:["olivovy olej","olej","olive oil"],unit:"g",portion:10,kcal:884,protein:0,carbs:0,fat:100,sugar:0,fiber:0},
 {key:"strawberry",name:"Jahody",aliases:["jahody","jahoda","strawberry"],unit:"g",portion:150,kcal:32,protein:0.7,carbs:7.7,fat:0.3,sugar:4.9,fiber:2},
 {key:"cappuccino",name:"Cappuccino s polotučným mliekom, bez cukru",aliases:["cappuccino","cappucino","capucino","kapucino","kapuccino","capu","kava s mliekom"],unit:"ml",portion:180,kcal:42,protein:2.5,carbs:3.8,fat:1.9,sugar:3.8,fiber:0},
 {key:"latte",name:"Caffè latte s polotučným mliekom, bez cukru",aliases:["latte","cafe latte","caffe latte","mliecna kava"],unit:"ml",portion:250,kcal:46,protein:3,carbs:4.6,fat:1.8,sugar:4.5,fiber:0},
 {key:"espresso",name:"Espresso bez cukru",aliases:["espresso","expresso","presso"],unit:"ml",portion:30,kcal:3,protein:0.2,carbs:0.5,fat:0,sugar:0,fiber:0},
 {key:"coffee",name:"Čierna káva bez cukru",aliases:["cierna kava","kava bez cukru","coffee","americano","kafe"],unit:"ml",portion:200,kcal:2,protein:0.3,carbs:0,fat:0,sugar:0,fiber:0},
 {key:"tea",name:"Čaj bez cukru",aliases:["caj","tea","caj bez cukru"],unit:"ml",portion:250,kcal:1,protein:0,carbs:0.2,fat:0,sugar:0,fiber:0},
 {key:"water",name:"Voda",aliases:["voda","water","mineralka"],unit:"ml",portion:250,kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0},
 {key:"milk",name:"Polotučné mlieko (1,5 %)",aliases:["mlieko","milk","polotucne"],unit:"ml",portion:250,kcal:47,protein:3.4,carbs:4.8,fat:1.5,sugar:4.8,fiber:0},
 {key:"juice",name:"Pomarančový džús",aliases:["pomarancovy dzus","dzus","orange juice"],unit:"ml",portion:200,kcal:45,protein:0.7,carbs:10.4,fat:0.2,sugar:8.4,fiber:0.2},
 {key:"banana",name:"Banán (jedlá časť)",aliases:["banan","banana"],unit:"g",portion:120,kcal:89,protein:1.1,carbs:22.8,fat:0.3,sugar:12.2,fiber:2.6},
 {key:"apple",name:"Jablko",aliases:["jablko","apple"],unit:"g",portion:160,kcal:52,protein:0.3,carbs:13.8,fat:0.2,sugar:10.4,fiber:2.4},
 {key:"egg",name:"Vajce uvarené",aliases:["vajce","vajicko","egg"],unit:"g",portion:55,kcal:155,protein:12.6,carbs:1.1,fat:10.6,sugar:1.1,fiber:0},
 {key:"rice",name:"Ryža uvarená",aliases:["ryza","rice"],unit:"g",portion:180,kcal:130,protein:2.7,carbs:28.2,fat:0.3,sugar:0.1,fiber:0.4},
 {key:"oats",name:"Ovsené vločky suché",aliases:["ovsene vlocky","vlocky","oats"],unit:"g",portion:50,kcal:379,protein:13.2,carbs:67.7,fat:6.5,sugar:1,fiber:10.1},
 {key:"chicken",name:"Kuracie prsia tepelne upravené",aliases:["kuracie","kuracie prsia","chicken"],unit:"g",portion:150,kcal:165,protein:31,carbs:0,fat:3.6,sugar:0,fiber:0},
 {key:"bread",name:"Chlieb pšenično-ražný",aliases:["chlieb","bread"],unit:"g",portion:40,kcal:240,protein:8,carbs:47,fat:2,sugar:3,fiber:5},
 {"key":"roll","name":"Biely rožok (bežný)","aliases":["rožok","rozok","rožky","rozky","biely rozok","biely rožok","rohlik","rohlík","pecivo"],"unit":"g","portion":50,"kcal":286,"protein":9,"carbs":55,"fat":3,"sugar":1,"fiber":2,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/rozok-biely","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Rohl%C3%ADk%20b%C3%ADl%C3%BD%20tukov%C3%BD.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Rohl%C3%ADk%20b%C3%ADl%C3%BD%20tukov%C3%BD.jpg"},
 {"key":"roll_whole_lidl","name":"Celozrnný rožok Lidl","aliases":["celozrnny rozok","celozrnný rožok","rozok celozrnny lidl","pecivo lidl"],"unit":"g","portion":60,"kcal":307,"protein":9.3,"carbs":51,"fat":6.2,"sugar":4.9,"fiber":3.7,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/celozrnny-rozok-lidl"},
 {"key":"kaiser_cereal_lidl","name":"Kaiserka cereálna Lidl","aliases":["kaiserka","kajzerka","cerealna kaiserka","cerealna kajzerka","pecivo lidl"],"unit":"g","portion":60,"kcal":293,"protein":10.8,"carbs":46,"fat":5.4,"sugar":5.3,"fiber":7.8,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/kaiserka-cerealna-lidl-60g-1","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Home-baked%20breadrolls.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Home-baked%20breadrolls.jpg"},
 {"key":"bun_mountain_lidl","name":"Horská žemľa Lidl","aliases":["horska zemla","zemla","žemľa","pecivo lidl"],"unit":"g","portion":80,"kcal":282,"protein":9.4,"carbs":55.9,"fat":1.1,"sugar":3.6,"fiber":3.8,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/horska-zemla-lidl","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Home-baked%20breadrolls.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Home-baked%20breadrolls.jpg"},
 {"key":"bun_fitness_lidl","name":"Fitness žemľa Lidl","aliases":["fitness zemla","fitness žemľa","fit zemla","pecivo lidl"],"unit":"g","portion":70,"kcal":284,"protein":10,"carbs":49,"fat":3.9,"sugar":2.2,"fiber":4.6,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/fitness-zemla-lidl","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Home-baked%20breadrolls.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Home-baked%20breadrolls.jpg"},
 {"key":"bun_protein_lidl","name":"Proteínová žemľa Lidl","aliases":["proteinova zemla","proteínová žemľa","pecivo lidl"],"unit":"g","portion":70,"kcal":274,"protein":22.6,"carbs":8.8,"fat":13.9,"sugar":2.1,"fiber":11.4,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/proteinova-zemla-lidl"},
 {"key":"bun_spelt_lidl","name":"Žemľa špaldová Lidl","aliases":["spaldova zemla","špaldová žemľa","spaldova kaiserka","pecivo lidl"],"unit":"g","portion":70,"kcal":288,"protein":10.4,"carbs":44.2,"fat":5.9,"sugar":2.6,"fiber":7.4,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/spaldova-kaiserka-lidl","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Home-baked%20breadrolls.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Home-baked%20breadrolls.jpg"},
 {"key":"kornbaguette_lidl","name":"Kornbageta Lidl","aliases":["kornbageta","korn bageta","pecivo lidl"],"unit":"g","portion":90,"kcal":303,"protein":10,"carbs":53,"fat":3.8,"sugar":2,"fiber":5.5,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/kornbageta-lidl","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Baguette-246424.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Baguette-246424.jpg"},
 {"key":"croissant_butter_lidl","name":"Maslový croissant Lidl","aliases":["croissant","krosan","maslovy croissant","pecivo lidl"],"unit":"g","portion":60,"kcal":394,"protein":6.7,"carbs":40,"fat":23.3,"sugar":5,"fiber":1.5,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/maslovy-croissant-lidl","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Croissant%20bread.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Croissant%20bread.jpg"},
 {"key":"pretzel_lidl","name":"Praclík Lidl","aliases":["praclik","praclík","brezel","preclik","pecivo lidl"],"unit":"g","portion":80,"kcal":291,"protein":9.1,"carbs":54.2,"fat":3.5,"sugar":3.7,"fiber":3.1,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/praclik-lidl","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Mini%20pretzel.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Mini%20pretzel.jpg"},
 {"key":"baguette_plain","name":"Bageta biela (bežná)","aliases":["bageta","biela bageta","bageta biela","baguette"],"unit":"g","portion":100,"kcal":301,"protein":7.8,"carbs":60,"fat":2.9,"sugar":1.4,"fiber":2.5,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/bageta-biela","image":"https://commons.wikimedia.org/wiki/Special:FilePath/Baguette-246424.jpg?width=320","imageCredit":"Wikimedia Commons (CC0)","imageCreditUrl":"https://commons.wikimedia.org/wiki/File:Baguette-246424.jpg"},
 {"key":"pizza_pocket_lidl","name":"Pizza taštička Lidl","aliases":["pizza tasticka","pizza taštička","pecivo lidl"],"unit":"g","portion":100,"kcal":258,"protein":6.6,"carbs":27.4,"fat":13.1,"sugar":2.3,"fiber":2.2,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/pizza_tasticka"},
 {"key":"chocolate_milk","name":"Mliečna čokoláda (orientačne, podľa M&S)","aliases":["coko","čoko","cokolada","čokoláda","mliecna cokolada","mliecna coko","chocolate","coko milka"],"unit":"g","portion":25,"kcal":566,"protein":7.2,"carbs":51,"fat":36.8,"sugar":50,"fiber":2.1,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/cokolada-mliecna"},
 {"key":"chocolate_dark","name":"Horká čokoláda (bežná)","aliases":["coko","čoko","horka cokolada","tmava cokolada","dark chocolate","cokolada horka"],"unit":"g","portion":25,"kcal":542,"protein":4.38,"carbs":58.56,"fat":32.32,"sugar":47,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/cokolada-horka"},
 {"key":"chocolate_lidl_52","name":"Fin Carré horká čokoláda 52 % Lidl","aliases":["coko","čoko","cokolada lidl","fincare","fin carre","horka cokolada lidl"],"unit":"g","portion":25,"kcal":540,"protein":4.9,"carbs":48,"fat":35,"sugar":46,"fiber":8,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/cokolada-horka-52-lidl"},
 {"key":"cocoa_powder","name":"Kakao (nesladené)","aliases":["kakao","coko","čoko","kakaovy prasok","cocoa powder","kakaovy napoj bez cukru"],"unit":"g","portion":10,"kcal":305,"protein":21,"carbs":12.3,"fat":11.8,"sugar":0.5,"fiber":34.6,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/kakao"},
 {"key":"vg_nutty","name":"Veiny Galaxy Whey Nutty Cream","aliases":["veiny galaxy Nutty Cream","veiny Nutty Cream","veiny galaxy protein Nutty Cream","vg Nutty Cream","veinygalaxy Nutty Cream"],"unit":"g","portion":25,"kcal":408,"protein":74.3,"carbs":13.7,"fat":5.9,"sugar":6.7,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-nutty-cream-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","image":"https://www.nutriland.ro/cdn/shop/files/protein-wpc-80-1kg-pudra-veiny-galaxy-concentrat-proteic-din-zerproteinenutriland-6305690.jpg?v=1781698457&width=480","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.nutriland.ro/products/protein-wpc-80-1kg-pudra-veiny-galaxy-supliment-alimentar-de-tip-concentrat-proteic-din-zer","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_caramel_biscuit","name":"Veiny Galaxy Whey Caramel Biscuit","aliases":["veiny galaxy Caramel Biscuit","veiny Caramel Biscuit","veiny galaxy protein Caramel Biscuit","vg Caramel Biscuit","veinygalaxy Caramel Biscuit"],"unit":"g","portion":25,"kcal":399,"protein":73,"carbs":12.7,"fat":5.8,"sugar":5.2,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-caramel-biscuit-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","image":"https://www.nutriland.ro/cdn/shop/files/Caramel_Biscuit-3.jpg?v=1779092700&width=480","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.nutriland.ro/products/protein-wpc-80-1kg-pudra-veiny-galaxy-supliment-alimentar-de-tip-concentrat-proteic-din-zer","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_melted","name":"Veiny Galaxy Whey Melted Chocolate","aliases":["veiny galaxy Melted Chocolate","veiny Melted Chocolate","veiny galaxy protein Melted Chocolate","vg Melted Chocolate","veinygalaxy Melted Chocolate"],"unit":"g","portion":25,"kcal":413,"protein":76.5,"carbs":9.5,"fat":7.3,"sugar":4.8,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-melted-chocolate-veiny-galaxy-1","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","image":"https://www.kaloricketabulky.sk/file/image/foodstuff/d1ebbe804ccf4e4ea05177d50f8ba667/6dc177f1fca44cf7ad2de8827fb81fcd","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-melted-chocolate-veiny-galaxy-1","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_black_biscuit","name":"Veiny Galaxy Whey Black Biscuit Milkshake","aliases":["veiny galaxy Black Biscuit Milkshake","veiny Black Biscuit Milkshake","veiny galaxy protein Black Biscuit Milkshake","vg Black Biscuit Milkshake","veinygalaxy Black Biscuit Milkshake"],"unit":"g","portion":25,"kcal":437,"protein":78.02,"carbs":12.49,"fat":7.8,"sugar":9.05,"fiber":0.13,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-black-biscuit-milkshake-flavour-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_milky_bueno","name":"Veiny Galaxy Whey Milky Bueno","aliases":["veiny galaxy Milky Bueno","veiny Milky Bueno","veiny galaxy protein Milky Bueno","vg Milky Bueno","veinygalaxy Milky Bueno"],"unit":"g","portion":25,"kcal":428,"protein":71.6,"carbs":23,"fat":10.6,"sugar":13.3,"fiber":1,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-milky-bueno-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_vanilla","name":"Veiny Galaxy Whey Vanilla","aliases":["veiny galaxy Vanilla","veiny Vanilla","veiny galaxy protein Vanilla","vg Vanilla","veinygalaxy Vanilla"],"unit":"g","portion":25,"kcal":406,"protein":77.3,"carbs":8.8,"fat":6.4,"sugar":4.8,"fiber":0,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-vanilla-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_choco_banana","name":"Veiny Galaxy Whey Choco-Banana","aliases":["veiny galaxy Choco-Banana","veiny Choco-Banana","veiny galaxy protein Choco-Banana","vg Choco-Banana","veinygalaxy Choco-Banana"],"unit":"g","portion":25,"kcal":411,"protein":77.5,"carbs":8.6,"fat":6.8,"sugar":5.8,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-choco-banana-veiny-galaxy-1","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_apple_pie","name":"Veiny Galaxy Whey Apple Pie","aliases":["veiny galaxy Apple Pie","veiny Apple Pie","veiny galaxy protein Apple Pie","vg Apple Pie","veinygalaxy Apple Pie"],"unit":"g","portion":25,"kcal":396,"protein":71.43,"carbs":18.86,"fat":9.34,"sugar":null,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/whey-protein-apple-pie-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","image":"https://www.tablycjakalorijnosti.com.ua/file/image/foodstuff/a91f176243ef4e7bb60d097c1816b649/109bd2cd97124550b371b6f61f17b0f7","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.tablycjakalorijnosti.com.ua/stravy/whey-protein-apple-pie-veiny-galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_iso_apple_pie","name":"Veiny Galaxy Whey ISO-Whey Apple Pie","aliases":["veiny galaxy ISO-Whey Apple Pie","veiny ISO-Whey Apple Pie","veiny galaxy protein ISO-Whey Apple Pie","vg ISO-Whey Apple Pie","veinygalaxy ISO-Whey Apple Pie"],"unit":"g","portion":25,"kcal":369,"protein":85,"carbs":2.4,"fat":1.5,"sugar":2,"fiber":null,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/iso-whey-protein-apple-pie-lactose-free-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","image":"https://alienvgalaxy.pl/cdn/shop/files/iso_apple_pie.jpg?v=1762897587&width=1024","imageCredit":"Fotografia produktu","imageCreditUrl":"https://alienvgalaxy.pl/products/iso-whey-protein-1kg","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_iso_melted","name":"Veiny Galaxy Whey ISO-Whey Melted Chocolate","aliases":["veiny galaxy ISO-Whey Melted Chocolate","veiny ISO-Whey Melted Chocolate","veiny galaxy protein ISO-Whey Melted Chocolate","vg ISO-Whey Melted Chocolate","veinygalaxy ISO-Whey Melted Chocolate"],"unit":"g","portion":25,"kcal":369,"protein":85,"carbs":2.4,"fat":1.5,"sugar":2,"fiber":0,"sourceUrl":"https://www.kaloricketabulky.sk/potraviny/iso-whey-protein-melted-chocolate-veiny-galaxy","sourceLabel":"KalorickéTabuľky.sk","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_nougat_cake","name":"Veiny Galaxy Whey Creamy Nougat Birthday Cake","aliases":["veiny galaxy Creamy Nougat Birthday Cake","veiny Creamy Nougat Birthday Cake","veiny galaxy protein Creamy Nougat Birthday Cake","vg Creamy Nougat Birthday Cake","veinygalaxy Creamy Nougat Birthday Cake"],"unit":"g","portion":25,"kcal":421.71,"protein":77.6,"carbs":10.32,"fat":7.3,"sugar":8.01,"fiber":null,"sourceUrl":"https://veinygalaxy.shop/produkt/protein-1kg-limitovana-edicia/","sourceLabel":"Výrobca Veiny Galaxy","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vg_white_toffee","name":"Veiny Galaxy Whey White Choco Toffee Madness","aliases":["veiny galaxy White Choco Toffee Madness","veiny White Choco Toffee Madness","veiny galaxy protein White Choco Toffee Madness","vg White Choco Toffee Madness","veinygalaxy White Choco Toffee Madness"],"unit":"g","portion":25,"kcal":431.59,"protein":77.61,"carbs":12.68,"fat":7.3,"sugar":8.16,"fiber":0.25,"sourceUrl":"https://veinygalaxy.shop/en/produkt/protein-1kg-limited-edition-2/","sourceLabel":"Výrobca Veiny Galaxy","brand":"Veiny Galaxy","nutritionNote":"Suchý proteínový prášok bez mlieka. Porciu uprav podľa odmerky."},
 {"key":"vox_vanilla","name":"Voxberg Whey 100 Vanilka","aliases":["voxberg Vanilka","voxberg whey Vanilka","voxberg protein Vanilka","vox Vanilka","voxberrg Vanilka","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":412,"protein":82,"carbs":0.5,"fat":8.9,"sugar":0.5,"fiber":0.9,"sourceUrl":"https://www.drmax.sk/protein-whey-100-vanilla-voxberg","sourceLabel":"Dr. Max (etiketa)","brand":"Voxberg","code":"8588006050530","image":"https://cdn.najsport.cloud/buxus/images/cache/og_image/fotogaleria/katalog_produktov/vyzivove_doplnky/proteiny/voxberg/voxberg_whey_100_990g/protein_voxberg_whey_100_vanilka_990g/voxberg_vanilka.png","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.najsport.sk/protein-voxberg-whey-100-vanilka-990g","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."},
 {"key":"vox_chocolate","name":"Voxberg Whey 100 Čokoláda","aliases":["voxberg Čokoláda","voxberg whey Čokoláda","voxberg protein Čokoláda","vox Čokoláda","voxberrg Čokoláda","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":405,"protein":77,"carbs":1.5,"fat":9.1,"sugar":0.5,"fiber":4.3,"sourceUrl":"https://www.drmax.sk/protein-whey-100-cokolada-voxberg","sourceLabel":"Dr. Max (etiketa)","brand":"Voxberg","code":"8588006050547","image":"https://static-new.kosik.sk/k3wCdnContainerk3w-static-ne-sk-prod/images/thumbs/g1/500x500x1_g13qoztkccwq.png","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.kosik.sk/p40604-voxberg-whey-100-chocolate","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."},
 {"key":"vox_salted","name":"Voxberg Whey 100 Slaný karamel","aliases":["voxberg Slaný karamel","voxberg whey Slaný karamel","voxberg protein Slaný karamel","vox Slaný karamel","voxberrg Slaný karamel","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":406,"protein":81,"carbs":0.5,"fat":8.7,"sugar":0.5,"fiber":0.9,"sourceUrl":"https://www.drmax.sk/protein-whey-100-slany-karamel-voxberg-x030772","sourceLabel":"Dr. Max (etiketa)","brand":"Voxberg","code":"8588006050912","image":"https://static-new.kosik.sk/k3wCdnContainerk3w-static-ne-sk-prod/images/thumbs/iz/500x500x1_izfyjzn6kxof.png","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.kosik.sk/p40608-voxberg-whey-100-salted-caramel","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."},
 {"key":"vox_choco_banana","name":"Voxberg Whey 100 Čokoláda & banán","aliases":["voxberg Čokoláda & banán","voxberg whey Čokoláda & banán","voxberg protein Čokoláda & banán","vox Čokoláda & banán","voxberrg Čokoláda & banán","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":406,"protein":76,"carbs":1.5,"fat":9,"sugar":0.5,"fiber":4.3,"sourceUrl":"https://www.drmax.sk/protein-whey-100-cokolada-a-banan-voxberg","sourceLabel":"Dr. Max (etiketa)","brand":"Voxberg","code":"8588006050554","image":"https://pilulkacz.vshcdn.net/zoh4eiLi/IMG/86400/s2dAVCOxQjgG0-g3x0-n6euyfU2dbio__YEi2PUBh_c/trim%3A0%3Affffff%2Cff00ff/aHR0cHM6Ly9waWx1bGthLnMzLWNlbnRyYWwudnNob3N0aW5nLmNsb3VkL3BpbHVsa2EtY3ovZmlsZXMvaW1hZ2VzLzIwMjUtMDgvbWRfMzJiYzljM2NkM2EwOTEwMzI5MjIzM2U2NmY3NDdkNDkucG5n.png","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.pilulka.cz/voxberg-protein-whey-100-cokolada-a-banan-990-g","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."},
 {"key":"vox_coffee","name":"Voxberg Whey 100 Ľadová káva","aliases":["voxberg Ľadová káva","voxberg whey Ľadová káva","voxberg protein Ľadová káva","vox Ľadová káva","voxberrg Ľadová káva","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":419,"protein":83,"carbs":1,"fat":8.9,"sugar":0.5,"fiber":1.2,"sourceUrl":"https://www.drmax.sk/voxberg-protein-whey-100-ladova-kava","sourceLabel":"Dr. Max (etiketa)","brand":"Voxberg","code":"8588006050585","image":"https://images-lunys-cdn.rshop.sk/prod-lightbox/products/80abef87fac70dfab50aab7da834ac5e.jpg","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.lunys.sk/protein-whey-100-ladova-kava-990g-voxberg-p480885","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."},
 {"key":"vox_raspberry","name":"Voxberg Whey 100 Biela čokoláda & malina","aliases":["voxberg Biela čokoláda & malina","voxberg whey Biela čokoláda & malina","voxberg protein Biela čokoláda & malina","vox Biela čokoláda & malina","voxberrg Biela čokoláda & malina","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":413,"protein":82,"carbs":0.7,"fat":8.9,"sugar":0.7,"fiber":0.9,"sourceUrl":"https://www.drmax.sk/voxberg-protein-whey-100-biela-cokolada-malina","sourceLabel":"Dr. Max (etiketa)","brand":"Voxberg","code":"8588006050578","image":"https://cdn.notinoimg.com/detail_main_mq/voxberg/8588006050578_01-o/whey-protein-100___250624.jpg","imageCredit":"Fotografia produktu","imageCreditUrl":"https://www.notino.cz/voxberg/whey-protein-100-syrovatkovy-protein-bez-laktozy/","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."},
 {"key":"vox_cinnamon","name":"Voxberg Whey 100 Škorica","aliases":["voxberg Škorica","voxberg whey Škorica","voxberg protein Škorica","vox Škorica","voxberrg Škorica","voxberg","voxberrg"],"unit":"g","portion":30,"kcal":363,"protein":71,"carbs":5.3,"fat":5.8,"sugar":2.7,"fiber":2.6,"sourceUrl":"https://idemnanakup.sk/product/specialna-vyziva-diety-a-doplnky-stravy/sportova-a-fitness-vyziva/proteinove-prasky/voxberg-protein-whey-100-bielkovinovy-prasok-prichut-skorica-13-x-390-g","sourceLabel":"idemnanakup.sk (etiketa)","brand":"Voxberg","nutritionNote":"Suchý proteínový prášok bez mlieka. Receptúra môže závisieť od príchute."}
];
let suggestions=[],suggestionCursor=-1,searchTimer=null,searchAbort=null,searchGeneration=0,searchNetworkHistory=[],lastSearchAt=0,selectedFoodName="";
let recentQuickFoods=[],activeDishPortion=null;
const searchCache=new Map();
const FOOD_SEARCH_CACHE_KEY="forma-off-search-cache-v2";
const FOOD_SEARCH_CACHE_TTL_MS=7*24*60*60*1000;
let remoteSearchPauseUntil=0;
function getCachedFoodSearch(query){
 const item=searchCache.get(query);
 if(item&&Date.now()-item.ts<(item.products.length?FOOD_SEARCH_CACHE_TTL_MS:5*60*1000))return item.products;
 return null;
}
function rememberFoodSearch(query,products){
 searchCache.set(query,{ts:Date.now(),products});
 const recent=[...searchCache.entries()].filter(([q,v])=>q.length<100&&Date.now()-v.ts<FOOD_SEARCH_CACHE_TTL_MS).slice(-50);
 try{localStorage.setItem(FOOD_SEARCH_CACHE_KEY,JSON.stringify(recent))}catch(e){console.warn("Vyhľadávacia cache:",e)}
}
try{
 const entries=JSON.parse(localStorage.getItem(FOOD_SEARCH_CACHE_KEY)||"[]");
 if(Array.isArray(entries))for(const [q,v] of entries.slice(-50)){
  if(typeof q==="string"&&v&&Array.isArray(v.products)&&Number.isFinite(v.ts)&&Date.now()-v.ts<FOOD_SEARCH_CACHE_TTL_MS){
   searchCache.set(q,{ts:v.ts,products:v.products.slice(0,6)});
  }
 }
}catch(e){console.warn("Cache produktov sa nepodarilo načítať:",e)}

function findKnownProducts(query){
 const q=normalizeTerm(query);
 if(q.length<2)return [];
 const pool=new Map();
 const consider=(item,priority=0)=>{
  if(!item||!item.name||item.kcal===null||item.kcal===undefined)return;
  const text=normalizeTerm(item.name+" "+(item.brand||""));
  const name=normalizeTerm(item.name);
  const words=q.split(" ");
  if(!words.every(word=>text.includes(word)))return;
  const score=(name===q?500:name.startsWith(q)?300:text.includes(q)?150:80)+priority;
  const key=item.code||item.id||name;
  if(!pool.has(key)||pool.get(key).score<score)pool.set(key,{item,score});
 };
 for(const [cachedQuery,v] of searchCache){
  if(Date.now()-v.ts>FOOD_SEARCH_CACHE_TTL_MS)continue;
  for(const item of v.products)consider(item,normalizeTerm(cachedQuery)===q?100:0);
 }
 for(const f of state.foods.slice(-120)){
  const factor=f.grams?100/f.grams:1;
  consider({id:"recent:"+f.id,source:"recent",name:f.name,brand:"Tvoj jedálniček",unit:f.unit||"g",portion:f.grams,code:f.code||"",image:safeFoodImage(f.image),kcal:round(f.kcal*factor),protein:round(f.protein*factor),carbs:round(f.carbs*factor),fat:round(f.fat*factor),sugar:round(f.sugar*factor),fiber:f.fiber===null?null:round(f.fiber*factor)},50);
 }
 return [...pool.values()].sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.item);
}
function normalizeTerm(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}
function setFoodPortion(unit="g",portion=100,note=""){
 const selected=unit==="ml"?"ml":"g";
 $("foodUnit").value=selected;$("portionUnit").textContent=selected;
 $("foodGrams").setAttribute("aria-label","Množstvo v "+(selected==="ml"?"mililitroch":"gramoch"));
 if(Number.isFinite(Number(portion))&&Number(portion)>0)$("foodGrams").value=Number(portion);
 $all("[data-grams]").forEach(button=>button.textContent=button.dataset.grams+" "+selected);
 $("portionHint").textContent=(note||"Množstvo môžeš upraviť podľa skutočnej porcie.")+(selected==="ml"?" Pri výrobkoch s údajmi na 100 g sa pri prepočte ml používa približenie 1 ml ≈ 1 g.":"");
 $("nutritionBasis").textContent=selected==="ml"?"NA 100 G (PRI ML ORIENTAČNÝ PREPOČET)":"NA 100 G";
 renderFoodPreview();
}
function safeFoodImage(url){
 if(typeof url!=="string"||!url)return "";
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||!["images.openfoodfacts.org","static.openfoodfacts.org","commons.wikimedia.org","www.nutriland.ro","www.kaloricketabulky.sk","alienvgalaxy.pl","www.tablycjakalorijnosti.com.ua","cdn.najsport.cloud","www.voxberg.com","pilulkacz.vshcdn.net","static-new.kosik.sk","www.bodyworld.eu","images-lunys-cdn.rshop.sk","cdn.notinoimg.com"].includes(parsed.hostname))return "";
  return parsed.href;
 }catch(e){return ""}
}
function pickOFFImage(product){
 const front=product?.selected_images?.front;
 const choose=variant=>{
  const languages=front?.[variant];
  if(!languages||typeof languages!=="object")return "";
  for(const lc of [product.lang,product.lc,"sk","en","fr"]){
   const url=languages?.[lc];
   if(safeFoodImage(url))return safeFoodImage(url);
  }
  return safeFoodImage(Object.values(languages).find(x=>safeFoodImage(x))||"");
 };
 return choose("small")||choose("display")||choose("thumb")||
  safeFoodImage(product.image_front_small_url)||safeFoodImage(product.image_small_url)||
  safeFoodImage(product.image_front_url)||safeFoodImage(product.image_url)||"";
}
function foodImageMarkup(url,cssClass=""){
 const safe=safeFoodImage(url);
 return safe?'<img class="'+cssClass+'" src="'+escapeHTML(safe)+'" alt="'+(safe.includes("commons.wikimedia.org")?"Ilustračná fotografia jedla":"Fotografia balenia")+'" loading="lazy" decoding="async" referrerpolicy="no-referrer">':"";
}
function setProductImage(url,name="",item=null){
 const image=safeFoodImage(url);
 const container=$("selectedProductVisual");
 container.hidden=!image;
 if(!item)setFoodNutritionSource(null);
 $("selectedProductPicture").innerHTML=foodImageMarkup(image,"selected-product-img");
 $("selectedProductLabel").textContent=name||"Vybraný výrobok";
 const illustrative=image.includes("commons.wikimedia.org");
 const isDishIllustration=illustrative&&item?.imageCategory==="dish";
 const branded=!!item?.imageCreditUrl&&!illustrative;
 $("selectedProductPhotoNote").textContent=isDishIllustration?"Ilustračná fotografia podobného jedla, recept a porcia sa môžu líšiť.":illustrative?"Ilustračná fotografia pečiva, nie konkrétny výrobok Lidl.":branded?"Fotografia konkrétnej príchute, obal sa môže meniť.":"Fotografia obalu z Open Food Facts.";
 const credit=$("selectedProductPhotoCredit");
 if(item?.imageCreditUrl){
  credit.textContent=item.imageCredit||"Wikimedia Commons";
  credit.href=item.imageCreditUrl;credit.hidden=false;
 }else{credit.hidden=true;credit.removeAttribute("href");credit.textContent="";}
}
function setFoodNutritionSource(item){
 const link=$("foodNutritionSource");
 if(item?.sourceUrl){
  link.href=item.sourceUrl;link.hidden=false;
  link.textContent="Nutričné hodnoty: "+(item.sourceLabel||"KalorickéTabuľky.sk")+" (na 100 g) ↗";
 }else{link.hidden=true;link.removeAttribute("href");link.textContent="";}
}
function bestServing(product){
 const isDrink=/\b(ml|l)\b/i.test(String(product.serving_size||""))||product.serving_quantity_unit==="ml"||product.product_quantity_unit==="ml"||/(cappuccino|latte|coffee|drink|juice|tea|kava|caj|napoj|mlieko|voda|cola)/i.test(String(product.product_name||""));
 const unit=isDrink?"ml":"g";
 const servingUnit=String(product.serving_quantity_unit||"").toLowerCase();
 const serving=Number(product.serving_quantity);
 if(validNum(serving,10,2000)&&(servingUnit===unit||!servingUnit))
  return {unit,portion:Math.round(serving),fromLabel:true};
 const raw=String(product.serving_size||"");
 const matches=[...raw.matchAll(/(\d{2,4}(?:[.,]\d+)?)\s*(ml|g)\b/gi)];
 const explicit=matches.find(m=>m[2].toLowerCase()===unit);
 if(explicit){const portion=Number(explicit[1].replace(",","."));if(validNum(portion,10,2000))return {unit,portion:Math.round(portion),fromLabel:true}}
 const productQuantity=Number(product.product_quantity),productUnit=String(product.product_quantity_unit||"").toLowerCase();
 if(validNum(productQuantity,20,500)&&productUnit===unit)
  return {unit,portion:Math.round(productQuantity),fromLabel:false};
 return {unit,portion:unit==="ml"?200:100,fromLabel:false};
}
function nutritionFromOFF(p){
 const n=p.nutriments||{},value=key=>{
  const v=n[key+"_100g"];return v==null||!Number.isFinite(Number(v))?null:Number(v);
 };
 let kcal=value("energy-kcal");
 if(kcal===null){const kj=value("energy-kj");if(kj!==null)kcal=kj/4.184}
 const serving=bestServing(p);
 return {id:"off:"+String(p.code||""),source:"off",name:String(p.product_name_sk||p.product_name||p.product_name_en||"").trim(),
  brand:String(p.brands||"").trim(),code:String(p.code||""),image:pickOFFImage(p),...serving,
  kcal,protein:value("proteins"),carbs:value("carbohydrates"),fat:value("fat"),sugar:value("sugars"),fiber:value("fiber")};
}

/* Základné hodnoty orientačne na jedno veľké vajce (50 g):
   72 kcal, 6.3 g bielkovín, 0.4 g sacharidov, 4.8 g tuku, 0.2 g cukrov.
   Variabilita závisí od veľkosti vajec a tuku použitého pri príprave. */
const EGG_EXTRA_FATS={
 none:{grams:0,kcal:0,protein:0,carbs:0,fat:0,sugar:0},
 butter5:{grams:5,kcal:36,protein:0,carbs:0,fat:4.1,sugar:0},
 butter10:{grams:10,kcal:72,protein:0,carbs:0,fat:8.1,sugar:0},
 oil5:{grams:5,kcal:45,protein:0,carbs:0,fat:5,sugar:0},
 oil10:{grams:10,kcal:90,protein:0,carbs:0,fat:10,sugar:0}
};
let activeEggCount=3,activeEggFat="none";
function eggFood(count=3,extra="none"){
 const eggs=Math.max(1,Math.min(8,Math.round(Number(count)||3)));
 const fat=EGG_EXTRA_FATS[extra]||EGG_EXTRA_FATS.none;
 const fatKey=Object.hasOwn(EGG_EXTRA_FATS,extra)?extra:"none";
 const portion=50*eggs+fat.grams;
 const per100=x=>round(x*100/portion);
 return {id:"recipe:eggs:"+eggs+":"+fatKey,source:"recipe",recipe:"eggs",eggCount:eggs,eggFat:fatKey,
  name:"Praženica z "+eggs+" "+(eggs===1?"vajca":eggs<5?"vajec":"vajec"),
  unit:"g",portion,
  kcal:per100(eggs*72+fat.kcal),protein:per100(eggs*6.3+fat.protein),
  carbs:per100(eggs*.4+fat.carbs),fat:per100(eggs*4.8+fat.fat),
  sugar:per100(eggs*.2+fat.sugar),fiber:0};
}
function isEggRecipeQuery(q){
 return /(?:^| )(?:prazen\w*|miesan\w* vaj\w*|michan\w* vej\w*|scrambled egg\w*|vajick\w* na panvic\w*)/.test(q);
}
function recipeEggCount(q){
 const number=q.match(/(?:^|\D)([1-8])(?=\D|$)/);
 if(number)return Number(number[1]);
 for(const [word,value] of [["jedne",1],["dvoch",2],["dve",2],["troch",3],["tri",3],["styroch",4],["styri",4],["piatich",5],["pat",5],["siestich",6],["sest",6]]){
  if(new RegExp("(?:^| )"+word+"(?: |$)").test(q))return value;
 }
 return 3;
}
function updateEggUI(item){
 const isEgg=Boolean(item?.recipe==="eggs");
 $("eggRecipe").hidden=!isEgg;
 $("amountHeading").hidden=isEgg;
 $("amountControls").hidden=isEgg;
 $("portionHint").hidden=isEgg;
 $("basicPortions").hidden=isEgg||!$("dishPortions").hidden;
 if(isEgg){
  $("dishPortions").hidden=true;
  activeEggCount=Math.max(1,Math.min(8,Number(item.eggCount)||3));
  activeEggFat=Object.hasOwn(EGG_EXTRA_FATS,item.eggFat)?item.eggFat:"none";
  $("eggFatSelect").value=activeEggFat;
  recalculateEgg();
 }
}
function recalculateEgg(){
 if($("eggRecipe").hidden)return;
 const item=eggFood(activeEggCount,activeEggFat);
 $("eggCountText").textContent=String(activeEggCount);
 $("eggCountLabel").textContent=activeEggCount===1?"vajce":activeEggCount<=4?"vajcia":"vajec";
 $("foodName").value=item.name;selectedFoodName=item.name;
 $("foodGrams").value=String(item.portion);$("foodUnit").value="g";$("foodEAN").value="";
 for(const [field,key] of [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]]){
  $(field).value=item[key];
 }
 $("foodLookupMessage").hidden=false;
 $("foodLookupMessage").classList.add("warn");
 $("foodLookupMessage").textContent="Orientačný výpočet. Chlieb, mlieko a slaninu treba zapísať osobitne.";
 $("foodSearchHelp").textContent="Počet vajec a tuk si nastav nižšie. Potom ulož.";
 renderFoodPreview();updateFoodSaveState();
}

function findCommon(query){
 const q=normalizeTerm(query);
 if(q.length<2)return [];
 if(isEggRecipeQuery(q))return [eggFood(recipeEggCount(q))];
 return COMMON_FOODS.map(item=>{
  const fields=[item.name,...item.aliases].map(normalizeTerm);
  let score=0;
  for(const text of fields){
   if(text===q)score=Math.max(score,100);
   else if(text.startsWith(q))score=Math.max(score,55);
   else if(text.includes(q))score=Math.max(score,30);
   else if(text.length>=8&&q.includes(text))score=Math.max(score,10);
  }
  return score?{...item,id:"common:"+item.key,source:item.dish?"dish":"estimate",brand:"Orientačný údaj",fromLabel:false,_searchScore:score}:null;
 }).filter(Boolean).sort((a,b)=>b._searchScore-a._searchScore).slice(0,normalizeTerm(query)==="polievka"||normalizeTerm(query)==="polievky"?30:20);
}
// Keep the picker focused on search, recent meals and four one-tap foods.
// All other items remain available through a single, optional category browser.
function resetFoodCatalog(){
 $("foodCatalog").open=false;
 $("foodCatalogCategories").hidden=false;
 $("foodCatalogActive").hidden=true;
 $all("#foodCatalogActive .quick-dishes-expand").forEach(section=>{section.open=false});
}
function showFoodCatalogCategory(id,button){
 const section=document.getElementById(id);
 if(!section||!section.classList.contains("quick-dishes-expand")||!$("foodCatalogActive").contains(section))return;
 $all("#foodCatalogActive .quick-dishes-expand").forEach(item=>{item.open=item===section});
 $("foodCatalogTitle").textContent=button.querySelector("strong")?.textContent||"Jedlá";
 $("foodCatalogCategories").hidden=true;
 $("foodCatalogActive").hidden=false;
 $("foodCatalogTitle").focus({preventScroll:true});
}
function renderQuickFoods(){
 const recent=[],seen=new Set();
 for(const f of state.foods.slice().reverse()){
  const key=normalizeTerm(f.name)+"|"+(f.unit||"g");
  if(seen.has(key)||!f.grams||!f.name)continue;
  seen.add(key);
  const factor=100/f.grams;
  recent.push({id:"recent:"+f.id,source:"recent",dish:Boolean(f.dish),name:f.name,unit:f.unit==="ml"?"ml":"g",portion:f.grams,
   code:f.code||"",image:safeFoodImage(f.image),kcal:round(f.kcal*factor),protein:round(f.protein*factor),carbs:round(f.carbs*factor),
   fat:round(f.fat*factor),sugar:round(f.sugar*factor),fiber:f.fiber===null?null:round(f.fiber*factor),recipe:f.eggCount?"eggs":null,eggCount:f.eggCount,eggFat:f.eggFat});
  if(recent.length===3)break;
 }
 recentQuickFoods=recent;
 $("recentFoods").innerHTML=recent.length?'<div class="quick-foods-label">TVOJE POSLEDNÉ JEDLÁ</div><div class="recent-chips">'+recent.map((f,i)=>
  '<button type="button" data-recent-index="'+i+'">'+escapeHTML(f.name)+'</button>').join("")+'</div>':"";
}
function updateFoodSaveState(){
 const name=$("foodName").value.trim();
 const kcal=$("fKcal").value;
 const grams=$("foodGrams").value;
 $("foodSave").disabled=!(name&&validNum(kcal,0,2000)&&validNum(grams,1,10000)&&validDate($("foodDate").value));
}
function hideFoodSuggestions(){
 clearTimeout(searchTimer);
 if(searchAbort){searchAbort.abort();searchAbort=null}
 ++searchGeneration;suggestions=[];suggestionCursor=-1;
 $("foodSuggestions").hidden=true;$("foodSuggestions").replaceChildren();
 $("foodName").setAttribute("aria-expanded","false");
}
function renderFoodSuggestions(local=[],remote=[],loading=false,error=""){
 if($("foodOverlay").hidden)return;
 const unique=new Set();suggestions=[];
 const add=(items)=>items.forEach(item=>{const id=item.id||item.name;if(!unique.has(id)){unique.add(id);suggestions.push(item)}});
 add(local);add(remote);
 const out=$("foodSuggestions");
 if(!suggestions.length&&!loading&&!error){out.hidden=true;$("foodName").setAttribute("aria-expanded","false");return}
 const row=(item,index)=>{
  const text=item.source==="recipe"?"RECEPT • zvoľ počet vajec a tuk":item.source==="dish"?(item.group==="soup"?"POLIEVKA":item.group==="main"?"DOMÁCE JEDLO":"HOTOVÉ JEDLO")+(item.sourceUrl?" • KalorickéTabuľky.sk / 100 g":" • orientačne / 100 g"):item.source==="estimate"?(item.sourceUrl?(item.brand||item.sourceLabel||"Overený zdroj")+" • na 100 g":"Odhad • bežná porcia"):item.source==="recent"?"Z posledného zápisu":"Open Food Facts"+(item.brand?" • "+item.brand:"");
  return '<button type="button" class="food-suggestion" role="option" aria-selected="false" data-suggest="'+index+'"><span class="food-suggestion-icon '+(item.source==="off"?"remote":"")+'">'+(foodImageMarkup(item.image,"food-suggestion-image")||(item.unit==="ml"?"☕":"◉"))+'</span><span class="food-suggestion-body"><span class="food-suggestion-title">'+escapeHTML(item.name)+'</span><span class="food-suggestion-meta">'+escapeHTML(text)+' · '+fmt(item.portion)+' '+item.unit+'</span></span><span class="food-suggestion-calories">'+(item.kcal==null?"Doplniť":fmt(item.kcal*item.portion/100)+" kcal")+'</span></button>';
 };
 let html="";
 const localItems=suggestions.filter(x=>x.source==="estimate"||x.source==="dish"||x.source==="recipe"),recentItems=suggestions.filter(x=>x.source==="recent"),remoteItems=suggestions.filter(x=>x.source==="off");
 if(localItems.length)html+='<div class="food-suggestions-heading">Jedlá a nápoje (orientačné údaje)</div>'+localItems.map(x=>row(x,suggestions.indexOf(x))).join("");
 if(recentItems.length)html+='<div class="food-suggestions-heading">Tvoje zapísané jedlá</div>'+recentItems.map(x=>row(x,suggestions.indexOf(x))).join("");
 if(remoteItems.length)html+='<div class="food-suggestions-heading">Konkrétne výrobky z databázy</div>'+remoteItems.map(x=>row(x,suggestions.indexOf(x))).join("");
 if(loading)html+='<div class="food-search-empty">Hľadám v online katalógu…</div>';
 if(!loading&&error)html+='<div class="food-search-empty">'+escapeHTML(error)+'</div><button type="button" class="food-search-retry" id="foodSearchRetry">Skúsiť znova vyhľadať <span>↻</span></button>';
 else if(error)html+='<div class="food-search-empty">'+escapeHTML(error)+'</div>';
 else if(!suggestions.length&&!loading)html+='<div class="food-search-empty">Nič som nenašiel. Môžeš jedlo zadať ručne.</div>';
 out.innerHTML=html;out.hidden=false;$("foodName").setAttribute("aria-expanded","true");
 suggestionCursor=-1;
}
function configureDishPortions(item){
 const isDish=Boolean(item?.dish);
 activeDishPortion=isDish?Number(item.portion)||400:null;
 $("dishPortions").hidden=!isDish;
 $("basicPortions").hidden=isDish;
 if(!isDish)return;
 const size=activeDishPortion;
 $all("[data-dish-factor]").forEach(el=>{
  const factor=Number(el.dataset.dishFactor);
  const value=Math.max(50,Math.round(size*factor/25)*25);
  el.dataset.portionGrams=String(value);
  el.querySelector("small").textContent=value+" g";
 });
 updateDishPortionButtons();
}
function updateDishPortionButtons(){
 const grams=Number($("foodGrams").value);
 $all("[data-dish-factor]").forEach(el=>
  el.classList.toggle("selected",Number(el.dataset.portionGrams)===grams));
}
function applyFoodSuggestion(item){
 if(!item)return;
 hideFoodSuggestions();
 $("foodName").value=item.name;
 $("foodEAN").value=item.code||"";
 setProductImage(item.image,item.name,item);
 setFoodNutritionSource(item);
 for(const [field,key] of [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]])
  $(field).value=item[key]===null||item[key]===undefined?"":round(item[key]);
 const note=item.dish?"Celé jedlo vrátane prílohy, ak je v názve. Hrubý odhad, gramáž môžeš upraviť.":item.fromLabel?"Porcia podľa výrobku. Ak si mal inú, zmeň množstvo.":"Bežná porcia. Môžeš ju zmeniť.";
 setFoodPortion(item.unit,item.portion,note);
 configureDishPortions(item);
 updateEggUI(item);
 const missing=["kcal","protein","carbs","fat","sugar"].filter(k=>item[k]==null);
 $("foodDetails").open=missing.length>0;
 $("foodTitle").textContent=item.source==="off"?"Zapísať výrobok":"Zapísať jedlo";
 selectedFoodName=item.name;
 $("foodSave").disabled=false;
 $("foodLookupMessage").hidden=false;
 $("foodLookupMessage").classList.toggle("warn",item.source==="estimate"||item.source==="dish"||item.source==="recipe"||missing.length>0);
 $("foodLookupMessage").textContent=missing.length?"Niektoré hodnoty produktu chýbajú. Otvorené detaily doplň z etikety.":
  item.source==="recipe"?"Počet vajec a použitý tuk sa počítajú automaticky.":item.source==="dish"?(item.nutritionNote||"Odhad pre celé jedlo. Recept, olej, smotana a príloha môžu kalórie výrazne zmeniť. Zvoľ veľkosť porcie."):item.source==="estimate"?(item.nutritionNote?item.nutritionNote:item.sourceUrl?"Na 100 g podľa uvedeného zdroja. Hmotnosť porcie je orientačná, uprav podľa kusu a over etiketu.":"Orientačné údaje. Výrobky sa môžu líšiť, najmä proteín. Skontroluj obal."):item.source==="recent"?"Načítané z tvojho predchádzajúceho zápisu.":"Výrobok z databázy. Skontroluj množstvo a obal.";
 $("foodSearchHelp").textContent=item.recipe==="eggs"?"Uprav počet vajec a tuk, potom ulož.":item.dish?"Odhad hotového jedla. Vyber veľkosť porcie a ulož.":"Jedlo vybrané. Teraz nastav množstvo a ulož.";
 $("quickFoods").hidden=true;
 renderFoodPreview();updateFoodSaveState();
}

const FORMA_FOOD_SEARCH_URL="https://forma-food-search.threadid.workers.dev/search";
const SUPPORTED_FOOD_BRANDS=new Set(["kinder","milka","alpro","oreo","nutella","ferrero","activia","actimel","lindt","danone","muller","nesquik","nestea","coca cola","pepsi","red bull","monster","haribo","proteinella","skyr"]);
function matchingFoodBrand(query){
 const q=normalizeTerm(query);
 for(const name of SUPPORTED_FOOD_BRANDS){
  if(q===name||q.startsWith(name+" ")||name.startsWith(q)&&q.length>=4)return name;
 }
 return "";
}
async function fetchOFFProducts(url,signal){
 const response=await fetch(url.toString(),{signal,headers:{Accept:"application/json"},cache:"no-store"});
 if(!response.ok){
  const error=new Error("Open Food Facts vrátilo "+response.status);
  error.httpStatus=response.status;throw error;
 }
 const data=await response.json();
 // Legacy/API v2 returns products; Search-a-licious returns hits.
 const rows=Array.isArray(data.products)?data.products:Array.isArray(data.hits)?data.hits:[];
 return rows.map(p=>p?._source||p?.source||p)
  .filter(p=>p&&p.nutriments&&(p.product_name||p.product_name_sk||p.product_name_en))
  .map(nutritionFromOFF).filter(p=>p.name&&p.kcal!==null&&validNum(p.kcal,0,2000)&&p.portion>0)
  .slice(0,8);
}
function foodSearchFields(){
 return "code,product_name,product_name_sk,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,nutriments,image_front_small_url,image_small_url,image_front_url,image_url,selected_images,lang,lc";
}
async function remoteFoodSearch(query,token,local,{force=false}={}){
 const typed=normalizeTerm(query);
 // Preserve Slovak accents when searching the remote catalog. "coko" and "čoko"
 // normalize to the same local cache key, but the remote API must receive "čoko".
 const q=/^(capucino|kapucino|cappucino|kapuccino)$/.test(typed)?"cappuccino":String(query||"").trim();
 if(typed.length<3||token!==searchGeneration)return;
 const cached=getCachedFoodSearch(typed);
 if(!force&&cached!==null){
  if(token===searchGeneration)renderFoodSuggestions(local,cached,false);
  return;
 }
 const now=Date.now();
 searchNetworkHistory=searchNetworkHistory.filter(t=>now-t<60000);
 const minDelay=Math.max(0,lastSearchAt+1300-now);
 const windowDelay=searchNetworkHistory.length>=8?Math.max(0,searchNetworkHistory[0]+61000-now):0;
 const outageDelay=force||matchingFoodBrand(q)?0:Math.max(0,remoteSearchPauseUntil-now);
 const delay=Math.max(minDelay,windowDelay,outageDelay);
 if(delay>0){
  if(delay<9500){
   searchTimer=setTimeout(()=>remoteFoodSearch(query,token,local,{force}),delay+120);
   renderFoodSuggestions(local,findKnownProducts(q),true,"");
   return;
  }
  if(token===searchGeneration){
   const known=findKnownProducts(q);
   renderFoodSuggestions(local,known,false,local.length||known.length?"":"Online vyhľadávanie je dočasne obmedzené. Skús znova.");
  }
  return;
 }
 searchNetworkHistory.push(now);lastSearchAt=now;
 searchAbort=new AbortController();
 const ctrl=searchAbort,timer=setTimeout(()=>ctrl.abort(),19500);
 const fields=foodSearchFields();
 const brand=matchingFoodBrand(q);
 const endpoints=[];
 // Dedicated proxy uses server-side queries (avoids upstream CORS), caches
 // validated product results and has been verified from GitHub Actions.
 const cachedProxy=new URL(FORMA_FOOD_SEARCH_URL);
 cachedProxy.searchParams.set("q",q);
 endpoints.push(cachedProxy);
 if(brand){
  // API v2 supports structured brand filtering and is independent of legacy full text.
  const url=new URL("https://world.openfoodfacts.org/api/v2/search");
  url.searchParams.set("brands_tags",brand.replace(/ /g,"-"));
  url.searchParams.set("page_size","24");url.searchParams.set("fields",fields);
  endpoints.push(url);
 }
 // Legacy Open Food Facts is the fallback for temporary proxy failures.
 // A first-party proxy also avoids noisy API errors from browser CORS.
 const legacy=new URL("https://world.openfoodfacts.org/cgi/search.pl");
 legacy.searchParams.set("search_terms",q);
 legacy.searchParams.set("search_simple","1");
 legacy.searchParams.set("action","process");legacy.searchParams.set("json","1");
 legacy.searchParams.set("page_size","12");legacy.searchParams.set("fields",fields);
 endpoints.push(legacy);
 let products=[],lastError=null,foundHealthyResponse=false;
 try{
  for(const url of endpoints){
   if(token!==searchGeneration||ctrl.signal.aborted)return;
   try{
    const matches=await fetchOFFProducts(url,ctrl.signal);
    foundHealthyResponse=true;
    if(matches.length){products=matches;break}
   }catch(e){lastError=e;if(e.name==="AbortError")break}
  }
  if(token!==searchGeneration)return;
  if(products.length){
   rememberFoodSearch(typed,products);
   renderFoodSuggestions(local,products,false);
  }else if(foundHealthyResponse){
   // Do not persist an empty query for 24 h: database search availability varies.
   const known=findKnownProducts(q);
   renderFoodSuggestions(local,known,false,local.length||known.length?"":"V online katalógu sa nenašla nová zhoda. Skús iný názov alebo čiarový kód.");
  }else{
   if([429,500,502,503,504].includes(lastError?.httpStatus))remoteSearchPauseUntil=Date.now()+10000;
   console.warn("Open Food Facts vyhľadávanie:",lastError?.message||"Nedostupné");
   const known=findKnownProducts(q);
   if(local.length||known.length){
    $("foodSearchHelp").textContent="Zobrazujem základné potraviny a predchádzajúce výsledky. Online katalóg teraz neodpovedá.";
    renderFoodSuggestions(local,known,false);
   }else{
    renderFoodSuggestions(local,known,false,"Online katalóg teraz neodpovedá. Skús znova alebo zadaj jedlo ručne.");
   }
  }
 }finally{
  clearTimeout(timer);
  if(searchAbort===ctrl)searchAbort=null;
 }
}
function foodNameChanged(){
 const value=$("foodName").value.trim();
 if(selectedFoodName&&normalizeTerm(value)!==normalizeTerm(selectedFoodName)){
  selectedFoodName="";
  $("fKcal").value="";
  ["fProtein","fCarbs","fFat","fSugar"].forEach(id=>$(id).value="0");
  $("fFiber").value="";
  $("foodEAN").value="";
  setProductImage("","");setFoodNutritionSource(null);
  $("foodLookupMessage").hidden=true;
  updateEggUI(null);
  renderFoodPreview();updateFoodSaveState();
 }
 $("quickFoods").hidden=value.length>0;
 clearTimeout(searchTimer);
 if(searchAbort){searchAbort.abort();searchAbort=null}
 const token=++searchGeneration;
 if(value.length<2){hideFoodSuggestions();$("foodSearchHelp").textContent="Začni písať a vyber jedlo z návrhov.";return}
 const local=findCommon(value),known=findKnownProducts(value);
 renderFoodSuggestions(local,known,normalizeTerm(value).length>=3&&!known.length);
 $("foodSearchHelp").textContent="Vyhľadávam: "+value+". Miestne jedlá sú dostupné ihneď aj bez internetu.";
 if(normalizeTerm(value).length<3)return;
 // Show known matches immediately; delay new requests until typing has stopped.
 const wait=1100;
 searchTimer=setTimeout(()=>remoteFoodSearch(value,token,local),wait);
}
function foodNameKeys(e){
 if($("foodSuggestions").hidden||!suggestions.length)return;
 if(e.key==="ArrowDown"||e.key==="ArrowUp"){
  e.preventDefault();suggestionCursor=(suggestionCursor+(e.key==="ArrowDown"?1:-1)+suggestions.length)%suggestions.length;
  $all("[data-suggest]").forEach((x,i)=>x.setAttribute("aria-selected",String(i===suggestionCursor)));
  return;
 }
 if(e.key==="Enter"){
  e.preventDefault();
  applyFoodSuggestion(suggestions[Math.max(0,suggestionCursor)]);
 }else if(e.key==="Escape"){e.preventDefault();hideFoodSuggestions()}
}

const fmt=n=>Math.round(Number(n)||0).toLocaleString("sk-SK");
const dec=n=>Number(n||0).toLocaleString("sk-SK",{maximumFractionDigits:1});
const round=n=>Math.round(Number(n||0)*10)/10;
const icon=name=>'<svg aria-hidden="true"><use href="#ic-'+name+'"></use></svg>';
const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function dateLocal(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function addDays(date,n){let d=new Date(date+"T12:00:00");d.setDate(d.getDate()+n);return dateLocal(d)}
function formatDate(date,style="short"){return new Intl.DateTimeFormat("sk-SK",style==="full"?{day:"numeric",month:"long",year:"numeric"}:{day:"numeric",month:"short"}).format(new Date(date+"T12:00:00"))}
function uid(){return crypto&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()}
function structuredCloneSafe(o){return JSON.parse(JSON.stringify(o))}
function validNum(x,min,max){const n=Number(x);return x!==null&&x!==""&&Number.isFinite(n)&&n>=min&&n<=max}
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s)))return false;const d=new Date(s+"T12:00:00");return !Number.isNaN(d.valueOf())&&dateLocal(d)===s}
function validProfile(p){return p&&validNum(p.weight,35,300)&&validNum(p.target,35,300)&&validNum(p.height,120,230)&&validNum(p.age,18,95)&&["male","female"].includes(p.sex)&&[1.2,1.375,1.55,1.725].includes(Number(p.activity))&&[.25,.3,.4,.5,.65,.75].includes(Number(p.rate))&&(!p.mode||["lose","maintain","gain"].includes(p.mode))}
function normalize(input){
 if(!input||!validProfile(input.profile)||!Array.isArray(input.foods)||!Array.isArray(input.weights)||!Array.isArray(input.workouts))throw Error("Neplatný súbor údajov.");
 const p=input.profile;const obj={profile:{weight:+p.weight,target:+p.target,height:+p.height,age:+p.age,sex:p.sex,activity:+p.activity,rate:+p.rate,mode:["maintain","gain"].includes(p.mode)?p.mode:"lose",gainRate:Object.hasOwn(GAIN_SURPLUS,p.gainRate)?p.gainRate:"moderate",lossTarget:validNum(p.lossTarget,35,300)?+p.lossTarget:+p.target},foods:[],weights:[],workouts:[]};
 obj.foods=input.foods.slice(0,20000).filter(x=>x&&typeof x.name==="string"&&x.name.length<=100&&validDate(x.date)&&MEALS.some(m=>m[0]===x.meal)&&validNum(x.grams,1,10000)&&["kcal","protein","carbs","fat","sugar"].every(k=>validNum(x[k],0,200000))).map(x=>({id:String(x.id||uid()).slice(0,100),name:x.name,date:x.date,meal:x.meal,grams:+x.grams,kcal:+x.kcal,protein:+x.protein,carbs:+x.carbs,fat:+x.fat,sugar:+x.sugar,fiber:validNum(x.fiber,0,200000)?+x.fiber:null,code:String(x.code||"").slice(0,16),image:safeFoodImage(x.image),unit:x.unit==="ml"?"ml":"g",dish:Boolean(x.dish),eggCount:validNum(x.eggCount,1,8)?Number(x.eggCount):null,eggFat:Object.hasOwn(EGG_EXTRA_FATS,x.eggFat)?x.eggFat:"none"}));
 obj.weights=input.weights.slice(0,10000).filter(x=>x&&validDate(x.date)&&validNum(x.kg,35,300)).map(x=>({date:x.date,kg:+x.kg}));
 obj.workouts=input.workouts.slice(0,10000).filter(x=>x&&validDate(x.date)&&EXERCISES[x.type]&&validNum(x.minutes,1,480)).map(x=>({id:String(x.id||uid()).slice(0,100),type:x.type,date:x.date,minutes:+x.minutes}));
 return obj;
}
function sanitizeProfileName(value){
 return String(value||"").trim().replace(/\s+/g," ").slice(0,30);
}
function findActiveProfile(){return profileStore.profiles.find(p=>p.id===activeProfileId)||null}
// Keep only this browser's already-verified profile selection in localStorage.
// The value is not a password or an authentication token. It is tied to the
// current PBKDF2 record; a changed password invalidates the remembered device.
function isRememberedProfile(profile){
 if(!profile?.password)return false;
 try{
  const remembered=JSON.parse(localStorage.getItem(PROFILE_REMEMBER_KEY)||"null");
  return remembered?.id===profile.id
   &&remembered.salt===profile.password.salt
   &&remembered.hashPrefix===profile.password.hash.slice(0,16);
 }catch{return false}
}
function rememberProfileOnThisDevice(profile){
 try{
  if(profile?.password){
   localStorage.setItem(PROFILE_REMEMBER_KEY,JSON.stringify({
    id:profile.id,salt:profile.password.salt,hashPrefix:profile.password.hash.slice(0,16)
   }));
  }else localStorage.removeItem(PROFILE_REMEMBER_KEY);
 }catch(error){console.warn("Zapamätanie profilu nie je dostupné",error)}
}
function forgetRememberedProfile(){
 try{localStorage.removeItem(PROFILE_REMEMBER_KEY)}catch(error){console.warn("Odhlásenie profilu",error)}
}
function saveProfiles(options={}){
 if(options.touch){
  const selected=findActiveProfile();
  if(selected)selected.updatedAt=new Date().toISOString();
 }
 try{localStorage.setItem(PROFILE_STORE_KEY,JSON.stringify(profileStore));if(githubSyncEnabled)scheduleGithubSync();else if($("githubSyncStatus"))githubStatus("Lokálne uložené. Cloudflare záloha ešte nie je pripravená.","error");return true}
 catch(e){console.error("Lokálna databáza sa neuložila",e);notify("Údaje sa nepodarilo uložiť. Urob JSON zálohu.");return false}
}
function initializeProfiles(){
 let loaded=false;
 try{
  const raw=localStorage.getItem(PROFILE_STORE_KEY);
  if(raw){
   const parsed=JSON.parse(raw);
   if(!parsed||!Array.isArray(parsed.profiles))throw Error("Neplatná databáza profilov");
   profileStore={version:1,profiles:parsed.profiles.slice(0,25).filter(p=>p&&typeof p.id==="string"&&!REMOVED_PROFILE_IDS.has(p.id)&&typeof p.name==="string").map(p=>({
    id:p.id.slice(0,100),name:sanitizeProfileName(p.name)||"Používateľ",createdAt:p.createdAt||today,updatedAt:typeof p.updatedAt==="string"?p.updatedAt:"",password:normalizePasswordRecord(p.password),
    data:normalize(p.data)
   }))};
   loaded=true;
  }
 }catch(e){console.error("Chyba pri čítaní profilov",e)}
 if(!loaded){
  const old=localStorage.getItem(KEY);
  if(old){
   try{
    const data=normalize(JSON.parse(old));
    profileStore.profiles.push({id:String(uid()),name:"Môj pôvodný profil",createdAt:today,data});
    saveProfiles();
   }catch(e){console.warn("Pôvodné údaje sa nepodarilo načítať",e)}
  }
 }
 const active=sessionStorage.getItem(PROFILE_LOGGED_OUT_KEY)==="1"?null:localStorage.getItem(PROFILE_ACTIVE_KEY);
 const profile=profileStore.profiles.find(p=>p.id===active);
 if(profile&&(!profile.password||isRememberedProfile(profile))){
  activeProfileId=profile.id;
  unlockedProfileId=profile.password?profile.id:null;
  state=structuredCloneSafe(profile.data);
  lossTargetDraft=state.profile.lossTarget||state.profile.target;
 }else if(active){
  // A missing or changed password must not silently re-open the old profile.
  localStorage.removeItem(PROFILE_ACTIVE_KEY);
 }
}
function renderProfileList(){
 const list=$("profileList");
 if(!profileStore.profiles.length){list.innerHTML='<div class="profile-empty">Ešte nemáš profil. Vytvor si ho podľa svojho mena.</div>'}
 else list.innerHTML=profileStore.profiles.map(p=>
  '<button type="button" class="profile-entry" data-profile-select="'+escapeHTML(p.id)+'"><span class="profile-initial">'+escapeHTML(p.name[0].toLocaleUpperCase("sk-SK"))+'</span><span><strong>'+escapeHTML(p.name)+'</strong><small>'+(p.password?'Zamknutý profil · heslo':'Otvoriť svoj denník')+'</small></span>'+icon("forward")+'</button>'
 ).join("");
 $("closeProfile").hidden=!activeProfileId;
}
function openProfiles(){
 if(!$("scanOverlay").hidden)closeScan();
 if(!$("foodOverlay").hidden)closeFood();
 renderProfileList();
 $("profileList").hidden=false;
 $("toggleNewProfile").hidden=false;
 $("profileUnlockForm").hidden=true;pendingUnlockId=null;
 $("newProfileForm").hidden=profileStore.profiles.length>0;
 $("profileOverlay").hidden=false;
 bodyLock();
}
function closeProfiles(){
 if(!activeProfileId)return;
 $("profileOverlay").hidden=true;
 bodyUnlock();
}
function syncProfileBadge(){
 const profile=findActiveProfile(),name=profile?.name||"";
 $("profileHeaderBtn").textContent=name?name[0].toLocaleUpperCase("sk-SK"):"?";
 $("profileHeaderBtn").title=name?"Profil: "+name:"Vybrať profil";
 $("currentProfileLabel").textContent=name||"Žiadny";
 if($("profilePasswordState"))renderPasswordSettings();
}
function switchProfile(id,verified=false){
 const target=profileStore.profiles.find(p=>p.id===id);
 if(!target)return;
 if(target.password&&!verified){
  pendingUnlockId=id;
  $("profileUnlockName").textContent=target.name;
  $("profileUnlockPassword").value="";
  $("profileUnlockError").textContent="";
  $("profileUnlockForm").hidden=false;
  $("profileList").hidden=true;
  $("toggleNewProfile").hidden=true;
  $("newProfileForm").hidden=true;
  $("profileUnlockPassword").focus();
  return;
 }
 unlockedProfileId=id;
 $("profileUnlockForm").hidden=true;
 $("profileList").hidden=false;
 $("toggleNewProfile").hidden=false;
 activeProfileId=id;
 sessionStorage.removeItem(PROFILE_LOGGED_OUT_KEY);
 localStorage.setItem(PROFILE_ACTIVE_KEY,id);
 rememberProfileOnThisDevice(target);
 state=structuredCloneSafe(target.data);
 lossTargetDraft=state.profile.lossTarget||state.profile.target;
 selectedDay=today;
 closeProfiles();
 syncProfileBadge();renderPasswordSettings();render();setView("home");
}
async function createProfile(e){
 e.preventDefault();
 const name=sanitizeProfileName($("newProfileName").value);
 const weight=Number($("newProfileWeight").value),height=Number($("newProfileHeight").value);
 const target=Number($("newProfileTarget").value),age=Number($("newProfileAge").value),sex=$("newProfileSex").value;
 if(name.length<2||profileStore.profiles.some(x=>x.name.toLocaleLowerCase("sk-SK")===name.toLocaleLowerCase("sk-SK"))){notify("Zadaj jedinečné meno s aspoň 2 znakmi.");return}
 const data=structuredCloneSafe(DEFAULT);
 const goal=$("newProfileGoal").value;
 data.profile={weight,height,target,age,sex,activity:1.2,rate:.3,gainRate:"moderate",mode:goal,lossTarget:target};
 if(!validProfile(data.profile)||goal==="lose"&&target>weight||goal==="gain"&&target<=weight||goal==="maintain"&&target!==weight){
  notify(goal==="gain"?"Pri naberaní nastav vyššiu cieľovú váhu.":goal==="lose"?"Pri chudnutí nastav nižšiu cieľovú váhu.":"Pri udržiavaní nastav rovnakú aktuálnu a cieľovú váhu.");return
 }
 if(profileStore.profiles.length>=25){notify("Maximum je 25 miestnych profilov.");return}
 const password=$("newProfilePassword").value;
 if(password&&password.length<6){notify("Heslo musí mať aspoň 6 znakov.");return}
 const auth=password?await createPasswordRecord(password):null;
 const id=String(uid());
 profileStore.profiles.push({id,name,createdAt:today,updatedAt:new Date().toISOString(),password:auth,data});
 if(!saveProfiles()){profileStore.profiles.pop();return}
 switchProfile(id,true);
 notify("Profil "+name+" je pripravený.");
}
function renameProfile(){
 const profile=findActiveProfile();
 if(!profile)return;
 $("profileRenameInput").value=profile.name;
 $("profileRenameForm").hidden=false;
 $("profileRenameInput").focus();
 $("profileRenameInput").select();
}
function submitProfileRename(e){
 e.preventDefault();
 const profile=findActiveProfile();
 if(!profile)return;
 const name=sanitizeProfileName($("profileRenameInput").value);
 if(name.length<2||profileStore.profiles.some(x=>x.id!==profile.id&&x.name.toLocaleLowerCase("sk-SK")===name.toLocaleLowerCase("sk-SK"))){
  notify("Zadaj jedinečné meno s aspoň 2 znakmi.");return
 }
 if(name===profile.name){$("profileRenameForm").hidden=true;return}
 profile.name=name;
 saveProfiles({touch:true});
 syncProfileBadge();
 $("profileRenameForm").hidden=true;
 renderProfileList();
 notify("Meno profilu zmenené.");
}
function logoutProfile(){
 unlockedProfileId=null;
 // The logout affects only the active UI selection. Saved data, profiles and
 // background cloud sync stay untouched; no deletions are sent to GitHub.
 sessionStorage.setItem(PROFILE_LOGGED_OUT_KEY,"1");
 localStorage.removeItem(PROFILE_ACTIVE_KEY);
 forgetRememberedProfile();
 activeProfileId=null;
 $("profileRenameForm").hidden=true;
 syncProfileBadge();
 setView("home");
 openProfiles();
}

async function unlockProfile(e){
 e.preventDefault();
 const profile=profileStore.profiles.find(p=>p.id===pendingUnlockId);
 if(!profile){$("profileUnlockForm").hidden=true;return}
 const submit=$("profileUnlockForm").querySelector('[type="submit"]');
 submit.disabled=true;
 try{
  const ok=await verifyProfilePassword($("profileUnlockPassword").value,profile.password);
  $("profileUnlockPassword").value="";
  if(!ok){$("profileUnlockError").textContent="Nesprávne heslo.";return}
  $("profileList").hidden=false;
  $("toggleNewProfile").hidden=false;
  pendingUnlockId=null;
  switchProfile(profile.id,true);
 }catch(error){$("profileUnlockError").textContent="Overenie hesla sa nepodarilo."}
 finally{submit.disabled=false}
}
function cancelProfileUnlock(){
 pendingUnlockId=null;
 $("profileUnlockPassword").value="";
 $("profileUnlockForm").hidden=true;
 $("profileList").hidden=false;
 $("toggleNewProfile").hidden=false;
}
function renderPasswordSettings(){
 const profile=findActiveProfile(),secured=Boolean(profile?.password);
 $("profilePasswordState").textContent=secured?"Heslo je nastavené":"Heslo zatiaľ nie je nastavené";
 $("profileOldPasswordWrap").hidden=!secured;
 $("profileOldPassword").required=secured;
 $("profileNewPassword").required=true;
 $("profileConfirmPassword").required=true;
}
async function saveProfilePassword(e){
 e.preventDefault();
 const profile=findActiveProfile();if(!profile)return;
 const current=$("profileOldPassword").value,next=$("profileNewPassword").value,confirmNext=$("profileConfirmPassword").value;
 if(next.length<6||next!==confirmNext){notify("Heslo musí mať aspoň 6 znakov a obe polia sa musia zhodovať.");return}
 const btn=$("profilePasswordForm").querySelector('[type="submit"]');btn.disabled=true;
 try{
  if(profile.password&&!await verifyProfilePassword(current,profile.password)){notify("Súčasné heslo je nesprávne.");return}
  const record=await createPasswordRecord(next);
  profile.password=record;
  unlockedProfileId=profile.id;
  rememberProfileOnThisDevice(profile);
  saveProfiles({touch:true});
  $("profilePasswordForm").reset();
  renderPasswordSettings();
  notify("Heslo profilu je uložené. Pri ďalšom otvorení sa bude vyžadovať.");
 }catch(error){notify("Heslo sa nepodarilo uložiť.")}
 finally{btn.disabled=false}
}

/* Voliteľná synchronizácia do GitHub JSON.
   GitHub token sa nikdy neposiela inam než na api.github.com. Nepatrí do repo kódu,
   JSON záloh, URL ani persistentného localStorage. Ukladá sa len do sessionStorage. */

/* Token-free cloud backup. The GitHub credential is server-side, never shipped to browsers.
   Do not mark synced unless the server confirms the GitHub commit. */
const FORMA_CLOUD_URL = "https://weathered-feather-e501.teenwear-eu.workers.dev";
function githubStatus(message,level="neutral"){
 $("githubSyncStatus").textContent=message;
 $("githubSyncStatus").dataset.level=level;
 $("githubSyncActions").hidden=false;

}
function parseGithubProfiles(value){
 if(!value||value.version!==1||!Array.isArray(value.profiles))throw Error("Neplatná cloud databáza");
 if(value.profiles.length>25)throw Error("Priveľa cloud profilov");
 return {version:1,profiles:value.profiles.filter(p=>!REMOVED_PROFILE_IDS.has(p.id)).map(p=>{
  if(!p||typeof p.id!=="string"||typeof p.name!=="string")throw Error("Neplatný profil");
  return {id:p.id.slice(0,100),name:sanitizeProfileName(p.name)||"Používateľ",
   createdAt:p.createdAt||today,updatedAt:typeof p.updatedAt==="string"?p.updatedAt:"",password:normalizePasswordRecord(p.password),
   data:normalize(p.data)};
 })};
}
function mergeGithubProfiles(remote,local){
 const merged=new Map(remote.profiles.filter(p=>!REMOVED_PROFILE_IDS.has(p.id)).map(p=>[p.id,p]));
 for(const p of local.profiles){
  if(REMOVED_PROFILE_IDS.has(p.id))continue;
  const old=merged.get(p.id);
  if(!old||Date.parse(p.updatedAt||0)>Date.parse(old.updatedAt||0))
   merged.set(p.id,p);
 }
 if(merged.size>25)throw Error("Priveľa profilov");
 return {version:1,profiles:Array.from(merged.values())};
}
function applyGithubProfiles(remote){
 // Keep the local diary and capture a rollback copy before merging remote data.
 const current=parseGithubProfiles(profileStore);
 const merged=mergeGithubProfiles(remote,current);
 try{
  const previous=localStorage.getItem(PROFILE_STORE_KEY);
  if(previous)sessionStorage.setItem("forma-cloud-previous-local-v1",previous);
 }catch(e){}
 const previousId=activeProfileId;
 profileStore=merged;
 localStorage.setItem(PROFILE_STORE_KEY,JSON.stringify(merged));
 let selected=profileStore.profiles.find(p=>p.id===previousId);
 if(!selected&&previousId){
  activeProfileId=null;unlockedProfileId=null;
  localStorage.removeItem(PROFILE_ACTIVE_KEY);
 }
 if(!selected&&profileStore.profiles.length&&sessionStorage.getItem(PROFILE_LOGGED_OUT_KEY)!=="1"&&!profileStore.profiles[0].password){
  selected=profileStore.profiles[0];
  activeProfileId=selected.id;
  localStorage.setItem(PROFILE_ACTIVE_KEY,activeProfileId);
 }
 // A remote password change invalidates previously remembered devices. A
 // normal sync, refresh or return to the app must not log out a trusted device.
 if(selected?.password)unlockedProfileId=isRememberedProfile(selected)?selected.id:null;
 if(selected&&(!selected.password||unlockedProfileId===selected.id)){
  state=structuredCloneSafe(selected.data);
  lossTargetDraft=state.profile.lossTarget||state.profile.target;
  syncProfileBadge();render();
 }
 if(selected?.password&&unlockedProfileId!==selected.id){
  activeProfileId=null;localStorage.removeItem(PROFILE_ACTIVE_KEY);forgetRememberedProfile();openProfiles();
 }
 if(!$("profileOverlay").hidden)renderProfileList();
}
async function workerRequest(path,method="GET",payload){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),17000);
 try{
  const resp=await fetch(FORMA_CLOUD_URL+path,{
   method,signal:ctrl.signal,cache:"no-store",
   headers:{"Accept":"application/json",...(payload?{"Content-Type":"application/json"}:{})},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const data=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(data.error||"Cloudflare API "+resp.status);
  if(!data.ok)throw Error("Nedostupný server");
  return data;
 }finally{clearTimeout(timer)}
}
function scheduleGithubSync(delay=1800){
 if(!githubSyncEnabled)return;
 ++githubSyncRevision;
 clearTimeout(githubSyncTimer);
 githubStatus("Lokálne uložené, čakám na potvrdenie GitHubu…","busy");
 githubSyncTimer=setTimeout(()=>void syncGithubProfiles(),delay);
}
async function syncGithubProfiles(){
 if(!githubSyncEnabled)return false;
 if(githubSyncInFlight){githubSyncAgain=true;return githubSyncInFlight}
 const job=(async()=>{
  const revision=githubSyncRevision;
  githubStatus("Overujem GitHub zálohu…","busy");
  try{
   // Read first, merge local data into the remote snapshot, and send the union.
   const remote=parseGithubProfiles(await workerRequest("/profiles"));
   const snapshot=mergeGithubProfiles(remote,parseGithubProfiles(profileStore));
   const committed=parseGithubProfiles(await workerRequest("/profiles","POST",snapshot));
   if(committed.profiles.length<snapshot.profiles.length)throw Error("Server nevrátil všetky profily");
   applyGithubProfiles(committed);
   githubSyncLastRead=Date.now();
   if(githubSyncRevision!==revision){
    githubSyncAgain=true;
   }else{
    githubStatus("Záloha je uložená na GitHube.","success");
   }
   return true;
  }catch(e){
   console.warn("FORMA cloud:",e);
   githubStatus("Záloha nie je aktuálna: "+(e.message||"Nedostupná služba")+". Lokálne údaje zostali uložené.","error");
   return false;
  }
 })();
 githubSyncInFlight=job;
 try{return await job}
 finally{
  githubSyncInFlight=null;
  if(githubSyncAgain){
   githubSyncAgain=false;
   scheduleGithubSync(400);
  }
 }
}
async function githubRestoreSession(){
 githubStatus("Kontrolujem dostupnosť servera…","busy");
 try{
  const health=await workerRequest("/health");
  if(!health.ready){
   githubSyncEnabled=false;
   githubStatus("Cloudflare Worker čaká na serverový GitHub token. Údaje sú zatiaľ len lokálne.","error");
   return;
  }
  githubSyncEnabled=true;
  await syncGithubProfiles();
 }catch(e){
  githubSyncEnabled=false;
  githubStatus("Cloudflare záloha ešte nie je spustená. Údaje zostali lokálne.","error");
 }
}
initializeProfiles();
function save(){const profile=findActiveProfile();if(!profile)return;profile.data=structuredCloneSafe(state);saveProfiles({touch:true})}
function notify(text){$("toast").textContent=text;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3300)}
function lastWeight(){const weights=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));return weights.length?weights[weights.length-1].kg:state.profile.weight}
function preferredMeal(hour=new Date().getHours()){
 if(hour>=5&&hour<10)return "ranajky";
 if(hour>=10&&hour<12)return "desiata";
 if(hour>=12&&hour<15)return "obed";
 if(hour>=15&&hour<18)return "olovrant";
 if(hour>=18&&hour<23)return "vecera";
 return "ine";
}
function plan(){
 const p=state.profile,maintain=p.mode==="maintain",gain=p.mode==="gain",activeWeight=lastWeight();
 const bmr=10*p.weight+6.25*p.height-5*p.age+(p.sex==="male"?5:-161);
 const tdee=bmr*p.activity,floor=p.sex==="male"?1600:1400;
 // A modest surplus is an initial estimate, not a guarantee of muscle gain.
 const surplus=gain?(GAIN_SURPLUS[p.gainRate]??250):0;
 const desired=gain?tdee+surplus:maintain?tdee:tdee-p.rate*7700/7;
 const calories=gain?Math.round(desired/50)*50:maintain?Math.round(tdee/50)*50:Math.max(floor,Math.round(Math.max(floor,desired)/50)*50);
 const activity=Number(p.activity);
 const proteinRate=gain?1.8:maintain?
   (activity>=1.725?1.6:activity>=1.55?1.5:activity>=1.375?1.3:1.2):
   (activity>=1.55?1.6:activity>=1.375?1.4:1.3);
 const protein=Math.round((gain?activeWeight:maintain?p.weight:p.target)*proteinRate);
 const fat=Math.round((gain?activeWeight:maintain?p.weight:p.target)*.8);
 const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
 const deficit=maintain?0:gain?-(calories-tdee):Math.max(0,tdee-calories);
 const rate=gain?Math.max(0,(calories-tdee)*7/7700):maintain?0:Math.max(0,deficit*7/7700);
 const remaining=maintain?0:gain?Math.max(0,p.target-activeWeight):Math.max(0,activeWeight-p.target);
 const weeks=maintain?null:remaining===0?0:rate>0?Math.ceil(remaining/rate):null;
 return {bmr,tdee,calories,protein,proteinRate,fat,carbs,deficit,rate,remaining,weeks,maintain,gain,surplus:calories-tdee,fiber:25,
  sugarsReference:90,freeSugarMax:Math.floor(calories*.10/4),freeSugarIdeal:Math.floor(calories*.05/4),
  targetDate:weeks===null?null:addDays(today,weeks*7),floor,capped:!maintain&&!gain&&desired<floor};
}
function foodsFor(day){return state.foods.filter(f=>f.date===day)}
function daily(day){let o={kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0};foodsFor(day).forEach(f=>Object.keys(o).forEach(k=>o[k]+=Number(f[k])||0));return o}
function streak(){const dates=new Set([...state.foods.map(x=>x.date),...state.weights.map(x=>x.date),...state.workouts.map(x=>x.date)]);let count=0;for(let i=0;i<400;i++){let day=addDays(today,-i);if(dates.has(day))count++;else if(i>0)break}return count}
function capProgress(value,max){return Math.max(0,Math.min(100,100*value/Math.max(max,1)))}
function setView(view){if(!$("view-"+view))return;activeView=view;$all(".view").forEach(el=>el.classList.toggle("active",el.id==="view-"+view));$all("[data-nav]").forEach(el=>el.classList.toggle("active",el.dataset.nav===view));window.scrollTo({top:0,behavior:"instant"});$("main").focus({preventScroll:true})}
function mealMarkup(f,mini=false){
 const edit=mini?"":'<button class="small-button" data-edit-food="'+escapeHTML(f.id)+'" aria-label="Upraviť">'+icon("edit")+'</button>';
 const del=mini?"":'<button class="small-button" data-remove-food="'+escapeHTML(f.id)+'" aria-label="Zmazať">'+icon("trash")+'</button>';
 return '<div class="meal-item" data-food-detail="'+escapeHTML(f.id)+'" role="button" tabindex="0" aria-label="Detail jedla '+escapeHTML(f.name)+'"><span class="meal-icon '+(safeFoodImage(f.image)?'meal-photo':'')+'">'+(foodImageMarkup(f.image,"meal-image")||icon("list"))+'</span><div class="meal-details"><strong>'+escapeHTML(f.name)+'</strong><small>'+dec(f.grams)+' '+(f.unit||'g')+' · B '+dec(f.protein)+' g · S '+dec(f.carbs)+' g</small></div><div class="meal-kcal">'+fmt(f.kcal)+' kcal</div>'+edit+del+'</div>';
}

const NUTRIENT_LABELS={kcal:"Kalórie",protein:"Bielkoviny",carbs:"Sacharidy",fat:"Tuky",sugar:"Cukry",fiber:"Vláknina"};
function nutrientValue(food,key){return food[key]===null||food[key]===undefined?null:Number(food[key])||0}
function nutrientTotal(key,foods){return foods.reduce((sum,food)=>sum+(nutrientValue(food,key)||0),0)}
function nutritionItemPhoto(food){
 const pic=foodImageMarkup(food.image,"nutrition-photo");
 return '<span class="nutrition-item-image">'+(pic||icon("list"))+'</span>';
}
function showNutritionDialog(title,subtitle,content){
 $("nutritionTitle").textContent=title;
 $("nutritionSubtitle").textContent=subtitle;
 $("nutritionContent").innerHTML=content;
 $("nutritionOverlay").hidden=false;
 bodyLock();
 $("closeNutrition").focus({preventScroll:true});
}
function closeNutritionDialog(){
 $("nutritionOverlay").hidden=true;
 $("nutritionContent").replaceChildren();
 bodyUnlock();
}
function showFoodNutrition(id){
 const food=state.foods.find(item=>item.id===id);
 if(!food)return;
 const stats=[["kcal","Kalórie","kcal"],["protein","Bielkoviny","g"],["carbs","Sacharidy","g"],["fat","Tuky","g"],["sugar","Cukry","g"],["fiber","Vláknina","g"]];
 const cards=stats.map(([key,label,unit])=>'<div class="nutrition-detail-stat"><span>'+label+'</span><strong>'+
   (nutrientValue(food,key)===null?"Neznáme":dec(nutrientValue(food,key))+' <small>'+unit+'</small>')+'</strong></div>').join("");
 const meal=MEALS.find(x=>x[0]===food.meal)?.[1]||"Jedlo";
 const photo=nutritionItemPhoto(food);
 showNutritionDialog(food.name,meal+' · '+formatDate(food.date),
  '<div class="nutrition-product-top">'+photo+'<div><strong>'+dec(food.grams)+' '+(food.unit||"g")+'</strong><span>zapísaná porcia</span></div></div>'+
  '<div class="nutrition-detail-grid">'+cards+'</div>'+
  '<p class="nutrition-footnote">Hodnoty zodpovedajú zapísanej porcii. Pri odhadovaných jedlách sú orientačné.</p>');
}
function showNutrientBreakdown(key){
 if(!Object.hasOwn(NUTRIENT_LABELS,key))return;
 const list=foodsFor(today).slice().sort((a,b)=>(nutrientValue(b,key)||0)-(nutrientValue(a,key)||0));
 const total=nutrientTotal(key,list),unit=key==="kcal"?"kcal":"g";
 const targets=plan(),goal=key==="kcal"?targets.calories:key==="sugar"?targets.sugarsReference:targets[key]??0;
 let rows=list.map(food=>{
  const amount=nutrientValue(food,key);
  const pct=total>0&&amount!==null?Math.min(100,(amount/total)*100):0;
  return '<button type="button" class="nutrition-item" data-food-detail="'+escapeHTML(food.id)+'">'+
   nutritionItemPhoto(food)+'<span class="nutrition-item-description"><strong>'+escapeHTML(food.name)+'</strong>'+
   '<small>'+dec(food.grams)+' '+(food.unit||"g")+' · '+(MEALS.find(m=>m[0]===food.meal)?.[1]||"Jedlo")+'</small>'+
   '<span class="nutrition-contribution"><i style="width:'+pct+'%"></i></span></span>'+
   '<strong class="nutrition-item-amount">'+(amount===null?"–":dec(amount))+' <small>'+unit+'</small></strong></button>';
 }).join("");
 if(!list.length)rows='<div class="nutrition-no-food">Dnes ešte nemáš zapísané jedlá.</div>';
 showNutritionDialog(NUTRIENT_LABELS[key],"DNES · ROZPIS PODĽA JEDÁL",
  '<div class="nutrition-total-panel"><span>Spolu dnes</span><strong>'+dec(total)+' <small>'+unit+'</small></strong>'+
  (goal>0?'<small>Orientačný cieľ / referencia: '+dec(goal)+' '+unit+'</small>':"")+'</div>'+
  '<div class="nutrition-item-list">'+rows+'</div>'+
  (key==="fiber"&&list.some(f=>f.fiber===null)?'<p class="nutrition-footnote">Niektoré produkty nemajú údaj o vláknine. Súčet je len zo známych hodnôt.</p>':""));
}

function nutrientCircle(actual,goal,colorClass){
 const remaining=Math.max(0,Math.ceil(goal-actual));
 const complete=actual>=goal;
 const progress=capProgress(actual,goal);
 const label=complete?"splnené":"zostáva";
 const value=complete?"0":fmt(remaining);
 return '<div class="nutrient-ring '+colorClass+'" role="progressbar" aria-label="'+(complete?"Cieľ splnený":"Zostáva "+value+" gramov")+'" aria-valuemin="0" aria-valuemax="'+fmt(goal)+'" aria-valuenow="'+fmt(Math.min(actual,goal))+'" style="--ring-fill:'+(progress*3.6)+'deg"><div class="nutrient-ring-center"><strong>'+value+'</strong><small>'+label+'</small></div></div>';
}
function recommendedDailyMovement(){
 // ~150 min/week of moderate activity, spread over six 25-minute days.
 // This is a practical activity benchmark, not calories to compensate with food.
 const minutes=25;
 const kcal=Math.round(exerciseBurn("walk",minutes)/25)*25;
 const totalToday=state.workouts.filter(w=>w.date===today).reduce((sum,w)=>sum+exerciseBurn(w.type,w.minutes),0);
 return {minutes,target:Math.max(75,kcal),burned:totalToday};
}
function renderHome(){
 const c=plan(),s=daily(today),sCount=streak(),start=state.profile.weight,target=state.profile.target;
 $("headerDate").textContent=formatDate(today);
 $("heroWeights").innerHTML=c.maintain?'Udržať <span>'+dec(start)+'</span> <small>kg</small>':dec(start)+' <span>→</span> '+dec(target)+' <small>kg</small>';
 $("heroStreak").innerHTML=icon("bolt")+" "+(sCount?sCount+" dní v rytme":"Začíname");
 $("heroRemaining").textContent=c.maintain?"± 1 kg":dec(c.remaining)+" kg";
 $("heroRemainingLabel").textContent=c.maintain?"približné rozpätie":c.gain?"zostáva nabrať":"zostáva do cieľa";
 $("heroWeeks").textContent=c.maintain?fmt(c.calories):c.weeks===null?"–":c.weeks;
 $("heroWeeklyLabel").textContent=c.maintain?"kcal denne":"týždňov (odhad)";
 const movement=recommendedDailyMovement();
 $("heroActivityTarget").innerHTML=fmt(movement.target)+' <small>kcal</small>';
 $("heroActivityProgress").textContent=fmt(movement.burned)+' / '+fmt(movement.target)+' kcal dnes';
 $("heroActivityNote").textContent='Orientačne '+movement.minutes+' min svižnej chôdze denne (v priemere 150 min týždenne). Pohyb sa nepripočítava k limitu jedla.';
 let p=c.maintain?100:c.gain?(start>=target?100:capProgress(lastWeight()-start,target-start)):start<=target?100:capProgress(start-lastWeight(),start-target);
 $("heroTrack").style.width=p+"%";
 $("heroCaption").textContent=c.maintain?"Cieľ je stabilná váha. Sleduj trend, nie jednotlivý deň.":c.remaining===0?"Cieľ dosiahnutý. Prejdi na udržiavanie.":p>0?"Už si prešiel "+fmt(p)+" % cesty.":"Prvý krok je začať.";
 $("homeCalories").textContent=fmt(s.kcal);$("homeCaloriesGoal").textContent=fmt(c.calories);
 $("homeRemaining").textContent=fmt(c.calories-s.kcal);
 $("energyRing").style.setProperty("--fill",Math.min(360,s.kcal/c.calories*360)+"deg");
 $("calorieFill").style.width=capProgress(s.kcal,c.calories)+"%";
 $("calorieNote").textContent=s.kcal>c.calories?"Cieľ je prekročený. Zajtra pokračuj normálne, bez kompenzovania.":s.kcal?"Sleduj príjem a jedz pravidelne.":"Pridaj svoje prvé jedlo. Začínaš jednoducho.";
 const macro=[["protein","Bielkoviny",s.protein,c.protein],["carbs","Sacharidy",s.carbs,c.carbs],["fat","Tuky",s.fat,c.fat]];
 $("homeMacros").innerHTML=macro.map(x=>'<div class="macro-card '+x[0]+'" data-nutrient="'+x[0]+'" role="button" tabindex="0" aria-label="Zobraziť jedlá podľa '+x[1]+'"><span>'+x[1]+'</span>'+nutrientCircle(x[2],x[3],x[0])+'<strong>'+fmt(x[2])+' <small>g</small></strong><small>z '+fmt(x[3])+' g</small></div>').join("");
 const hasUnknown=foodsFor(today).some(f=>f.fiber===null);
 $("homeExtras").innerHTML='<div class="nutrient-card sugar" data-nutrient="sugar" role="button" tabindex="0" aria-label="Zobraziť cukry podľa jedál"><div class="nutrient-body"><span>Cukry celkom</span>'+nutrientCircle(s.sugar,c.sugarsReference,"sugar")+'<strong>'+dec(s.sugar)+' <small>/ '+c.sugarsReference+' g</small></strong><small>EU referencia, nie limit</small></div></div>'+
 '<div class="nutrient-card fiber" data-nutrient="fiber" role="button" tabindex="0" aria-label="Zobraziť vlákninu podľa jedál"><div class="nutrient-body"><span>Vláknina</span>'+nutrientCircle(s.fiber,c.fiber,"fiber")+'<strong>'+dec(s.fiber)+' <small>/ '+c.fiber+' g</small></strong><small>'+(hasUnknown?"minimum zo známych hodnôt":"orientačný denný cieľ")+'</small></div></div>';
 const items=foodsFor(today).slice().reverse();
 $("homeMealList").innerHTML=items.length?items.slice(0,5).map(x=>mealMarkup(x,true)).join(""):'<div class="empty-state">'+icon("list")+'Dnes ešte nič nezaznamenané.<br>Začni prvým jedlom.</div>';
 if(s.kcal>c.calories){$("quoteTitle").textContent="Jeden deň nie je celý výsledok.";$("quoteText").textContent="Netrestaj sa hladovaním. Ďalším jedlom sa vráť do bežného režimu."}
 else if(items.length){$("quoteTitle").textContent="Dnes už robíš pokrok.";$("quoteText").textContent="Zapisovať si jedlo ti pomáha rozhodovať sa podľa údajov."}
 else{$("quoteTitle").textContent="Konzistentnosť je tvoja výhoda.";$("quoteText").textContent="Záznam jedla je malý krok, ktorý vieš zopakovať každý deň."}
}
function renderDiary(){
 const s=daily(selectedDay),c=plan();
 $("diaryDate").textContent=selectedDay===today?"Dnes · "+formatDate(today):formatDate(selectedDay,"full");
 $("diaryCalories").textContent=fmt(s.kcal);$("diaryRemaining").textContent=fmt(c.calories-s.kcal);$("diaryFill").style.width=capProgress(s.kcal,c.calories)+"%";
 $("diaryMacroText").textContent="Bielkoviny "+dec(s.protein)+" g  ·  Sacharidy "+dec(s.carbs)+" g  ·  Tuky "+dec(s.fat)+" g";
 $("diaryExtrasText").textContent="Cukry "+dec(s.sugar)+" / "+c.sugarsReference+" g (EU referencia) · Vláknina "+dec(s.fiber)+" / "+c.fiber+" g";
 $("diarySections").innerHTML=MEALS.map(([key,name])=>{
   const foods=foodsFor(selectedDay).filter(f=>f.meal===key);
   const total=foods.reduce((sum,f)=>({
     kcal:sum.kcal+(Number(f.kcal)||0),
     protein:sum.protein+(Number(f.protein)||0),
     carbs:sum.carbs+(Number(f.carbs)||0),
     fat:sum.fat+(Number(f.fat)||0)
   }),{kcal:0,protein:0,carbs:0,fat:0});
   const stat=(cls,label,value,unit)=>'<div class="meal-total '+cls+'"><span>'+label+'</span><strong>'+dec(value)+' <small>'+unit+'</small></strong></div>';
   return '<section class="diary-group" data-meal-section="'+key+'">'+
    '<div class="diary-head"><div><h2>'+name+'</h2><small>'+foods.length+' '+(foods.length===1?'jedlo':foods.length>=2&&foods.length<=4?'jedlá':'jedál')+'</small></div><button data-add-meal="'+key+'">+ Pridať</button></div>'+
    '<div class="meal-totals" aria-label="Súhrn '+name+'">'+
      stat('calories','Kalórie',total.kcal,'kcal')+
      stat('protein','Bielkoviny',total.protein,'g')+
      stat('carbs','Sacharidy',total.carbs,'g')+
      stat('fat','Tuky',total.fat,'g')+
    '</div>'+
    (foods.length?'<div class="card meal-foods">'+foods.map(f=>mealMarkup(f)).join("")+'</div>':
    '<p class="meal-empty">Zatiaľ bez jedla. Pridaj, čo si zjedol.</p>')+
   '</section>';
 }).join("");
}
function macroRow(key,name,g,show){return '<div class="macro-row '+key+'"><div class="row"><strong>'+name+'</strong><small>'+fmt(g)+' g / deň</small></div><div class="macro-line"><div style="width:'+show+'%"></div></div></div>'}
function exerciseBurn(type,minutes){return Math.round(EXERCISES[type].met*3.5*lastWeight()/200*minutes)}
function monday(date){let d=new Date(date+"T12:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));return dateLocal(d)}
function updatePlanModeUI(){
 const maintain=$("modeMaintain").checked;
 $("pTargetWrap").classList.toggle("hide",maintain);
 $("pRateWrap").classList.toggle("hide",maintain||$("modeGain").checked);
 $("pGainRateWrap").hidden=!$("modeGain").checked;
 $("pTarget").disabled=maintain;$("pRate").disabled=maintain||$("modeGain").checked;
 $("pTarget").value=maintain?$("pWeight").value:lossTargetDraft;
}
function renderPlan(){
 const c=plan(),p=state.profile;
 [["pWeight",p.weight],["pHeight",p.height],["pAge",p.age],["pSex",p.sex],["pActivity",p.activity],["pRate",p.rate]].forEach(x=>$(x[0]).value=x[1]);
 lossTargetDraft=p.lossTarget||p.target;$("pTarget").value=lossTargetDraft;
 $("pGainRate").value=p.gainRate||"moderate";
 $("modeMaintain").checked=c.maintain;$("modeGain").checked=c.gain;$("modeLose").checked=!c.maintain&&!c.gain;updatePlanModeUI();
 $("planCalories").textContent=fmt(c.calories);$("planTdee").textContent=fmt(c.tdee);
 $("planDeficit").textContent=c.maintain?"0":c.gain?"+"+fmt(c.surplus):"−"+fmt(c.deficit);
 $("planEnergyLabel").textContent=c.gain?"Denný nadbytok":c.maintain?"Energetický rozdiel":"Denný deficit";
 $("planWeeks").textContent=c.maintain?"Stabilne":c.weeks===null?"–":c.weeks+" t.";
 $("planDate").textContent=c.maintain?"bez termínu":c.targetDate?"cca "+formatDate(c.targetDate):"Odlišné tempo";
 $("planSubtitle").textContent=c.maintain?"Približne toľko energie potrebuješ na udržiavanie váhy.":c.gain?"Mierny kalorický nadbytok na podporu silového tréningu; sleduj trend váhy a výkonu.":c.capped?"Tempo bolo zmiernené, aby príjem nebol extrémne nízky.":"Odhad pri zvolenej aktivite a tempe.";
 $("planMacroCard").innerHTML=macroRow("protein","Bielkoviny",c.protein,Math.round(c.protein*4/c.calories*100))+macroRow("carbs","Sacharidy",c.carbs,Math.round(c.carbs*4/c.calories*100))+macroRow("fat","Tuky",c.fat,Math.round(c.fat*9/c.calories*100))+'<p class="card-sub">Bielkoviny: '+dec(c.proteinRate)+' g/kg '+(c.maintain||c.gain?"aktuálnej":"cieľovej")+' váhy podľa aktivity. Tuky cca 0,8 g/kg; zvyšok sacharidy. Ide o orientačný cieľ, nie povinné minimum.</p>';
 $("sugarAdvice").innerHTML='<strong>Cukry celkom: '+c.sugarsReference+' g/deň</strong> je európska referenčná hodnota pre priemerného dospelého pri 2 000 kcal, nie bezpečnostný limit.<br><strong>Voľné cukry: menej než '+c.freeSugarMax+' g/deň</strong> pri tvojom kalorickom cieli (WHO do 10 % energie), ideálne približne '+c.freeSugarIdeal+' g (5 %).';
 $("gymBurn").textContent="45 min ≈ "+fmt(exerciseBurn("gym",45))+" kcal";
 $("walkBurn").textContent="30 min ≈ "+fmt(exerciseBurn("walk",30))+" kcal";
 renderWorkouts();
}
function renderWorkouts(){
 const from=monday(today),to=addDays(from,6),current=state.workouts.filter(w=>w.date>=from&&w.date<=to);
 const cardio=current.filter(w=>w.type!=="gym").reduce((a,w)=>a+w.minutes,0),gym=current.filter(w=>w.type==="gym").length;
 $("exerciseWeek").textContent="Tento týždeň: fitko "+gym+"/2 · chôdza/kardio "+cardio+"/150 min";
 const list=state.workouts.slice().sort((a,b)=>b.date.localeCompare(a.date));
 $("workoutHistory").innerHTML=list.length?'<div class="history-title">POSLEDNÉ AKTIVITY</div>'+list.slice(0,12).map(w=>'<div class="meal-item"><div class="meal-details"><strong>'+escapeHTML(EXERCISES[w.type].name)+'</strong><small>'+formatDate(w.date)+' · '+w.minutes+' min · asi '+fmt(exerciseBurn(w.type,w.minutes))+' kcal</small></div><button class="small-button" data-remove-workout="'+escapeHTML(w.id)+'" aria-label="Vymazať tréning">'+icon("trash")+'</button></div>').join(""):'';
}
function renderProgress(){
 const c=plan(),arr=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));
 $("weightStart").textContent=dec(state.profile.weight);$("weightNow").textContent=dec(lastWeight());$("weightLeft").textContent=c.maintain?"± 1":dec(c.remaining);$("weightLeftLabel").textContent=c.maintain?"kg rozpätie":"kg do cieľa";
 $("chartSummary").textContent=arr.length+" zapísaných vážení";
 const svg=$("weightChart"),w=340,h=198,left=33,right=330,top=17,bottom=175;
 if(!arr.length){svg.innerHTML='<text x="170" y="93" text-anchor="middle">Zatiaľ žiadna zaznamenaná váha.</text><text x="170" y="109" text-anchor="middle">Pridaj prvé váženie.</text>';$("chartFirst").textContent="";$("chartLast").textContent=""}
 else{
  let vals=arr.map(a=>a.kg).concat([state.profile.target,state.profile.weight]),lo=Math.min(...vals)-1,hi=Math.max(...vals)+1;
  if(hi-lo<3){lo-=1;hi+=1}
  const x=i=>arr.length===1?(left+right)/2:left+(right-left)*i/(arr.length-1);
  const y=kg=>bottom-(kg-lo)/(hi-lo)*(bottom-top);
  let out="";
  for(let j=0;j<4;j++){const v=lo+(hi-lo)*j/3,yy=y(v);out+='<line x1="'+left+'" x2="'+right+'" y1="'+yy+'" y2="'+yy+'" stroke="#e8eee6" stroke-dasharray="4 5"/><text x="27" y="'+(yy+4)+'" text-anchor="end">'+dec(v)+'</text>'}
  const targetY=y(state.profile.target);
  out+='<line x1="'+left+'" x2="'+right+'" y1="'+targetY+'" y2="'+targetY+'" stroke="#8db16c" stroke-dasharray="5 5"/>';
  out+='<polyline class="chart-line" points="'+arr.map((a,i)=>x(i)+','+y(a.kg)).join(" ")+'"/>';
  out+=arr.map((a,i)=>'<circle r="4" cx="'+x(i)+'" cy="'+y(a.kg)+'" fill="#78b65e" stroke="#fff" stroke-width="2"/>').join("");
  svg.innerHTML=out;$("chartFirst").textContent=formatDate(arr[0].date);$("chartLast").textContent=formatDate(arr[arr.length-1].date);
 }
 $("weightHistory").innerHTML=arr.length?'<div class="history-title">HISTÓRIA VÁŽENÍ</div>'+arr.slice().reverse().slice(0,40).map(w=>'<div class="meal-item"><div class="meal-details"><strong>'+formatDate(w.date,"full")+'</strong><small>'+dec(w.kg)+' kg</small></div><button class="small-button" data-remove-weight="'+escapeHTML(w.date)+'" aria-label="Vymazať váženie">'+icon("trash")+'</button></div>').join(""):'';
}
function render(){renderHome();renderDiary();renderPlan();renderProgress()}
function bodyLock(){document.body.style.overflow="hidden"}
function bodyUnlock(){document.body.style.overflow=""}
function foodModal(options={}){
 ++activeLookupNonce;
 hideFoodSuggestions();
 $("foodSearchHelp").textContent="Vyhľadaj jedlo alebo si vyber z rýchlej ponuky.";
 $("quickFoods").hidden=false;renderQuickFoods();selectedFoodName="";
 $("foodForm").reset();$("foodEditId").value="";
 setProductImage("","");
 $("foodTitle").textContent=options.product?"Načítavam produkt…":"Pridať jedlo";
 $("foodStep").textContent="JEDÁLNIČEK";
 resetFoodCatalog();
 $("foodSave").innerHTML='Uložiť jedlo '+icon("check");
 $("foodSave").disabled=Boolean(options.product);
 $("foodMeal").value=options.meal||preferredMeal();
 $("foodDate").value=options.date||selectedDay;
 $("foodGrams").value="100";
 $("foodUnit").value="g";setFoodPortion("g",100);
 configureDishPortions(null);
 updateEggUI(null);
 ["fProtein","fCarbs","fFat","fSugar"].forEach(id=>$(id).value="0");
 $("fFiber").value="";$("fKcal").value="";$("foodEAN").value="";
 $("foodLookupMessage").hidden=true;$("foodLookupMessage").classList.remove("warn");
 $("foodDetails").open=false;
 if(options.record){
  const f=options.record,m=100/f.grams;
  $("foodEditId").value=f.id;$("foodTitle").textContent="Upraviť jedlo";
  $("foodSave").innerHTML='Uložiť zmeny '+icon("check");
  $("foodSave").disabled=false;
  $("foodName").value=f.name;$("foodGrams").value=f.grams;
  $("foodDate").value=f.date;$("foodMeal").value=f.meal;$("foodEAN").value=f.code||"";
  setProductImage(f.image,f.name);
  setFoodPortion(f.unit||"g",f.grams,"Pôvodne zapísané množstvo. Môžeš ho upraviť.");
  configureDishPortions(f.dish?{dish:true,portion:f.grams}:null);
  updateEggUI(f.eggCount?{recipe:"eggs",eggCount:f.eggCount,eggFat:f.eggFat}:null);
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([id,key])=>$(id).value=f[key]===null?"":round(f[key]*m));
  $("foodDetails").open=false;
  $("quickFoods").hidden=true;
 }
 if(options.product){
  const p=options.product;
  $("quickFoods").hidden=true;
  $("foodName").value=p.name||"";$("foodEAN").value=p.code||"";
  setProductImage(p.image,p.name);
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([id,key])=>$(id).value=p[key]==null?"":round(p[key]));
  if(p.notice){$("foodLookupMessage").hidden=false;$("foodLookupMessage").textContent=p.notice;$("foodLookupMessage").classList.add("warn")}
 }
 renderFoodPreview();updateFoodSaveState();$("foodOverlay").hidden=false;bodyLock();
}
function closeFood(){++activeLookupNonce;hideFoodSuggestions();$("foodOverlay").hidden=true;bodyUnlock()}
function renderFoodPreview(){
 const grams=Number($("foodGrams").value)||0,calc=id=>round((Number($(id).value)||0)*grams/100);
 $("foodPreviewCalories").textContent=fmt(calc("fKcal"))+" kcal";
 $("foodPreviewMacros").textContent="B "+dec(calc("fProtein"))+" g · S "+dec(calc("fCarbs"))+" g · T "+dec(calc("fFat"))+" g · Cukry "+dec(calc("fSugar"))+" g";
 $all("[data-grams]").forEach(el=>el.classList.toggle("selected",Number(el.dataset.grams)===grams));
 updateDishPortionButtons();
}
function submitFood(e){
 e.preventDefault();
 const grams=Number($("foodGrams").value),date=$("foodDate").value,meal=$("foodMeal").value,name=$("foodName").value.trim();
 if(!validDate(date)||!MEALS.some(x=>x[0]===meal)||!validNum(grams,1,10000)||!name){notify("Doplň správne údaje o jedle.");return}
 const formValues=[["fKcal","kcal",2000],["fProtein","protein",100],["fCarbs","carbs",100],["fFat","fat",100],["fSugar","sugar",100]];
 const data={};for(const [id,key,max] of formValues){if(!validNum($(id).value,0,max)){notify("Skontroluj výživové hodnoty na 100 g.");return}data[key]=round(Number($(id).value)*grams/100)}
 const fiber=$("fFiber").value===""?null:Number($("fFiber").value);
 if(fiber!==null&&!validNum(fiber,0,100)){notify("Skontroluj vlákninu.");return}
 const old=$("foodEditId").value;
 const entry={id:old||String(uid()),name:name.slice(0,100),date,meal,grams,unit:$("foodUnit").value==="ml"?"ml":"g",...data,fiber:fiber===null?null:round(fiber*grams/100),code:$("foodEAN").value.trim(),image:!$("selectedProductVisual").hidden?safeFoodImage($("selectedProductPicture").querySelector("img")?.src):"",dish:!$("dishPortions").hidden,eggCount:$("eggRecipe").hidden?null:activeEggCount,eggFat:$("eggRecipe").hidden?"none":activeEggFat};
 if(old)state.foods=state.foods.filter(f=>f.id!==old);
 state.foods.push(entry);selectedDay=date;save();closeFood();render();notify(old?"Zmeny boli uložené.":"Jedlo je zapísané.");
}
function submitPlan(e){
 e.preventDefault();
 const maintain=$("modeMaintain").checked,gain=$("modeGain").checked,weight=Number($("pWeight").value),target=maintain?weight:Number($("pTarget").value);
 const p={weight,target,height:+$("pHeight").value,age:+$("pAge").value,sex:$("pSex").value,
  activity:+$("pActivity").value,rate:maintain?state.profile.rate:+$("pRate").value,gainRate:$("pGainRate").value,
  mode:maintain?"maintain":gain?"gain":"lose",lossTarget:maintain?lossTargetDraft:target};
 if(!validProfile(p)||(!maintain&&!gain&&p.target>p.weight)||(gain&&p.target<=p.weight)){notify("Skontroluj cieľovú váhu: pri naberaní musí byť vyššia, pri chudnutí nižšia alebo rovnaká.");return}
 state.profile=p;save();render();notify(maintain?"Zapol si udržiavanie váhy.":gain?"Plán naberania svalov je pripravený.":"Plán chudnutia je prepočítaný.");
}
function submitWeight(e){
 e.preventDefault();const date=$("weightDate").value,kg=Number($("weightNumber").value);
 if(!validDate(date)||!validNum(kg,35,300)){notify("Skontroluj dátum a váhu.");return}
 state.weights=state.weights.filter(x=>x.date!==date);state.weights.push({date,kg});save();render();$("weightNumber").value="";notify("Váha bola uložená.");
}
function submitWorkout(e){
 e.preventDefault();const date=$("wDate").value,type=$("wType").value,minutes=Number($("wMin").value);
 if(!validDate(date)||!EXERCISES[type]||!validNum(minutes,1,480)){notify("Skontroluj údaje o pohybe.");return}
 state.workouts.push({id:String(uid()),date,type,minutes});save();render();notify("Pohyb je zapísaný.");
}
function exportData(){
 const blob=new Blob([JSON.stringify({...state,profileName:findActiveProfile()?.name||"Používateľ",exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="forma-zaloha-"+today+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function importData(file){if(!file)return;try{const data=normalize(JSON.parse(await file.text()));if(!confirm("Nahradiť VŠETKY záznamy iba v profile "+(findActiveProfile()?.name||"aktuálny")+" obsahom zálohy?"))return;state=data;save();render();notify("Záloha obnovená.")}catch(e){notify("Záloha je neplatná.")}}
function scanMessage(message,isError=false){
 $("scanStatus").textContent=message;$("scanStatus").classList.toggle("error",isError);
}
function cameraPlaceholder(message,show=true){
 $("cameraPlaceholder").hidden=!show;
 if(show)$("cameraPlaceholder").querySelector("span").textContent=message;
}
function isValidEAN(code){return /^\d{8,14}$/.test(String(code||"").trim())}
function errorText(error){
 if(!error)return "Neznáma chyba.";
 if(error.name==="NotAllowedError"||error.name==="PermissionDeniedError")return "Prístup ku kamere bol zamietnutý. Povoľ kameru v nastaveniach prehliadača.";
 if(error.name==="NotFoundError"||error.name==="DevicesNotFoundError")return "Nenašla sa kamera. Môžeš nahrať fotografiu alebo zadať EAN ručne.";
 if(error.name==="NotReadableError")return "Kamera je obsadená inou aplikáciou. Zavri ju a skús znova.";
 return error.message||String(error);
}
function addScript(url){
 return new Promise(resolve=>{
  const script=document.createElement("script");
  script.async=true;script.src=url;
  script.onload=()=>resolve(!!(window.ZXingWASM&&window.ZXingWASM.readBarcodes));
  script.onerror=()=>resolve(false);
  document.head.appendChild(script);
 });
}
async function getZxing(){
 if(zxingReady&&window.ZXingWASM&&window.ZXingWASM.readBarcodes)return window.ZXingWASM;
 if(zxingPromise)return zxingPromise;
 zxingPromise=(async()=>{
  const urls=[
   "./vendor/zxing-reader.js",
   "https://cdn.jsdelivr.net/npm/zxing-wasm@"+LIB_VERSION+"/dist/iife/reader/index.js",
   "https://unpkg.com/zxing-wasm@"+LIB_VERSION+"/dist/iife/reader/index.js"
  ];
  if(!window.ZXingWASM?.readBarcodes){
   let loaded=false;
   for(const url of urls){if(await addScript(url)){loaded=true;break}}
   if(!loaded)throw Error("Nepodarilo sa načítať knižnicu na rozpoznávanie kódov. Skontroluj pripojenie.");
  }
  // Load WebAssembly explicitly: this also lets us retry on another CDN.
  const binaryUrls=[
   "./vendor/zxing_reader.wasm",
   "https://cdn.jsdelivr.net/npm/zxing-wasm@"+LIB_VERSION+"/dist/reader/zxing_reader.wasm",
   "https://unpkg.com/zxing-wasm@"+LIB_VERSION+"/dist/reader/zxing_reader.wasm"
  ];
  let bytes=null;
  for(const url of binaryUrls){
   try{
    const response=await fetch(url,{cache:"force-cache"});
    if(response.ok){bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>100000)break}
   }catch(e){console.warn("WASM CDN:",errorText(e))}
  }
  if(!bytes||bytes.byteLength<=100000)throw Error("Nedá sa stiahnuť dekodér kódov. Skontroluj internet.");
  if(typeof window.ZXingWASM.prepareZXingModule==="function"){
   await window.ZXingWASM.prepareZXingModule({
    overrides:{wasmBinary:bytes},
    fireImmediately:true
   });
  }
  zxingReady=true;
  return window.ZXingWASM;
 })().catch(error=>{
  zxingPromise=null;
  console.warn("ZXing WASM inicializácia:",error);
  throw error;
 });
 return zxingPromise;
}
async function getNativeDetector(){
 if(typeof window.BarcodeDetector!=="function")return null;
 try{
  const supported=await window.BarcodeDetector.getSupportedFormats();
  const formats=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","itf"].filter(x=>supported.includes(x));
  return formats.length?new window.BarcodeDetector({formats}):null;
 }catch(e){return null}
}
function foundBarcode(matches){
 if(!Array.isArray(matches))return null;
 for(const m of matches){
  const code=String(m.text||m.rawValue||"").trim();
  if(isValidEAN(code))return code;
 }
 return null;
}
async function stopCamera(){
 ++scanSession;
 if(nativeTimer!==null){clearTimeout(nativeTimer);nativeTimer=null}
 frameInFlight=false;
 const video=$("cameraVideo");
 video.pause();
 video.srcObject=null;
 if(nativeStream){nativeStream.getTracks().forEach(t=>t.stop());nativeStream=null}
 $("nativeCamera").hidden=false;
 $("html5Camera").hidden=true;
}
function closeScan(){
 stopCamera();
 $("scanOverlay").hidden=true;bodyUnlock();
}
function scanSuccess(code){
 if(barcodeBusy||!isValidEAN(code))return;
 barcodeBusy=true;
 scanMessage("Kód rozpoznaný: "+code+". Hľadám produkt…");
 try{navigator.vibrate?.(75)}catch(e){}
 stopCamera();
 $("scanOverlay").hidden=true;bodyUnlock();
 lookupCode(String(code).trim()).finally(()=>{barcodeBusy=false});
}
async function readFrame(){
 if(!nativeStream||barcodeBusy||!frameContext)return null;
 const video=$("cameraVideo");
 if(video.readyState<2||!video.videoWidth||!video.videoHeight)return null;
 const width=Math.min(1600,video.videoWidth);
 const height=Math.round(video.videoHeight*width/video.videoWidth);
 if(frameCanvas.width!==width||frameCanvas.height!==height){frameCanvas.width=width;frameCanvas.height=height}
 frameContext.drawImage(video,0,0,width,height);
 const pixels=frameContext.getImageData(0,0,width,height);
 let code=null;
 if(nativeDetector){
  try{code=foundBarcode(await nativeDetector.detect(frameCanvas));if(code)return code}catch(e){nativeDetector=null}
 }
 if(zxingReady&&window.ZXingWASM?.readBarcodes){
  const hits=await window.ZXingWASM.readBarcodes(pixels,{formats:BARCODE_FORMATS,tryHarder:scanAttempts%3===2,maxNumberOfSymbols:2});
  code=foundBarcode(hits);
  if(code)return code;
 }
 return null;
}
function scanLoop(token){
 if(token!==scanSession||barcodeBusy||$("scanOverlay").hidden)return;
 if(frameInFlight)return;
 frameInFlight=true;
 (async()=>{
  try{
   const code=await readFrame();
   if(token!==scanSession)return;
   if(code){scanSuccess(code);return}
   scanAttempts++;
   if(scanAttempts===18)scanMessage("Stále hľadám kód. Drž obal 10–20 cm od kamery, bez odleskov.");
   if(scanAttempts===45)scanMessage("Ak je kód veľmi malý, skús obal priblížiť, inak použi Odfotiť obal.");
  }catch(e){
   if(scanAttempts%8===0)console.warn("Čítanie obrazu:",e);
   scanAttempts++;
  }finally{
   frameInFlight=false;
   if(token===scanSession&&!barcodeBusy&&!$("scanOverlay").hidden)nativeTimer=setTimeout(()=>scanLoop(token),210);
  }
 })();
}
async function cameraList(){
 try{
  if(!navigator.mediaDevices?.enumerateDevices)return [];
  const devices=await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d=>d.kind==="videoinput");
 }catch(e){return []}
}
async function openScanner(){
 if(!$("scanOverlay").hidden)return;
 await stopCamera();
 $("scanOverlay").hidden=false;bodyLock();barcodeBusy=false;requestedDeviceId=null;
 await startCamera();
}
async function startCamera(){
 await stopCamera();barcodeBusy=false;scanAttempts=0;nativeDetector=null;
 cameraPlaceholder("Pripravujem zadnú kameru…");
 scanMessage("Zapínam kameru…");
 if(!window.isSecureContext){cameraPlaceholder("Kamera vyžaduje HTTPS.");scanMessage("Otvor GitHub Pages cez https:// a povoľ kameru.",true);return}
 if(!navigator.mediaDevices?.getUserMedia){cameraPlaceholder("Prehliadač nepodporuje kameru.");scanMessage("Skús Safari alebo Chrome. Prípadne odfoť kód a načítaj fotografiu.",true);return}
 const token=scanSession;
 try{
  const videoOptions=requestedDeviceId?{deviceId:{exact:requestedDeviceId},width:{ideal:1920},height:{ideal:1080}}:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}};
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:videoOptions});
  if(token!==scanSession){stream.getTracks().forEach(t=>t.stop());return}
  nativeStream=stream;
  const video=$("cameraVideo");
  video.srcObject=stream;
  await video.play();
  if(token!==scanSession)return;
  cameraPlaceholder("",false);
  cameraDevices=await cameraList();
  scanMessage("Kamera beží. Pripravujem rozpoznávanie čiarového kódu…");
  nativeDetector=await getNativeDetector();
  if(token!==scanSession)return;
  // The native browser detector is not reliable on every iPhone. Always load
  // the independent WASM implementation too.
  try{
   await getZxing();
  }catch(e){
   if(!nativeDetector){
    scanMessage(errorText(e)+" Môžeš použiť fotografiu alebo zadať EAN.",true);
    return;
   }
  }
  if(token!==scanSession)return;
  scanStartedAt=Date.now();
  scanMessage("Skenovanie je aktívne. Namier celý čiarový kód do rámčeka.");
  scanLoop(token);
 }catch(e){
  if(token!==scanSession)return;
  console.warn("Chyba kamery:",e);
  cameraPlaceholder("Kameru sa nepodarilo spustiť.");
  scanMessage(errorText(e),true);
 }
}
async function switchCamera(){
 if(cameraDevices.length<2)cameraDevices=await cameraList();
 if(cameraDevices.length<2){
  scanMessage("Na zariadení sa zistila len jedna kamera. Skús odfotiť kód alebo uprav vzdialenosť.",true);return;
 }
 const activeId=nativeStream?.getVideoTracks()[0]?.getSettings()?.deviceId;
 let index=cameraDevices.findIndex(c=>c.deviceId===activeId);
 index=(index+1)%cameraDevices.length;
 requestedDeviceId=cameraDevices[index].deviceId;
 await startCamera();
}
async function loadImageData(file){
 const img=await createImageBitmap(file,{imageOrientation:"from-image"});
 const max=2200;
 const scale=Math.min(1,max/Math.max(img.width,img.height));
 const canvas=document.createElement("canvas");
 canvas.width=Math.max(1,Math.round(img.width*scale));
 canvas.height=Math.max(1,Math.round(img.height*scale));
 const context=canvas.getContext("2d",{willReadFrequently:true});
 context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);
 context.drawImage(img,0,0,canvas.width,canvas.height);
 img.close?.();
 return {canvas,context};
}
async function photoDecode(file){
 if(!file)return;
 await stopCamera();
 photoProcessing=true;
 cameraPlaceholder("Rozpoznávam čiarový kód z fotografie…");
 scanMessage("Načítavam fotografiu. Čakaj na výsledok rozpoznávania.");
 const token=scanSession;
 try{
  const decoder=await getZxing();
  if(token!==scanSession)return;
  let code=foundBarcode(await decoder.readBarcodes(file,{formats:BARCODE_FORMATS,tryHarder:true,maxNumberOfSymbols:4}));
  if(!code){
   const {canvas,context}=await loadImageData(file);
   let pixels=context.getImageData(0,0,canvas.width,canvas.height);
   code=foundBarcode(await decoder.readBarcodes(pixels,{formats:BARCODE_FORMATS,tryHarder:true,maxNumberOfSymbols:4}));
   // Try additional orientations if the phone metadata or photo rotation is unusual.
   for(const angle of [90,180,270]){
    if(code||token!==scanSession)break;
    const rotated=document.createElement("canvas");
    rotated.width=angle%180?canvas.height:canvas.width;
    rotated.height=angle%180?canvas.width:canvas.height;
    const ctx=rotated.getContext("2d",{willReadFrequently:true});
    ctx.translate(rotated.width/2,rotated.height/2);
    ctx.rotate(angle*Math.PI/180);
    ctx.drawImage(canvas,-canvas.width/2,-canvas.height/2);
    pixels=ctx.getImageData(0,0,rotated.width,rotated.height);
    code=foundBarcode(await decoder.readBarcodes(pixels,{formats:BARCODE_FORMATS,tryHarder:true,maxNumberOfSymbols:4}));
   }
  }
  if(token!==scanSession)return;
  if(code){scanSuccess(code);return}
  scanMessage("Z fotografie sa čiarový kód nepodarilo prečítať. Odfotiť treba celý kód s bočnými bielymi okrajmi, ostro a bez odlesku.",true);
  cameraPlaceholder("EAN sa nenašiel.");
 }catch(e){
  if(token!==scanSession)return;
  console.warn("Chyba foto dekódovania:",e);
  scanMessage("Nepodarilo sa spracovať fotku: "+errorText(e),true);
  cameraPlaceholder("Skenovanie fotky zlyhalo.");
 }finally{photoProcessing=false}
}
async function lookupCode(code){
 const input=String(code||"").trim();
 if(!isValidEAN(input)){notify("EAN musí mať 8 až 14 číslic.");return}
 foodModal({meal:foodContextMeal,date:selectedDay,product:{code:input,name:"",notice:"Načítavam produkt…"}});
 const nonce=activeLookupNonce,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const url="https://world.openfoodfacts.org/api/v3/product/"+encodeURIComponent(input)+"?fields=code,product_name,product_name_sk,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,nutriments,image_front_small_url,image_small_url,image_front_url,image_url,selected_images,lang,lc";
  const response=await fetch(url,{signal:controller.signal,headers:{"Accept":"application/json"}});
  if(!response.ok)throw Error("API odpovedalo chybou "+response.status);
  const data=await response.json();
  if(!data.product||data.status==="failure"||data.status===0)throw Error("Výrobok sa v databáze nenašiel.");
  if(nonce!==activeLookupNonce||$("foodOverlay").hidden)return;
  const p=data.product, info=nutritionFromOFF(p);
  $("foodName").value=info.name||"Produkt "+input;selectedFoodName=$("foodName").value;$("foodTitle").textContent="Zapísať potravinu";
  setProductImage(info.image,info.name);
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([field,key])=>$(field).value=info[key]===null?"":round(info[key]));
  setFoodPortion(info.unit,info.portion,info.fromLabel?"Porcia podľa výrobku. Uprav podľa toho, koľko si naozaj mal.":"Orientačná porcia. Množstvo môžeš upraviť.");
  const missing=["kcal","protein","carbs","fat","sugar"].filter(k=>info[k]===null);
  $("foodSave").disabled=false;
  $("foodLookupMessage").hidden=false;
  $("foodLookupMessage").classList.toggle("warn",missing.length>0);
  $("foodLookupMessage").textContent=missing.length?"Produkt sa našiel, ale niektoré hodnoty chýbajú. Otvorené detaily doplň podľa etikety.":"Produkt nájdený. Skontroluj množstvo a ulož.";
  $("foodDetails").open=missing.length>0;
  renderFoodPreview();updateFoodSaveState();
 }catch(e){
  if(nonce!==activeLookupNonce||$("foodOverlay").hidden)return;
  $("foodTitle").textContent="Pridať jedlo ručne";
  $("foodSave").disabled=false;
  $("foodDetails").open=true;
  $("foodLookupMessage").hidden=false;$("foodLookupMessage").classList.add("warn");
  $("foodLookupMessage").textContent="Nenašlo sa: "+(e.name==="AbortError"?"Vyhľadávanie trvalo príliš dlho.":e.message)+ " Hodnoty môžeš zadať ručne.";
 }finally{clearTimeout(timeout)}
}
function delegatedClick(e){
 const nav=e.target.closest("[data-nav]");if(nav){setView(nav.dataset.nav);return}
 if(e.target.closest('[data-action="scan"]')){foodContextMeal=preferredMeal();selectedDay=today;openScanner();return}
 const meal=e.target.closest("[data-add-meal]");if(meal){foodContextMeal=meal.dataset.addMeal;foodModal({meal:foodContextMeal,date:selectedDay});return}
 const edit=e.target.closest("[data-edit-food]");if(edit){let f=state.foods.find(x=>x.id===edit.dataset.editFood);if(f)foodModal({record:f});return}
 const remove=e.target.closest("[data-remove-food]");if(remove){if(confirm("Vymazať toto jedlo?")){state.foods=state.foods.filter(x=>x.id!==remove.dataset.removeFood);save();render();notify("Jedlo vymazané.")}return}
 if(e.target.closest("#homeAdd"))return;
 const foodDetail=e.target.closest("[data-food-detail]");
 if(foodDetail){showFoodNutrition(foodDetail.dataset.foodDetail);return}
 const metric=e.target.closest("[data-nutrient]");
 if(metric){showNutrientBreakdown(metric.dataset.nutrient);return}
 const wr=e.target.closest("[data-remove-weight]");if(wr){if(confirm("Vymazať toto váženie?")){state.weights=state.weights.filter(x=>x.date!==wr.dataset.removeWeight);save();render()}return}
 const ex=e.target.closest("[data-remove-workout]");if(ex){if(confirm("Vymazať túto aktivitu?")){state.workouts=state.workouts.filter(x=>x.id!==ex.dataset.removeWorkout);save();render()}return}
}
document.addEventListener("click",delegatedClick);
$("profileGithubConnect").addEventListener("click",()=>{
 $("profileOverlay").hidden=true;
 bodyUnlock();
 setView("settings");
 $("githubSyncSettings").scrollIntoView({block:"start",behavior:"smooth"});
 void githubRestoreSession();
});
$("githubRefreshBtn").addEventListener("click",()=>void githubRestoreSession());
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden&&Date.now()-githubSyncLastRead>30000)void githubRestoreSession();
});
$("profileUnlockForm").addEventListener("submit",unlockProfile);
$("profileUnlockCancel").addEventListener("click",cancelProfileUnlock);
$("profilePasswordForm").addEventListener("submit",saveProfilePassword);
$("profileHeaderBtn").addEventListener("click",openProfiles);
$("changeProfileBtn").addEventListener("click",openProfiles);
$("renameProfileBtn").addEventListener("click",renameProfile);
$("profileRenameForm").addEventListener("submit",submitProfileRename);
$("profileRenameCancel").addEventListener("click",()=>{$("profileRenameForm").hidden=true});
$("logoutProfileBtn").addEventListener("click",logoutProfile);
$("closeProfile").addEventListener("click",closeProfiles);
$("toggleNewProfile").addEventListener("click",()=>{
 const form=$("newProfileForm");
 form.hidden=!form.hidden;
 if(!form.hidden)$("newProfileName").focus();
});
$("profileList").addEventListener("click",e=>{
 const btn=e.target.closest("[data-profile-select]");
 if(btn)switchProfile(btn.dataset.profileSelect);
});
function suggestRegistrationGoal(){
 const weight=Number($("newProfileWeight").value),target=Number($("newProfileTarget").value);
 if(!(weight>0&&target>0))return;
 const goal=target>weight?"gain":target===weight?"maintain":"lose";
 $("newProfileGoal").value=goal;
 updateRegistrationGoalHelp();
}
function updateRegistrationGoalHelp(){
 const goal=$("newProfileGoal").value;
 $("newProfileGoalHelp").textContent=goal==="gain"?"Pri naberaní nastav vyššiu cieľovú váhu. Tempo naberania zmeníš potom v Pláne.":goal==="maintain"?"Pri udržiavaní nastav rovnakú aktuálnu a cieľovú váhu.":"Pri chudnutí nastav nižšiu cieľovú váhu.";
}
$("newProfileWeight").addEventListener("change",suggestRegistrationGoal);
$("newProfileTarget").addEventListener("input",suggestRegistrationGoal);
$("newProfileGoal").addEventListener("change",updateRegistrationGoalHelp);
$("newProfileForm").addEventListener("submit",createProfile);
$("homeAdd").addEventListener("click",()=>{foodContextMeal=preferredMeal();foodModal({meal:foodContextMeal,date:today})});
$("prevDay").addEventListener("click",()=>{selectedDay=addDays(selectedDay,-1);renderDiary()});
$("nextDay").addEventListener("click",()=>{selectedDay=addDays(selectedDay,1);renderDiary()});
$("foodForm").addEventListener("submit",submitFood);
$("foodForm").addEventListener("input",()=>{renderFoodPreview();updateFoodSaveState()});
$("foodName").addEventListener("input",foodNameChanged);
$("foodName").addEventListener("keydown",foodNameKeys);
$all("[data-quick-food]").forEach(el=>el.addEventListener("click",()=>{
 if(el.dataset.quickFood==="scrambled_eggs"){applyFoodSuggestion(eggFood(3));return}
 const f=COMMON_FOODS.find(x=>x.key===el.dataset.quickFood);
 if(f)applyFoodSuggestion({...f,id:"common:"+f.key,source:f.dish?"dish":"estimate",fromLabel:false});
}));
$all("[data-dish-factor]").forEach(button=>button.addEventListener("click",()=>{
 const grams=Number(button.dataset.portionGrams);
 if(validNum(grams,50,3000)){$("foodGrams").value=grams;renderFoodPreview();updateFoodSaveState()}
}));
$("foodCatalogCategories").addEventListener("click",e=>{
 const button=e.target.closest("button[data-food-category]");
 if(button)showFoodCatalogCategory(button.dataset.foodCategory,button);
});
$("foodCatalogBack").addEventListener("click",()=>{
 $("foodCatalogActive").hidden=true;
 $("foodCatalogCategories").hidden=false;
 $all("#foodCatalogActive .quick-dishes-expand").forEach(section=>{section.open=false});
 $("foodCatalog").querySelector("summary").focus({preventScroll:true});
});
$("recentFoods").addEventListener("click",e=>{const b=e.target.closest("[data-recent-index]");if(b)applyFoodSuggestion(recentQuickFoods[Number(b.dataset.recentIndex)])});
$("eggMinus").addEventListener("click",()=>{activeEggCount=Math.max(1,activeEggCount-1);recalculateEgg()});
$("eggPlus").addEventListener("click",()=>{activeEggCount=Math.min(8,activeEggCount+1);recalculateEgg()});
$("eggFatSelect").addEventListener("change",()=>{activeEggFat=$("eggFatSelect").value;recalculateEgg()});
$("foodSuggestions").addEventListener("click",e=>{
 if(!e.target.closest("#foodSearchRetry"))return;
 const value=$("foodName").value.trim();
 if(value.length<3)return;
 clearTimeout(searchTimer);
 if(searchAbort){searchAbort.abort();searchAbort=null}
 const token=++searchGeneration;
 const local=findCommon(value);
 remoteSearchPauseUntil=0;
 renderFoodSuggestions(local,[],true);
 void remoteFoodSearch(value,token,local,{force:true});
});
$("foodSuggestions").addEventListener("pointerdown",e=>{const b=e.target.closest("[data-suggest]");if(b)e.preventDefault()});
$("foodSuggestions").addEventListener("click",e=>{const b=e.target.closest("[data-suggest]");if(b)applyFoodSuggestion(suggestions[Number(b.dataset.suggest)])});
$("foodForm").addEventListener("invalid",e=>{if($("foodDetails").contains(e.target))$("foodDetails").open=true},true);
$("amountMinus").addEventListener("click",()=>{$("foodGrams").value=Math.max(1,(Number($("foodGrams").value)||100)-25);renderFoodPreview()});
$("amountPlus").addEventListener("click",()=>{$("foodGrams").value=Math.min(10000,(Number($("foodGrams").value)||0)+25);renderFoodPreview()});
$all("[data-grams]").forEach(el=>el.addEventListener("click",()=>{$("foodGrams").value=el.dataset.grams;renderFoodPreview()}));
$("modeMaintain").addEventListener("change",updatePlanModeUI);
$("modeLose").addEventListener("change",updatePlanModeUI);
$("modeGain").addEventListener("change",updatePlanModeUI);
$("pWeight").addEventListener("input",()=>{if($("modeMaintain").checked)$("pTarget").value=$("pWeight").value});
$("pTarget").addEventListener("input",()=>{if(!$("modeMaintain").checked)lossTargetDraft=Number($("pTarget").value)||lossTargetDraft});
$("planForm").addEventListener("submit",submitPlan);
$("weightForm").addEventListener("submit",submitWeight);
$("workoutForm").addEventListener("submit",submitWorkout);
$("closeNutrition").addEventListener("click",closeNutritionDialog);
$("nutritionOverlay").addEventListener("click",e=>{if(e.target===$("nutritionOverlay"))closeNutritionDialog()});
document.addEventListener("keydown",e=>{
 if(!$("nutritionOverlay").hidden&&e.key==="Escape"){e.preventDefault();closeNutritionDialog()}
 if(e.key==="Enter"||e.key===" "){
  const target=e.target.closest("[data-nutrient],.meal-item[data-food-detail]");
  if(target&&!target.closest("button")){e.preventDefault();target.click()}
 }
});
$("closeFood").addEventListener("click",closeFood);
$("foodOverlay").addEventListener("click",e=>{if(e.target===$("foodOverlay"))closeFood()});
$("closeScan").addEventListener("click",closeScan);
$("scanOverlay").addEventListener("click",e=>{if(e.target===$("scanOverlay"))closeScan()});
$("fallbackScan").addEventListener("click",switchCamera);
$("photoScan").addEventListener("click",()=>{$("barcodePhoto").click()});
$("barcodePhoto").addEventListener("change",async e=>{const file=e.target.files[0];e.target.value="";if(file)await photoDecode(file)});
$("manualLookup").addEventListener("click",async()=>{
 const code=$("manualEAN").value.trim();if(!isValidEAN(code)){scanMessage("Zadaj 8 až 14 číslic EAN/UPC.",true);return}scanSuccess(code);
});
$("manualEAN").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("manualLookup").click()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("scanOverlay").hidden)closeScan();else if(!$("foodOverlay").hidden)closeFood()}});
$("exportBtn").addEventListener("click",exportData);
$("importBtn").addEventListener("click",()=>$("importFile").click());
$("importFile").addEventListener("change",async e=>{await importData(e.target.files[0]);e.target.value=""});
$("resetBtn").addEventListener("click",()=>{if(confirm("Naozaj odstrániť záznamy aktuálneho profilu? Bez zálohy ich neobnovíš.")){state=structuredCloneSafe(DEFAULT);selectedDay=today;save();render();notify("Všetky záznamy boli vymazané.")}});
$("weightDate").value=today;$("wDate").value=today;
render();syncProfileBadge();setView("home");githubRestoreSession();if(!activeProfileId)openProfiles();
})();
