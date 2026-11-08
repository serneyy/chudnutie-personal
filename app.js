/* FORMA 3.0 | mobile-first personal tracker | no server-side account */
(function(){
"use strict";
const KEY="forma-personal-v2"; // Legacy single-profile data, retained as a safety backup
const PROFILE_STORE_KEY="forma-local-profiles-v1";
const PROFILE_ACTIVE_KEY="forma-active-profile-v1";
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
 {key:"bread",name:"Chlieb pšenično-ražný",aliases:["chlieb","bread"],unit:"g",portion:40,kcal:240,protein:8,carbs:47,fat:2,sugar:3,fiber:5}
];
let suggestions=[],suggestionCursor=-1,searchTimer=null,searchAbort=null,searchGeneration=0,searchNetworkHistory=[],lastSearchAt=0,selectedFoodName="";
let recentQuickFoods=[],activeDishPortion=null;
const searchCache=new Map();
const FOOD_SEARCH_CACHE_KEY="forma-off-search-cache-v2";
const FOOD_SEARCH_CACHE_TTL_MS=24*60*60*1000;
let remoteSearchPauseUntil=0;
function getCachedFoodSearch(query){
 const item=searchCache.get(query);
 if(item&&Date.now()-item.ts<(item.products.length?FOOD_SEARCH_CACHE_TTL_MS:5*60*1000))return item.products;
 return null;
}
function rememberFoodSearch(query,products){
 searchCache.set(query,{ts:Date.now(),products});
 const recent=[...searchCache.entries()].filter(([q,v])=>q.length<100&&Date.now()-v.ts<FOOD_SEARCH_CACHE_TTL_MS).slice(-25);
 try{localStorage.setItem(FOOD_SEARCH_CACHE_KEY,JSON.stringify(recent))}catch(e){console.warn("Vyhľadávacia cache:",e)}
}
try{
 const entries=JSON.parse(localStorage.getItem(FOOD_SEARCH_CACHE_KEY)||"[]");
 if(Array.isArray(entries))for(const [q,v] of entries.slice(-25)){
  if(typeof q==="string"&&v&&Array.isArray(v.products)&&Number.isFinite(v.ts)&&Date.now()-v.ts<FOOD_SEARCH_CACHE_TTL_MS){
   searchCache.set(q,{ts:v.ts,products:v.products.slice(0,6)});
  }
 }
}catch(e){console.warn("Cache produktov sa nepodarilo načítať:",e)}

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
  if(parsed.protocol!=="https:"||!["images.openfoodfacts.org","static.openfoodfacts.org"].includes(parsed.hostname))return "";
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
 return safe?'<img class="'+cssClass+'" src="'+escapeHTML(safe)+'" alt="Fotografia balenia" loading="lazy" decoding="async" referrerpolicy="no-referrer">':"";
}
function setProductImage(url,name=""){
 const image=safeFoodImage(url);
 const container=$("selectedProductVisual");
 container.hidden=!image;
 $("selectedProductPicture").innerHTML=foodImageMarkup(image,"selected-product-img");
 $("selectedProductLabel").textContent=name||"Vybraný výrobok";
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
 }).filter(Boolean).sort((a,b)=>b._searchScore-a._searchScore).slice(0,8);
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
  const text=item.source==="recipe"?"RECEPT • zvoľ počet vajec a tuk":item.source==="dish"?"HOTOVÉ JEDLO • hrubý odhad":item.source==="estimate"?"Odhad • bežná porcia":item.source==="recent"?"Z posledného zápisu":"Open Food Facts"+(item.brand?" • "+item.brand:"");
  return '<button type="button" class="food-suggestion" role="option" aria-selected="false" data-suggest="'+index+'"><span class="food-suggestion-icon '+(item.source==="off"?"remote":"")+'">'+(foodImageMarkup(item.image,"food-suggestion-image")||(item.unit==="ml"?"☕":"◉"))+'</span><span class="food-suggestion-body"><span class="food-suggestion-title">'+escapeHTML(item.name)+'</span><span class="food-suggestion-meta">'+escapeHTML(text)+' · '+fmt(item.portion)+' '+item.unit+'</span></span><span class="food-suggestion-calories">'+(item.kcal==null?"Doplniť":fmt(item.kcal*item.portion/100)+" kcal")+'</span></button>';
 };
 let html="";
 const localItems=suggestions.filter(x=>x.source==="estimate"||x.source==="dish"||x.source==="recipe"),remoteItems=suggestions.filter(x=>x.source==="off");
 if(localItems.length)html+='<div class="food-suggestions-heading">Jedlá a nápoje (orientačné údaje)</div>'+localItems.map(x=>row(x,suggestions.indexOf(x))).join("");
 if(remoteItems.length)html+='<div class="food-suggestions-heading">Konkrétne výrobky z databázy</div>'+remoteItems.map(x=>row(x,suggestions.indexOf(x))).join("");
 if(loading)html+='<div class="food-search-empty">Hľadám ďalšie produkty…</div>';
 else if(error)html+='<div class="food-search-empty">'+escapeHTML(error)+'</div>';
 else if(!suggestions.length)html+='<div class="food-search-empty">Nič som nenašiel. Môžeš jedlo zadať ručne.</div>';
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
 setProductImage(item.image,item.name);
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
  item.source==="recipe"?"Počet vajec a použitý tuk sa počítajú automaticky.":item.source==="dish"?"Odhad pre celé jedlo. Recept, olej, smotana a príloha môžu kalórie výrazne zmeniť. Zvoľ veľkosť porcie.":item.source==="estimate"?"Orientačné údaje. Výrobky sa môžu líšiť, najmä proteín. Skontroluj obal.":item.source==="recent"?"Načítané z tvojho predchádzajúceho zápisu.":"Výrobok z databázy. Skontroluj množstvo a obal.";
 $("foodSearchHelp").textContent=item.recipe==="eggs"?"Uprav počet vajec a tuk, potom ulož.":item.dish?"Odhad hotového jedla. Vyber veľkosť porcie a ulož.":"Jedlo vybrané. Teraz nastav množstvo a ulož.";
 $("quickFoods").hidden=true;
 renderFoodPreview();updateFoodSaveState();
}
async function remoteFoodSearch(query,token,local){
 const typed=normalizeTerm(query);
 const q=/^(capucino|kapucino|cappucino|kapuccino)$/.test(typed)?"cappuccino":typed;
 if(q.length<3||token!==searchGeneration)return;
 const cached=getCachedFoodSearch(q);
 if(cached!==null){
  if(token===searchGeneration)renderFoodSuggestions(local,cached,false);
  return;
 }
 const now=Date.now();
 searchNetworkHistory=searchNetworkHistory.filter(t=>now-t<60000);
 // OFF officially permits 10 searches / minute / IP; avoid making a request
 // on every keystroke. Use max 3/min on this device and stagger requests.
 const minDelay=Math.max(0,lastSearchAt+6500-now);
 const windowDelay=searchNetworkHistory.length>=3?Math.max(0,searchNetworkHistory[0]+61000-now):0;
 const outageDelay=Math.max(0,remoteSearchPauseUntil-now);
 const delay=Math.max(minDelay,windowDelay,outageDelay);
 if(delay>0){
  // Local results remain available immediately. Do not lock the form or show
  // an alarming "database down" status for a temporary API rate limit.
  if(delay<8500){
   searchTimer=setTimeout(()=>remoteFoodSearch(query,token,local),delay+120);
   return;
  }
  if(token===searchGeneration){
   const info=local.length?"":"Online vyhľadávanie je dočasne obmedzené. Skús to neskôr alebo naskenuj čiarový kód.";
   renderFoodSuggestions(local,[],false,info);
  }
  return;
 }
 searchNetworkHistory.push(now);
 lastSearchAt=now;
 searchAbort=new AbortController();
 const ctrl=searchAbort;
 const timer=setTimeout(()=>ctrl.abort(),11000);
 try{
  const url=new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms",q);
  url.searchParams.set("search_simple","1");
  url.searchParams.set("action","process");
  url.searchParams.set("json","1");
  url.searchParams.set("page_size","8");
  url.searchParams.set("fields","code,product_name,product_name_sk,product_name_en,brands,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,nutriments,image_front_small_url,image_small_url,image_front_url,image_url,selected_images,lang,lc");
  const response=await fetch(url.toString(),{signal:ctrl.signal,headers:{Accept:"application/json"},cache:"no-store"});
  if(!response.ok){
   const error=new Error("Open Food Facts vrátilo "+response.status);
   error.httpStatus=response.status;
   throw error;
  }
  const data=await response.json();
  const products=Array.isArray(data.products)?data.products:[];
  const mapped=products.filter(p=>p&&p.nutriments&&(p.product_name||p.product_name_sk||p.product_name_en))
   .map(nutritionFromOFF)
   .filter(p=>p.name&&p.kcal!==null&&validNum(p.kcal,0,2000)&&p.portion>0)
   .slice(0,6);
  rememberFoodSearch(q,mapped);
  if(token===searchGeneration&&!$("foodOverlay").hidden&&normalizeTerm($("foodName").value)===typed)
   renderFoodSuggestions(local,mapped,false);
 }catch(e){
  if(token!==searchGeneration)return;
  // If the request timed out (not user-initiated), show a fallback instead of leaving the spinner forever.
  // The legacy endpoint occasionally returns 503, and an IP shared by
  // multiple family devices may hit the OFF rate limit.
  if([429,500,502,503,504].includes(e.httpStatus))remoteSearchPauseUntil=Date.now()+45000;
  console.warn("Open Food Facts vyhľadávanie:",e.message||e);
  const message=local.length?"":"Nenačítali sa značkové produkty. Bežné jedlá fungujú; môžeš aj naskenovať čiarový kód.";
  renderFoodSuggestions(local,[],false,message);
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
  setProductImage("","");
  $("foodLookupMessage").hidden=true;
  updateEggUI(null);
  renderFoodPreview();updateFoodSaveState();
 }
 $("quickFoods").hidden=value.length>0;
 clearTimeout(searchTimer);
 if(searchAbort){searchAbort.abort();searchAbort=null}
 const token=++searchGeneration;
 if(value.length<2){hideFoodSuggestions();$("foodSearchHelp").textContent="Začni písať a vyber jedlo z návrhov.";return}
 const local=findCommon(value);
 renderFoodSuggestions(local,[],normalizeTerm(value).length>=3);
 $("foodSearchHelp").textContent="Vyber jedlo zo zoznamu. Kalórie a porcia sa doplnia.";
 if(normalizeTerm(value).length<3)return;
 // Local suggestions are immediate; one online request only after typing stops.
 const wait=1650;
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
function validProfile(p){return p&&validNum(p.weight,35,300)&&validNum(p.target,35,300)&&validNum(p.height,120,230)&&validNum(p.age,18,95)&&["male","female"].includes(p.sex)&&[1.2,1.375,1.55,1.725].includes(Number(p.activity))&&[.25,.3,.4,.5,.65,.75].includes(Number(p.rate))&&(!p.mode||["lose","maintain"].includes(p.mode))}
function normalize(input){
 if(!input||!validProfile(input.profile)||!Array.isArray(input.foods)||!Array.isArray(input.weights)||!Array.isArray(input.workouts))throw Error("Neplatný súbor údajov.");
 const p=input.profile;const obj={profile:{weight:+p.weight,target:+p.target,height:+p.height,age:+p.age,sex:p.sex,activity:+p.activity,rate:+p.rate,mode:p.mode==="maintain"?"maintain":"lose",lossTarget:validNum(p.lossTarget,35,300)?+p.lossTarget:+p.target},foods:[],weights:[],workouts:[]};
 obj.foods=input.foods.slice(0,20000).filter(x=>x&&typeof x.name==="string"&&x.name.length<=100&&validDate(x.date)&&MEALS.some(m=>m[0]===x.meal)&&validNum(x.grams,1,10000)&&["kcal","protein","carbs","fat","sugar"].every(k=>validNum(x[k],0,200000))).map(x=>({id:String(x.id||uid()).slice(0,100),name:x.name,date:x.date,meal:x.meal,grams:+x.grams,kcal:+x.kcal,protein:+x.protein,carbs:+x.carbs,fat:+x.fat,sugar:+x.sugar,fiber:validNum(x.fiber,0,200000)?+x.fiber:null,code:String(x.code||"").slice(0,16),image:safeFoodImage(x.image),unit:x.unit==="ml"?"ml":"g",dish:Boolean(x.dish),eggCount:validNum(x.eggCount,1,8)?Number(x.eggCount):null,eggFat:Object.hasOwn(EGG_EXTRA_FATS,x.eggFat)?x.eggFat:"none"}));
 obj.weights=input.weights.slice(0,10000).filter(x=>x&&validDate(x.date)&&validNum(x.kg,35,300)).map(x=>({date:x.date,kg:+x.kg}));
 obj.workouts=input.workouts.slice(0,10000).filter(x=>x&&validDate(x.date)&&EXERCISES[x.type]&&validNum(x.minutes,1,480)).map(x=>({id:String(x.id||uid()).slice(0,100),type:x.type,date:x.date,minutes:+x.minutes}));
 return obj;
}
function sanitizeProfileName(value){
 return String(value||"").trim().replace(/\s+/g," ").slice(0,30);
}
function findActiveProfile(){return profileStore.profiles.find(p=>p.id===activeProfileId)||null}
function saveProfiles(){
 try{localStorage.setItem(PROFILE_STORE_KEY,JSON.stringify(profileStore));return true}
 catch(e){console.error("Lokálna databáza sa neuložila",e);notify("Údaje sa nepodarilo uložiť. Urob JSON zálohu.");return false}
}
function initializeProfiles(){
 let loaded=false;
 try{
  const raw=localStorage.getItem(PROFILE_STORE_KEY);
  if(raw){
   const parsed=JSON.parse(raw);
   if(!parsed||!Array.isArray(parsed.profiles))throw Error("Neplatná databáza profilov");
   profileStore={version:1,profiles:parsed.profiles.slice(0,25).filter(p=>p&&typeof p.id==="string"&&typeof p.name==="string").map(p=>({
    id:p.id.slice(0,100),name:sanitizeProfileName(p.name)||"Používateľ",createdAt:p.createdAt||today,
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
 const active=localStorage.getItem(PROFILE_ACTIVE_KEY);
 if(active&&profileStore.profiles.some(p=>p.id===active)){
  activeProfileId=active;
  state=structuredCloneSafe(findActiveProfile().data);
  lossTargetDraft=state.profile.lossTarget||state.profile.target;
 }
}
function renderProfileList(){
 const list=$("profileList");
 if(!profileStore.profiles.length){list.innerHTML='<div class="profile-empty">Ešte nemáš profil. Vytvor si ho podľa svojho mena.</div>'}
 else list.innerHTML=profileStore.profiles.map(p=>
  '<button type="button" class="profile-entry" data-profile-select="'+escapeHTML(p.id)+'"><span class="profile-initial">'+escapeHTML(p.name[0].toLocaleUpperCase("sk-SK"))+'</span><span><strong>'+escapeHTML(p.name)+'</strong><small>Otvoriť svoj denník</small></span>'+icon("forward")+'</button>'
 ).join("");
 $("closeProfile").hidden=!activeProfileId;
}
function openProfiles(){
 if(!$("scanOverlay").hidden)closeScan();
 if(!$("foodOverlay").hidden)closeFood();
 renderProfileList();
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
}
function switchProfile(id){
 const target=profileStore.profiles.find(p=>p.id===id);
 if(!target)return;
 activeProfileId=id;
 localStorage.setItem(PROFILE_ACTIVE_KEY,id);
 state=structuredCloneSafe(target.data);
 lossTargetDraft=state.profile.lossTarget||state.profile.target;
 selectedDay=today;
 closeProfiles();
 syncProfileBadge();render();setView("home");
}
function createProfile(e){
 e.preventDefault();
 const name=sanitizeProfileName($("newProfileName").value);
 const weight=Number($("newProfileWeight").value),height=Number($("newProfileHeight").value);
 const target=Number($("newProfileTarget").value),age=Number($("newProfileAge").value),sex=$("newProfileSex").value;
 if(name.length<2||profileStore.profiles.some(x=>x.name.toLocaleLowerCase("sk-SK")===name.toLocaleLowerCase("sk-SK"))){notify("Zadaj jedinečné meno s aspoň 2 znakmi.");return}
 const data=structuredCloneSafe(DEFAULT);
 data.profile={weight,height,target,age,sex,activity:1.2,rate:.3,mode:weight===target?"maintain":"lose",lossTarget:target};
 if(!validProfile(data.profile)||target>weight){notify("Skontroluj údaje. Cieľ nesmie byť väčší než aktuálna váha.");return}
 if(profileStore.profiles.length>=25){notify("Maximum je 25 miestnych profilov.");return}
 const id=String(uid());
 profileStore.profiles.push({id,name,createdAt:today,data});
 if(!saveProfiles()){profileStore.profiles.pop();return}
 switchProfile(id);
 notify("Profil "+name+" je pripravený.");
}
function renameProfile(){
 const profile=findActiveProfile();
 if(!profile)return;
 const value=prompt("Nové meno profilu",profile.name);
 if(value===null)return;
 const name=sanitizeProfileName(value);
 if(name.length<2||profileStore.profiles.some(x=>x.id!==profile.id&&x.name.toLocaleLowerCase("sk-SK")===name.toLocaleLowerCase("sk-SK"))){notify("Zadaj jedinečné meno s aspoň 2 znakmi.");return}
 profile.name=name;saveProfiles();syncProfileBadge();notify("Meno profilu zmenené.");
}
initializeProfiles();
function save(){const profile=findActiveProfile();if(!profile)return;profile.data=structuredCloneSafe(state);saveProfiles()}
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
 const p=state.profile,maintain=p.mode==="maintain";
 const bmr=10*p.weight+6.25*p.height-5*p.age+(p.sex==="male"?5:-161);
 const tdee=bmr*p.activity,floor=p.sex==="male"?1600:1400;
 const desired=maintain?tdee:tdee-p.rate*7700/7;
 const calories=maintain?Math.round(tdee/50)*50:Math.max(floor,Math.round(Math.max(floor,desired)/50)*50);
 // Pri sedavom dni nema zmysel vyzadovat rovnakych 1,6 g/kg ako pri silovom treningu.
 // Chudnutie: 1,3–1,6 g/kg cielovej vahy, udrziavanie: 1,2–1,6 g/kg aktualnej vahy.
 const activity=Number(p.activity);
 const proteinRate=maintain?
   (activity>=1.725?1.6:activity>=1.55?1.5:activity>=1.375?1.3:1.2):
   (activity>=1.55?1.6:activity>=1.375?1.4:1.3);
 const protein=Math.round((maintain?p.weight:p.target)*proteinRate);
 const fat=Math.round((maintain?p.weight:p.target)*.8);
 const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
 const deficit=maintain?0:Math.max(0,tdee-calories),rate=deficit*7/7700;
 const remaining=maintain?0:Math.max(0,lastWeight()-p.target);
 const weeks=maintain?null:remaining===0?0:rate>0?Math.ceil(remaining/rate):null;
 return {bmr,tdee,calories,protein,proteinRate,fat,carbs,deficit,rate,remaining,weeks,maintain,fiber:25,
  sugarsReference:90,freeSugarMax:Math.floor(calories*.10/4),freeSugarIdeal:Math.floor(calories*.05/4),
 targetDate:weeks===null?null:addDays(today,weeks*7),floor,capped:!maintain&&desired<floor};
}
function foodsFor(day){return state.foods.filter(f=>f.date===day)}
function daily(day){let o={kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0};foodsFor(day).forEach(f=>Object.keys(o).forEach(k=>o[k]+=Number(f[k])||0));return o}
function streak(){const dates=new Set([...state.foods.map(x=>x.date),...state.weights.map(x=>x.date),...state.workouts.map(x=>x.date)]);let count=0;for(let i=0;i<400;i++){let day=addDays(today,-i);if(dates.has(day))count++;else if(i>0)break}return count}
function capProgress(value,max){return Math.max(0,Math.min(100,100*value/Math.max(max,1)))}
function setView(view){if(!$("view-"+view))return;activeView=view;$all(".view").forEach(el=>el.classList.toggle("active",el.id==="view-"+view));$all("[data-nav]").forEach(el=>el.classList.toggle("active",el.dataset.nav===view));window.scrollTo({top:0,behavior:"instant"});$("main").focus({preventScroll:true})}
function mealMarkup(f,mini=false){
 const edit=mini?"":'<button class="small-button" data-edit-food="'+escapeHTML(f.id)+'" aria-label="Upraviť">'+icon("edit")+'</button>';
 const del=mini?"":'<button class="small-button" data-remove-food="'+escapeHTML(f.id)+'" aria-label="Zmazať">'+icon("trash")+'</button>';
 return '<div class="meal-item"><span class="meal-icon '+(safeFoodImage(f.image)?'meal-photo':'')+'">'+(foodImageMarkup(f.image,"meal-image")||icon("list"))+'</span><div class="meal-details"><strong>'+escapeHTML(f.name)+'</strong><small>'+dec(f.grams)+' '+(f.unit||'g')+' · B '+dec(f.protein)+' g · S '+dec(f.carbs)+' g</small></div><div class="meal-kcal">'+fmt(f.kcal)+' kcal</div>'+edit+del+'</div>';
}
function renderHome(){
 const c=plan(),s=daily(today),sCount=streak(),start=state.profile.weight,target=state.profile.target;
 $("headerDate").textContent=formatDate(today);
 $("heroWeights").innerHTML=c.maintain?'Udržať <span>'+dec(start)+'</span> <small>kg</small>':dec(start)+' <span>→</span> '+dec(target)+' <small>kg</small>';
 $("heroStreak").innerHTML=icon("bolt")+" "+(sCount?sCount+" dní v rytme":"Začíname");
 $("heroRemaining").textContent=c.maintain?"± 1 kg":dec(c.remaining)+" kg";
 $("heroRemainingLabel").textContent=c.maintain?"približné rozpätie":"zostáva do cieľa";
 $("heroWeeks").textContent=c.maintain?fmt(c.calories):c.weeks===null?"–":c.weeks;
 $("heroWeeklyLabel").textContent=c.maintain?"kcal denne":"týždňov (odhad)";
 let p=c.maintain?100:start<=target?100:capProgress(start-lastWeight(),start-target);
 $("heroTrack").style.width=p+"%";
 $("heroCaption").textContent=c.maintain?"Cieľ je stabilná váha. Sleduj trend, nie jednotlivý deň.":c.remaining===0?"Cieľ dosiahnutý. Prejdi na udržiavanie.":p>0?"Už si prešiel "+fmt(p)+" % cesty.":"Prvý krok je začať.";
 $("homeCalories").textContent=fmt(s.kcal);$("homeCaloriesGoal").textContent=fmt(c.calories);
 $("homeRemaining").textContent=fmt(c.calories-s.kcal);
 $("energyRing").style.setProperty("--fill",Math.min(360,s.kcal/c.calories*360)+"deg");
 $("calorieFill").style.width=capProgress(s.kcal,c.calories)+"%";
 $("calorieNote").textContent=s.kcal>c.calories?"Cieľ je prekročený. Zajtra pokračuj normálne, bez kompenzovania.":s.kcal?"Sleduj príjem a jedz pravidelne.":"Pridaj svoje prvé jedlo. Začínaš jednoducho.";
 const macro=[["protein","Bielkoviny",s.protein,c.protein],["carbs","Sacharidy",s.carbs,c.carbs],["fat","Tuky",s.fat,c.fat]];
 $("homeMacros").innerHTML=macro.map(x=>'<div class="macro-card '+x[0]+'"><span>'+x[1]+'</span><strong>'+fmt(x[2])+' <small>g</small></strong><small>z '+fmt(x[3])+' g</small><div class="macro-line"><div style="width:'+capProgress(x[2],x[3])+'%"></div></div></div>').join("");
 const hasUnknown=foodsFor(today).some(f=>f.fiber===null);
 $("homeExtras").innerHTML='<div class="nutrient-card sugar"><div class="nutrient-symbol">◈</div><div class="nutrient-body"><span>Cukry celkom</span><strong>'+dec(s.sugar)+' <small>/ '+c.sugarsReference+' g</small></strong><div class="nutrient-progress"><i style="width:'+capProgress(s.sugar,c.sugarsReference)+'%"></i></div><small>EU referenčný príjem, nie pevný limit</small></div></div>'+
 '<div class="nutrient-card fiber"><div class="nutrient-symbol">≋</div><div class="nutrient-body"><span>Vláknina</span><strong>'+dec(s.fiber)+' <small>/ '+c.fiber+' g</small></strong><div class="nutrient-progress"><i style="width:'+capProgress(s.fiber,c.fiber)+'%"></i></div><small>'+(hasUnknown?"minimum zo známych hodnôt":"orientačný denný cieľ")+'</small></div></div>';
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
   const foods=foodsFor(selectedDay).filter(f=>f.meal===key),sum=foods.reduce((n,f)=>n+f.kcal,0);
   return '<section class="diary-group"><div class="diary-head"><div><h2>'+name+'</h2><small>'+fmt(sum)+' kcal</small></div><button data-add-meal="'+key+'">+ Pridať</button></div><div class="card">'+(foods.length?foods.map(f=>mealMarkup(f)).join(""):'<div class="empty-state">Zatiaľ žiadne jedlo.</div>')+'</div></section>';
 }).join("");
}
function macroRow(key,name,g,show){return '<div class="macro-row '+key+'"><div class="row"><strong>'+name+'</strong><small>'+fmt(g)+' g / deň</small></div><div class="macro-line"><div style="width:'+show+'%"></div></div></div>'}
function exerciseBurn(type,minutes){return Math.round(EXERCISES[type].met*3.5*lastWeight()/200*minutes)}
function monday(date){let d=new Date(date+"T12:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));return dateLocal(d)}
function updatePlanModeUI(){
 const maintain=$("modeMaintain").checked;
 $("pTargetWrap").classList.toggle("hide",maintain);
 $("pRateWrap").classList.toggle("hide",maintain);
 $("pTarget").disabled=maintain;$("pRate").disabled=maintain;
 $("pTarget").value=maintain?$("pWeight").value:lossTargetDraft;
}
function renderPlan(){
 const c=plan(),p=state.profile;
 [["pWeight",p.weight],["pHeight",p.height],["pAge",p.age],["pSex",p.sex],["pActivity",p.activity],["pRate",p.rate]].forEach(x=>$(x[0]).value=x[1]);
 lossTargetDraft=p.lossTarget||p.target;$("pTarget").value=lossTargetDraft;
 $("modeMaintain").checked=c.maintain;$("modeLose").checked=!c.maintain;updatePlanModeUI();
 $("planCalories").textContent=fmt(c.calories);$("planTdee").textContent=fmt(c.tdee);
 $("planDeficit").textContent=c.maintain?"0":"−"+fmt(c.deficit);
 $("planWeeks").textContent=c.maintain?"Stabilne":c.weeks===null?"–":c.weeks+" t.";
 $("planDate").textContent=c.maintain?"bez termínu":c.targetDate?"cca "+formatDate(c.targetDate):"Odlišné tempo";
 $("planSubtitle").textContent=c.maintain?"Približne toľko energie potrebuješ na udržiavanie váhy.":c.capped?"Tempo bolo zmiernené, aby príjem nebol extrémne nízky.":"Odhad pri zvolenej aktivite a tempe.";
 $("planMacroCard").innerHTML=macroRow("protein","Bielkoviny",c.protein,Math.round(c.protein*4/c.calories*100))+macroRow("carbs","Sacharidy",c.carbs,Math.round(c.carbs*4/c.calories*100))+macroRow("fat","Tuky",c.fat,Math.round(c.fat*9/c.calories*100))+'<p class="card-sub">Bielkoviny: '+dec(c.proteinRate)+' g/kg '+(c.maintain?"aktuálnej":"cieľovej")+' váhy podľa aktivity. Tuky cca 0,8 g/kg; zvyšok sacharidy. Ide o orientačný cieľ, nie povinné minimum.</p>';
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
 $("foodSearchHelp").textContent="Napíš napríklad tikka masala, pizza alebo proteín.";
 $("quickFoods").hidden=false;renderQuickFoods();selectedFoodName="";
 $("foodForm").reset();$("foodEditId").value="";
 setProductImage("","");
 $("foodTitle").textContent=options.product?"Načítavam produkt…":"Pridať jedlo";
 $("foodStep").textContent="JEDNODUCHÝ ZÁPIS JEDLA";
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
 const maintain=$("modeMaintain").checked,weight=Number($("pWeight").value),target=maintain?weight:Number($("pTarget").value);
 const p={weight,target,height:+$("pHeight").value,age:+$("pAge").value,sex:$("pSex").value,
  activity:+$("pActivity").value,rate:maintain?state.profile.rate:+$("pRate").value,
  mode:maintain?"maintain":"lose",lossTarget:maintain?lossTargetDraft:target};
 if(!validProfile(p)||(!maintain&&p.target>p.weight)){notify("Skontroluj údaje. Cieľ pri chudnutí nemôže byť vyšší než aktuálna váha.");return}
 state.profile=p;save();render();notify(maintain?"Zapol si udržiavanie váhy.":"Plán chudnutia je prepočítaný.");
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
 const wr=e.target.closest("[data-remove-weight]");if(wr){if(confirm("Vymazať toto váženie?")){state.weights=state.weights.filter(x=>x.date!==wr.dataset.removeWeight);save();render()}return}
 const ex=e.target.closest("[data-remove-workout]");if(ex){if(confirm("Vymazať túto aktivitu?")){state.workouts=state.workouts.filter(x=>x.id!==ex.dataset.removeWorkout);save();render()}return}
}
document.addEventListener("click",delegatedClick);
$("profileHeaderBtn").addEventListener("click",openProfiles);
$("changeProfileBtn").addEventListener("click",openProfiles);
$("renameProfileBtn").addEventListener("click",renameProfile);
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
$("recentFoods").addEventListener("click",e=>{const b=e.target.closest("[data-recent-index]");if(b)applyFoodSuggestion(recentQuickFoods[Number(b.dataset.recentIndex)])});
$("eggMinus").addEventListener("click",()=>{activeEggCount=Math.max(1,activeEggCount-1);recalculateEgg()});
$("eggPlus").addEventListener("click",()=>{activeEggCount=Math.min(8,activeEggCount+1);recalculateEgg()});
$("eggFatSelect").addEventListener("change",()=>{activeEggFat=$("eggFatSelect").value;recalculateEgg()});
$("foodSuggestions").addEventListener("pointerdown",e=>{const b=e.target.closest("[data-suggest]");if(b)e.preventDefault()});
$("foodSuggestions").addEventListener("click",e=>{const b=e.target.closest("[data-suggest]");if(b)applyFoodSuggestion(suggestions[Number(b.dataset.suggest)])});
$("foodForm").addEventListener("invalid",e=>{if($("foodDetails").contains(e.target))$("foodDetails").open=true},true);
$("amountMinus").addEventListener("click",()=>{$("foodGrams").value=Math.max(1,(Number($("foodGrams").value)||100)-25);renderFoodPreview()});
$("amountPlus").addEventListener("click",()=>{$("foodGrams").value=Math.min(10000,(Number($("foodGrams").value)||0)+25);renderFoodPreview()});
$all("[data-grams]").forEach(el=>el.addEventListener("click",()=>{$("foodGrams").value=el.dataset.grams;renderFoodPreview()}));
$("modeMaintain").addEventListener("change",updatePlanModeUI);
$("modeLose").addEventListener("change",updatePlanModeUI);
$("pWeight").addEventListener("input",()=>{if($("modeMaintain").checked)$("pTarget").value=$("pWeight").value});
$("pTarget").addEventListener("input",()=>{if($("modeLose").checked)lossTargetDraft=Number($("pTarget").value)||lossTargetDraft});
$("planForm").addEventListener("submit",submitPlan);
$("weightForm").addEventListener("submit",submitWeight);
$("workoutForm").addEventListener("submit",submitWorkout);
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
render();syncProfileBadge();setView("home");if(!activeProfileId)openProfiles();
})();
