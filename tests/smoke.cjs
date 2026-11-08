const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const bwipjs=require("bwip-js");
const fs=require("node:fs");
(async()=>{
 const png=await bwipjs.toBuffer({bcid:"ean13",text:"301762401070",scale:4,height:27,includetext:false,paddingwidth:35,paddingheight:30,backgroundcolor:"FFFFFF"});
 const zxing=require("zxing-wasm/reader");
 const wasmBytes=fs.readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
 await zxing.prepareZXingModule({overrides:{wasmBinary:new Uint8Array(wasmBytes)},fireImmediately:true});
 const nodeResults=await zxing.readBarcodes(new Uint8Array(png),{formats:["AllReadable"],tryHarder:true});
 console.log("NODE BARCODE READ:",JSON.stringify(nodeResults.map(x=>({text:x.text,format:x.format}))));
 const browser=await chromium.launch({headless:true,args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
 const photoUrl="https://images.openfoodfacts.org/images/products/test-package.jpg";
 const mockProduct=JSON.stringify({status:"success",product:{product_name:"Testovací jogurt",image_front_small_url:photoUrl,nutriments:{"energy-kcal_100g":180,"proteins_100g":8,"carbohydrates_100g":12,"fat_100g":9,"sugars_100g":7,"fiber_100g":1}}});
 const mockKinder=JSON.stringify({count:1,products:[{code:"4008400320328",product_name:"Kinder Bueno",brands:"Kinder",image_front_small_url:photoUrl,nutriments:{"energy-kcal_100g":572,"proteins_100g":8.6,"carbohydrates_100g":49.5,"fat_100g":37.3,"sugars_100g":41.2,"fiber_100g":3.4}}]});
 const mockSearch=JSON.stringify({count:1,products:[{code:"9876543210123",product_name:"Proteínové kakao",brands:"Testová značka",serving_size:"250 ml",serving_quantity:"250",serving_quantity_unit:"ml",image_front_small_url:photoUrl,nutriments:{"energy-kcal_100g":62,"proteins_100g":6,"carbohydrates_100g":7,"fat_100g":1.4,"sugars_100g":6.2,"fiber_100g":0.6}}]});
 async function setup(page){
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")console.error("BROWSER:",m.text())});
  await page.route("https://world.openfoodfacts.org/**",r=>{
   const url=r.request().url(),broken=url.includes("serverfail");
   return r.fulfill({status:broken?503:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},body:broken?'{"error":"temporarily unavailable"}':url.includes("/api/v2/search")&&url.includes("brands_tags=kinder")?mockKinder:url.includes("/cgi/search.pl")?mockSearch:mockProduct});
  });
  await page.route("https://images.openfoodfacts.org/**",r=>r.fulfill({status:200,contentType:"image/png",body:png}));
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort());
  return errors;
 }
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:["camera"]});
  // Disallow the camera in photo test so we can validate ZXing WASM from an actual image.
  const page=await context.newPage();
  const errors=await setup(page);
  await page.addInitScript(()=>{
    Object.defineProperty(window,"BarcodeDetector",{value:undefined,configurable:true});
    if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>Promise.reject(Object.assign(new Error("Blocked for image test"),{name:"NotAllowedError"}));
  });
  await page.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await page.locator("#homeCalories").waitFor({state:"visible"});
  await page.locator("#profileOverlay").waitFor({state:"visible"});
  assert(await page.locator("#newProfileForm").isVisible(),"First visit must offer creating a profile");
  await page.locator("#newProfileName").fill("Daniel");
  await page.locator("#newProfileWeight").fill("94");
  await page.locator("#newProfileTarget").fill("88");
  await page.locator("#newProfileHeight").fill("189");
  await page.locator("#newProfileAge").fill("22");
  await page.locator("#newProfileSex").selectOption("male");
  await page.locator("#newProfileForm button[type=submit]").click();
  await page.locator("#profileOverlay").waitFor({state:"hidden"});
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"0");
  assert.equal((await page.locator("#profileHeaderBtn").innerText()).trim(),"D");
  assert.equal(await page.locator("#homeMacros .nutrient-ring").count(),3,"Three macros need circular progress");
  assert.equal(await page.locator("#homeExtras .nutrient-ring").count(),2,"Sugar and fiber need circular progress");
  assert.equal(await page.locator("#homeMacros .nutrient-ring.protein .nutrient-ring-center strong").innerText(),"114");
  assert.equal(await page.locator("#homeExtras .nutrient-ring.fiber .nutrient-ring-center strong").innerText(),"25");
  assert(!(await page.locator("#view-home").innerText()).includes("Celkové cukry zahŕňajú aj prirodzené cukry"),"Remove verbose sugar footnote");
  const activityGoal=Number((await page.locator("#heroActivityTarget").innerText()).replace(/[^0-9]/g,""));
  assert(activityGoal>=75&&activityGoal<=400,"Estimated activity kcal should be proportional to user weight");
  assert.equal(await page.locator("#heroActivityProgress").innerText(),"0 / "+activityGoal+" kcal dnes");
  assert((await page.locator("#heroActivityNote").innerText()).includes("nepripočítava"),"Activity calories must not increase food allowance");

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert(overflow<=2,"Mobile layout overflow "+overflow);
  await page.locator("#homeAdd").click();
  const hour=await page.evaluate(()=>new Date().getHours());
  const expected=hour>=5&&hour<10?"ranajky":hour>=10&&hour<12?"desiata":hour>=12&&hour<15?"obed":hour>=15&&hour<18?"olovrant":hour>=18&&hour<23?"vecera":"ine";
  assert.equal(await page.locator("#foodMeal").inputValue(),expected);
  assert(!(await page.locator("#foodDetails").evaluate(el=>el.open)),"Advanced nutrition should be collapsed by default");
  assert(await page.locator("#quickFoods").isVisible(),"Quick food buttons must be visible");
  const inputFont=await page.locator("#foodName").evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  const selectFont=await page.locator("#foodMeal").evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert(inputFont>=16&&selectFont>=16,"Avoid iPhone focus zoom on inputs");
  await page.locator('[data-quick-food="whey"]').click();
  assert.equal(await page.locator("#foodName").inputValue(),"Proteínový prášok (whey), s vodou");
  assert.equal(await page.locator("#foodGrams").inputValue(),"30");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("119"));
  await page.locator("#closeFood").click();
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("proteín");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible"});
  assert((await page.locator("#foodSuggestions").innerText()).includes("Proteínový prášok"));
  await page.locator("#closeFood").click();
  await page.locator("#homeAdd").click();
  await page.locator("#foodDetails summary").click();
  assert(await page.locator("#foodDetails").evaluate(el=>el.open));
  await page.locator("#foodName").fill("Jogurt vlastný");
  await page.locator("#foodGrams").fill("150");
  await page.locator("#fKcal").fill("200");
  await page.locator("#fProtein").fill("10");
  await page.locator("#fCarbs").fill("20");
  await page.locator("#fFat").fill("5");
  await page.locator("#fSugar").fill("4");
  await page.locator("#foodSave").click();
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"300");
  await page.locator("#homeAdd").click();
  assert((await page.locator("#recentFoods").innerText()).includes("Jogurt vlastný"),"Recently added foods should be one tap");
  await page.locator("#recentFoods button").first().click();
  assert.equal(await page.locator("#foodGrams").inputValue(),"150");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("300"));
  await page.locator("#closeFood").click();
  assert((await page.locator("#homeExtras").innerText()).includes("Cukry celkom"));
  assert((await page.locator("#homeExtras").innerText()).includes("Vláknina"));
  assert((await page.locator("#homeExtras").innerText()).includes("90 g"),"Total sugars must show 90 g adult EU reference");
  assert((await page.locator("#homeExtras").innerText()).includes("nie limit"),"Total sugar reference must not be treated as a fixed limit");
  assert((await page.locator(".nutrient-ring.sugar").getAttribute("style")).includes("--ring-fill:"),"Circular sugar progress needs filled arc");

  await page.locator('[data-nav="diary"]').first().click();
  assert((await page.locator("#diarySections").innerText()).includes("Jogurt vlastný"));
  assert.equal(await page.locator("#diarySections [data-meal-section]").count(),6,"All daily meal categories should display");
  assert.equal(await page.locator("#diarySections [data-meal-section] .meal-totals").count(),6,"Each category has its own nutrition totals");
  const filled=page.locator('#diarySections [data-meal-section="ine"]');
  // Depending on the time of entry the meal type varies, so locate the group by its food.
  const mealGroup=page.locator("#diarySections [data-meal-section]").filter({hasText:"Jogurt vlastný"});
  assert.equal(await mealGroup.locator(".meal-total.calories strong").innerText(),"300 kcal");
  assert.equal(await mealGroup.locator(".meal-total.protein strong").innerText(),"15 g");
  assert.equal(await mealGroup.locator(".meal-total.carbs strong").innerText(),"30 g");
  assert.equal(await mealGroup.locator(".meal-total.fat strong").innerText(),"7,5 g");
  const zeroGroup=page.locator("#diarySections [data-meal-section]").filter({has:page.locator(".meal-empty")}).first();
  assert.equal(await zeroGroup.locator(".meal-total.calories strong").innerText(),"0 kcal");
  assert.equal(await zeroGroup.locator(".meal-empty").count(),1);
  assert(await zeroGroup.locator(".meal-empty").evaluate(e=>e.getBoundingClientRect().height<65),"Empty diary section should not waste vertical space");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,"Diary macro tiles must not overflow 390px screen");

  await page.locator('[data-nav="plan"]').first().click();
  await page.locator("#planForm button[type=submit]").click();
  const lossKcal=Number((await page.locator("#planCalories").innerText()).replace(/[^0-9]/g,""));
  assert(lossKcal>1300);
  assert((await page.locator("#planMacroCard").innerText()).includes("114 g / deň"),"94 kg sedentary, goal 88 kg -> 114 g protein");
  assert((await page.locator("#planMacroCard").innerText()).includes("1,3 g/kg"),"Sedentary protein based on goal weight");
  const sugarAdvice=await page.locator("#sugarAdvice").innerText();
  assert(sugarAdvice.includes("90 g/deň")&&sugarAdvice.includes("Voľné cukry"),"WHO free vs EU total sugar guidance");
  assert(sugarAdvice.includes("52 g/deň"),"WHO 10 % of 2100 kcal -> 52 g");
  await page.locator("#pActivity").selectOption("1.55");
  await page.locator("#planForm button[type=submit]").click();
  assert((await page.locator("#planMacroCard").innerText()).includes("141 g / deň"),"More exercise -> stronger protein target");
  await page.locator("#pActivity").selectOption("1.2");
  await page.locator("#planForm button[type=submit]").click();
  assert((await page.locator("#planMacroCard").innerText()).includes("114 g / deň"));
  await page.locator("#modeMaintain").check();
  assert(await page.locator("#pTargetWrap").evaluate(el=>getComputedStyle(el).display==="none"));
  await page.locator("#planForm button[type=submit]").click();
  assert((await page.locator("#planSubtitle").innerText()).includes("udržiavanie"));
  assert((await page.locator("#planMacroCard").innerText()).includes("113 g / deň"),"Sedentary maintenance: 94 kg × 1.2");
  const maintenanceKcal=Number((await page.locator("#planCalories").innerText()).replace(/[^0-9]/g,""));
  assert(maintenanceKcal>lossKcal,"Maintenance should have more calories");
  await page.locator("#modeLose").check();
  assert(await page.locator("#pTargetWrap").isVisible());
  assert.equal(await page.locator("#pTarget").inputValue(),"88");
  await page.locator("#planForm button[type=submit]").click();
  await page.locator('[data-nav="progress"]').first().click();
  await page.locator("#weightNumber").fill("93.2");
  await page.locator("#weightForm button[type=submit]").click();
  assert((await page.locator("#weightNow").innerText()).includes("93"));
  await page.reload({waitUntil:"domcontentloaded"});
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"300");
  await page.locator('[data-action="scan"]').click();
  await page.locator("#scanOverlay").waitFor({state:"visible"});
  await page.locator("#barcodePhoto").setInputFiles({name:"real-ean13.png",mimeType:"image/png",buffer:png});
  try{await page.locator("#foodOverlay").waitFor({state:"visible",timeout:30000})}
  catch(e){
    const debug=await page.evaluate(async raw=>{
      const buffer=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
      const reader=window.ZXingWASM;
      if(!reader)return {error:"window.ZXingWASM absent"};
      try{
        const blob=new Blob([buffer],{type:"image/png"});
        const all=await reader.readBarcodes(blob,{formats:["AllReadable"],tryHarder:true});
        return {version:reader.ZXING_WASM_VERSION,all:all.map(x=>({text:x.text,format:x.format}))};
      }catch(err){return {error:String(err)}}
    },png.toString("base64"));
    throw Error("Real photo barcode scan failed: "+await page.locator("#scanStatus").innerText()+" DEBUG="+JSON.stringify(debug))
  }
  await page.waitForFunction(()=>document.querySelector("#foodName")?.value==="Testovací jogurt",{timeout:15000});
  assert.equal(await page.locator("#foodName").inputValue(),"Testovací jogurt");
  assert.equal(await page.locator("#fKcal").inputValue(),"180");
  assert.equal(await page.locator("#foodEAN").inputValue(),"3017624010701");
  assert(await page.locator("#selectedProductVisual").isVisible(),"A scanned product should have image");
  assert((await page.locator("#selectedProductPicture img").getAttribute("src")).includes("images.openfoodfacts.org"));
  assert(await page.locator("#selectedProductPicture img").evaluate(img=>img.complete&&img.naturalWidth>0),"Image should load in browser");
  assert.equal(await page.locator("#foodMeal").inputValue(),expected);
  assert(!await page.locator("#foodDetails").evaluate(el=>el.open),"Scanned food should hide advanced fields");
  await page.locator('[data-grams="150"]').click();
  assert.equal(await page.locator("#foodGrams").inputValue(),"150");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("270"));
  const figures=await page.evaluate(()=>{
    const g=Number(document.querySelector("#foodGrams").value);
    const v=id=>Number(document.querySelector("#"+id).value)*g/100;
    return {kcal:v("fKcal"),protein:v("fProtein"),carbs:v("fCarbs"),fat:v("fFat"),sugar:v("fSugar"),fiber:v("fFiber")};
  });
  assert.deepEqual(figures,{kcal:270,protein:12,carbs:18,fat:13.5,sugar:10.5,fiber:1.5},"Every nutrient must scale linearly from 100 g to 150 g");
  await page.locator("#foodSave").click();
  const savedNumbers=await page.evaluate(()=>{
    const id=localStorage.getItem("forma-active-profile-v1");
    const profile=JSON.parse(localStorage.getItem("forma-local-profiles-v1")).profiles.find(p=>p.id===id);
    return profile.data.foods.find(f=>f.code==="3017624010701");
  });
  for(const [key,value] of Object.entries(figures))assert.equal(savedNumbers[key],value,"Saved nutrient mismatch: "+key);
  assert(savedNumbers.image?.startsWith("https://images.openfoodfacts.org/"),"Food photo must persist");
  assert((await page.locator("#homeMealList .meal-image").count())>=1,"Diary summary should show product photo");
  assert(await page.locator("#foodOverlay").isHidden());
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"570");
  // Common drink: typo-tolerant autocomplete + realistic editable portion in ml.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("capucino");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible"});
  assert((await page.locator("#foodSuggestions").innerText()).includes("Cappuccino"));
  await page.locator("#foodSuggestions [data-suggest]").first().click();
  assert.equal(await page.locator("#foodUnit").inputValue(),"ml");
  assert.equal(await page.locator("#foodGrams").inputValue(),"180");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("76"));
  assert(!await page.locator("#foodDetails").evaluate(el=>el.open),"Generic suggestion has complete estimates");
  await page.locator("#foodSave").click();
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"646");
  // A second family member must have isolated food and weight data.
  await page.locator("#profileHeaderBtn").click();
  await page.locator("#profileOverlay").waitFor({state:"visible"});
  await page.locator("#toggleNewProfile").click();
  await page.locator("#newProfileName").fill("Mama");
  await page.locator("#newProfileWeight").fill("76");
  await page.locator("#newProfileTarget").fill("76");
  await page.locator("#newProfileHeight").fill("165");
  await page.locator("#newProfileAge").fill("55");
  await page.locator("#newProfileSex").selectOption("female");
  await page.locator("#newProfileForm button[type=submit]").click();
  await page.locator("#profileOverlay").waitFor({state:"hidden"});
  assert.equal(await page.locator("#homeCalories").innerText(),"0");
  assert.equal(await page.locator("#profileHeaderBtn").innerText(),"M");
  assert((await page.locator("#heroWeights").innerText()).includes("Udržať"));
  await page.locator("#profileHeaderBtn").click();
  await page.locator('#profileList [data-profile-select]').filter({hasText:"Daniel"}).click();
  assert.equal(await page.locator("#homeCalories").innerText(),"646");
  assert.equal(await page.locator("#profileHeaderBtn").innerText(),"D");
  // Remote product search: live text entry, real serving_quantity_unit and label.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("kakao");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible",timeout:15000});
  assert((await page.locator("#foodSuggestions .food-suggestion-image").count())>=1,"Autocomplete must show images");
  await page.locator("#foodSuggestions [data-suggest]").first().click();
  assert.equal(await page.locator("#foodName").inputValue(),"Proteínové kakao");
  assert.equal(await page.locator("#foodUnit").inputValue(),"ml");
  assert.equal(await page.locator("#foodGrams").inputValue(),"250");
  assert.equal(await page.locator("#fKcal").inputValue(),"62");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("155"));

  assert(await page.locator("#selectedProductVisual").isVisible(),"Selected online product should show front-of-pack photo");
  assert((await page.locator("#portionHint").innerText()).includes("1 ml ≈ 1 g"),"ml must be identified as an approximation");
  await page.locator("#closeFood").click();
  // Complete restaurant meals: "tikka masala" and versions with/without rice.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("tikka masala");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible"});
  const dishes=await page.locator("#foodSuggestions").innerText();
  assert(dishes.includes("Chicken tikka masala s ryžou"));
  assert(dishes.includes("Chicken tikka masala bez ryže"));
  await page.locator("#closeFood").click();
  await page.locator("#homeAdd").click();
  await page.locator('[data-quick-food="tikka_rice"]').click();
  assert.equal(await page.locator("#foodName").inputValue(),"Chicken tikka masala s ryžou");
  assert(await page.locator("#dishPortions").isVisible());
  assert(await page.locator("#basicPortions").isHidden());
  assert.equal(await page.locator("#foodGrams").inputValue(),"450");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("675"));
  await page.locator('[data-dish-factor="0.7"]').click();
  assert.equal(await page.locator("#foodGrams").inputValue(),"325");
  await page.locator('[data-dish-factor="1.35"]').click();
  assert.equal(await page.locator("#foodGrams").inputValue(),"600");
  await page.locator('[data-dish-factor="1"]').click();
  assert.equal(await page.locator("#foodGrams").inputValue(),"450");
  await page.locator("#foodSave").click();
  assert.equal(Number((await page.locator("#homeCalories").innerText()).replace(/[^0-9]/g,"")),1321);
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("tikka bez ryze");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible"});
  await page.locator("#foodSuggestions [data-suggest]").first().click();
  assert.equal(await page.locator("#foodName").inputValue(),"Chicken tikka masala bez ryže");
  assert.equal(await page.locator("#foodGrams").inputValue(),"300");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("468"));
  await page.locator("#closeFood").click();
  await page.setViewportSize({width:320,height:568});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,"320px screen must not overflow");
  await page.locator("#homeAdd").click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=2,"320px food modal overflow");
  assert((await page.locator("#quickFoods [data-quick-food]").count())===9);
  await page.locator("#closeFood").click();
  // The remote provider may return 503. Local suggestions must still work.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("serverfail");
  await page.locator("#foodSearchRetry").waitFor({state:"visible",timeout:20000});
  assert(await page.locator("#foodSearchRetry").isVisible(),"Provide visible retry when API fails");
  await page.locator("#foodName").fill("proteín");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible",timeout:7000});
  assert((await page.locator("#foodSuggestions").innerText()).includes("Proteínový prášok"),"Local foods remain usable during API outage");
  await page.locator("#closeFood").click();
  // A refreshed tab should be able to search Kinder even after another request fails.
  await page.reload({waitUntil:"domcontentloaded"});
  // Branded product search must work from structured API even when full-text 503s.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("Kinder");
  assert(await page.locator("#foodSuggestions").isVisible(),"Instant visual feedback while brand is loading");
  assert((await page.locator("#foodSuggestions").innerText()).includes("Hľadám"),"User must not see a blank screen");
  await page.waitForFunction(()=>document.getElementById("foodSuggestions")?.innerText?.includes("Kinder Bueno"),{timeout:12000});
  assert((await page.locator("#foodSuggestions .food-suggestion-image").count())>=1,"Kinder should display package photo");
  await page.locator("#foodSuggestions [data-suggest]").first().click();
  assert.equal(await page.locator("#foodName").inputValue(),"Kinder Bueno");
  assert.equal(await page.locator("#fKcal").inputValue(),"572");
  assert(await page.locator("#selectedProductVisual").isVisible());
  await page.locator("#closeFood").click();
  // A known successful search should be cached in localStorage and survive reload.
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("kakao");
  await page.waitForFunction(()=>document.getElementById("foodSuggestions")?.innerText?.includes("Proteínové kakao"),{timeout:12000});
  const cacheEntries=await page.evaluate(()=>JSON.parse(localStorage.getItem("forma-off-search-cache-v2")||"[]"));
  assert(cacheEntries.some(([key,entry])=>key==="kakao"&&entry.products?.some(p=>p.name==="Proteínové kakao")),"Successful OFF search must be persisted locally");
  await page.locator("#closeFood").click();

  // Scrambled eggs: native recipe query with count in Slovak, optional frying fat.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("praženica z 3 vajíčok");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible",timeout:5000});
  assert((await page.locator("#foodSuggestions").innerText()).includes("Praženica z 3 vajec"));
  await page.locator("#foodSuggestions [data-suggest]").first().click();
  assert(await page.locator("#eggRecipe").isVisible());
  assert(await page.locator("#amountControls").isHidden());
  assert.equal(await page.locator("#eggCountText").innerText(),"3");
  assert.equal(await page.locator("#eggFatSelect").inputValue(),"none");
  assert.equal(await page.locator("#foodGrams").inputValue(),"150");
  assert.equal((await page.locator("#foodPreviewCalories").innerText()).trim(),"216 kcal");
  await page.locator("#eggFatSelect").selectOption("butter5");
  assert.equal((await page.locator("#foodPreviewCalories").innerText()).trim(),"252 kcal");
  await page.locator("#eggPlus").click();
  assert.equal(await page.locator("#eggCountText").innerText(),"4");
  assert.equal((await page.locator("#foodPreviewCalories").innerText()).trim(),"324 kcal");
  await page.locator("#eggMinus").click();
  assert.equal(await page.locator("#eggCountText").innerText(),"3");
  await page.locator("#eggFatSelect").selectOption("oil5");
  assert.equal((await page.locator("#foodPreviewCalories").innerText()).trim(),"261 kcal");
  await page.locator("#eggFatSelect").selectOption("butter5");
  await page.locator("#foodSave").click();
  assert.equal(Number((await page.locator("#homeCalories").innerText()).replace(/[^0-9]/g,"")),1573);
  await page.locator('[data-nav="diary"]').first().click();
  assert((await page.locator("#diarySections").innerText()).includes("Praženica z 3 vajec"));
  await page.locator("#diarySections .meal-item").filter({hasText:"Praženica z 3 vajec"}).locator("[data-edit-food]").click();
  assert(await page.locator("#eggRecipe").isVisible(),"Editing an egg recipe should preserve its controls");
  assert.equal(await page.locator("#eggFatSelect").inputValue(),"butter5");
  await page.locator("#closeFood").click();
  await page.locator('[data-nav="home"]').first().click();
  await page.locator("#homeAdd").click();
  await page.locator('[data-quick-food="scrambled_eggs"]').click();
  assert(await page.locator("#eggRecipe").isVisible(),"Quick pick scrambled eggs should open egg counter");
  await page.locator("#closeFood").click();

  assert.deepEqual(errors,[],"Browser errors (photo): "+errors.join(" | "));
  console.log("PASS: layout, calorie logging, diary, plan, weight, persistence, REAL EAN13 photo via WebAssembly");

  // Live streaming test: real encoded barcode image shown in canvas -> MediaStream
  // -> video -> frame pixel buffer -> WASM decoder. No mocked BarcodeDetector.
  const live=await context.newPage();
  const liveErrors=await setup(live);
  const url="data:image/png;base64,"+png.toString("base64");
  await live.addInitScript(({dataUrl})=>{
   Object.defineProperty(window,"BarcodeDetector",{value:undefined,configurable:true});
   const real=navigator.mediaDevices;
   if(!real)return;
   real.getUserMedia=async()=>{
    const canvas=document.createElement("canvas");canvas.width=1280;canvas.height=720;
    const ctx=canvas.getContext("2d");
    const image=new Image();image.src=dataUrl;await image.decode();
    function draw(){ctx.fillStyle="white";ctx.fillRect(0,0,1280,720);ctx.drawImage(image,160,200,960,270)}
    draw();const stream=canvas.captureStream(12);
    setInterval(draw,150);
    return stream;
   };
   real.enumerateDevices=async()=>[{deviceId:"test-camera",kind:"videoinput",label:"Back camera"}];
  },{dataUrl:url});
  await live.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await live.locator('[data-action="scan"]').click();
  try{await live.locator("#foodOverlay").waitFor({state:"visible",timeout:35000})}
  catch(e){throw Error("REAL live video decoding failed: "+await live.locator("#scanStatus").innerText())}
  await live.waitForFunction(()=>document.querySelector("#foodName")?.value==="Testovací jogurt",{timeout:15000});
  assert.equal(await live.locator("#foodEAN").inputValue(),"3017624010701");
  assert(!await live.locator("#foodDetails").evaluate(el=>el.open),"Live scanner should hide advanced fields");
  assert.deepEqual(liveErrors,[],"Live browser runtime errors: "+liveErrors.join(" | "));
  console.log("PASS: REAL streaming barcode scan using Canvas MediaStream + ZXing WASM");

  // Cloudflare Worker sync: no PAT in the browser, same GitHub JSON across phones.
  let cloudState={version:1,profiles:[]},cloudWrites=0,cloudReady=false;
  async function mockWorker(route){
   const req=route.request(),url=new URL(req.url()),method=req.method();
   const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
   const fulfill=(status,data)=>route.fulfill({status,contentType:"application/json",headers,body:JSON.stringify(data)});
   if(method==="OPTIONS")return fulfill(200,{ok:true});
   if(url.pathname==="/health")return fulfill(200,{ok:true,ready:cloudReady});
   if(!cloudReady)return fulfill(503,{error:"Not configured"});
   if(url.pathname==="/profiles"){
    if(method==="GET")return fulfill(200,{ok:true,...cloudState});
    if(method==="POST"){
     const submitted=req.postDataJSON();
     assert.equal(submitted.version,1);
     assert(!JSON.stringify(submitted).includes("github_pat_"),"Never put token into JSON");
     const profiles=new Map(cloudState.profiles.map(p=>[p.id,p]));
     for(const p of submitted.profiles){
      const existing=profiles.get(p.id);
      if(!existing||Date.parse(p.updatedAt||0)>Date.parse(existing.updatedAt||0))profiles.set(p.id,p);
     }
     cloudState={version:1,profiles:[...profiles.values()]};
     cloudWrites++;
     return fulfill(200,{ok:true,saved:true,...cloudState});
    }
   }
   throw Error("Unexpected Worker request "+method+" "+url.pathname);
  }
  await page.route("https://forma-github-sync.threadid.workers.dev/**",mockWorker);
  await page.locator('[data-nav="settings"]').first().click();
  await page.locator("#githubRefreshBtn").click();
  await page.waitForFunction(()=>document.querySelector("#githubSyncStatus")?.textContent?.includes("serverový GitHub token"),{timeout:7000});
  assert.equal(cloudWrites,0,"Never claim upload without server configuration");
  assert((await page.locator("#githubSyncStatus").getAttribute("data-level"))==="error");
  assert((await page.locator("#cloudHomeText").innerText()).includes("lokálne"),"Offline data state should be obvious");
  cloudReady=true;
  await page.locator("#githubRefreshBtn").click();
  await page.waitForFunction(()=>document.querySelector("#githubSyncStatus")?.dataset.level==="success",{timeout:10000});
  assert(cloudWrites>=1,"Server-ready first sync uploads local profiles");
  assert(cloudState.profiles.some(p=>p.name==="Daniel")&&cloudState.profiles.some(p=>p.name==="Mama"));
  assert(cloudState.profiles.find(p=>p.name==="Daniel").data.foods.some(x=>x.name.includes("Praženica")));
  await page.locator('[data-nav="home"]').first().click();
  await page.locator("#homeAdd").click();
  await page.locator('[data-quick-food="banana"]').click();
  await page.locator("#foodSave").click();
  await page.waitForFunction(()=>document.querySelector("#githubSyncStatus")?.dataset.level==="success",{timeout:10000});
  assert(cloudState.profiles.find(p=>p.name==="Daniel").data.foods.some(x=>x.name==="Banán (jedlá časť)"),"Autosave food into GitHub cloud must work");
  const second=await browser.newContext({viewport:{width:390,height:844}});
  const momDevice=await second.newPage();
  await momDevice.route("https://forma-github-sync.threadid.workers.dev/**",mockWorker);
  await momDevice.goto("http://127.0.0.1:8765/",{waitUntil:"domcontentloaded"});
  await momDevice.waitForFunction(()=>document.querySelector("#githubSyncStatus")?.dataset.level==="success",{timeout:10000});
  assert(await momDevice.locator("#profileOverlay").isVisible(),"Fresh phone should let user choose an imported profile");
  assert((await momDevice.locator("#profileList").innerText()).includes("Mama"),"Fresh phone loads Mom profile");
  await momDevice.locator('#profileList [data-profile-select]').filter({hasText:"Mama"}).click();
  await momDevice.locator("#homeAdd").click();
  await momDevice.locator('[data-quick-food="skyr"]').click();
  await momDevice.locator("#foodSave").click();
  await momDevice.waitForFunction(()=>document.querySelector("#githubSyncStatus")?.dataset.level==="success",{timeout:10000});
  assert(cloudState.profiles.find(p=>p.name==="Mama").data.foods.some(x=>x.name==="Skyr biely"),"Second phone saves Mom's profile");
  await page.locator('[data-nav="settings"]').first().click();
  await page.locator("#githubRefreshBtn").click();
  await page.waitForFunction(()=>document.querySelector("#githubSyncStatus")?.dataset.level==="success",{timeout:10000});
  await page.locator("#profileHeaderBtn").click();
  await page.locator('#profileList [data-profile-select]').filter({hasText:"Mama"}).click();
  assert((await page.locator("#homeMealList").innerText()).includes("Skyr biely"),"First phone downloads Mom's meal");
  await second.close();
  console.log("PASS: token-free Worker health gate, autosave, and two-device family sync");

  await context.close();
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
