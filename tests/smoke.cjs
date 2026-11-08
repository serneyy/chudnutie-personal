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
 const mockProduct=JSON.stringify({status:"success",product:{product_name:"Testovací jogurt",nutriments:{"energy-kcal_100g":180,"proteins_100g":8,"carbohydrates_100g":12,"fat_100g":9,"sugars_100g":7,"fiber_100g":1}}});
 const mockSearch=JSON.stringify({count:1,products:[{code:"9876543210123",product_name:"Proteínové kakao",brands:"Testová značka",serving_size:"250 ml",serving_quantity:"250",serving_quantity_unit:"ml",nutriments:{"energy-kcal_100g":62,"proteins_100g":6,"carbohydrates_100g":7,"fat_100g":1.4,"sugars_100g":6.2,"fiber_100g":0.6}}]});
 async function setup(page){
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")console.error("BROWSER:",m.text())});
  await page.route("https://world.openfoodfacts.org/**",r=>{
   const url=r.request().url(),broken=url.includes("serverfail");
   return r.fulfill({status:broken?503:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},body:broken?'{"error":"temporarily unavailable"}':url.includes("/cgi/search.pl")?mockSearch:mockProduct});
  });
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
  await page.locator('[data-nav="diary"]').first().click();
  assert((await page.locator("#diarySections").innerText()).includes("Jogurt vlastný"));
  await page.locator('[data-nav="plan"]').first().click();
  await page.locator("#planForm button[type=submit]").click();
  const lossKcal=Number((await page.locator("#planCalories").innerText()).replace(/[^0-9]/g,""));
  assert(lossKcal>1300);
  await page.locator("#modeMaintain").check();
  assert(await page.locator("#pTargetWrap").evaluate(el=>getComputedStyle(el).display==="none"));
  await page.locator("#planForm button[type=submit]").click();
  assert((await page.locator("#planSubtitle").innerText()).includes("udržiavanie"));
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
  assert.equal(await page.locator("#foodMeal").inputValue(),expected);
  assert(!await page.locator("#foodDetails").evaluate(el=>el.open),"Scanned food should hide advanced fields");
  await page.locator('[data-grams="150"]').click();
  assert.equal(await page.locator("#foodGrams").inputValue(),"150");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("270"));
  await page.locator("#foodSave").click();
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
  await page.locator("#foodSuggestions [data-suggest]").first().click();
  assert.equal(await page.locator("#foodName").inputValue(),"Proteínové kakao");
  assert.equal(await page.locator("#foodUnit").inputValue(),"ml");
  assert.equal(await page.locator("#foodGrams").inputValue(),"250");
  assert.equal(await page.locator("#fKcal").inputValue(),"62");
  assert((await page.locator("#foodPreviewCalories").innerText()).includes("155"));
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
  assert((await page.locator("#quickFoods [data-quick-food]").count())===8);
  await page.locator("#closeFood").click();
  // The remote provider may return 503. Local suggestions must still work.
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("serverfail");
  await page.waitForFunction(()=>document.getElementById("foodSuggestions")?.innerText?.includes("Nenačítali sa značkové produkty"),{timeout:25000});
  assert((await page.locator("#foodSuggestions").innerText()).includes("naskenovať čiarový kód"));
  await page.locator("#foodName").fill("proteín");
  await page.locator("#foodSuggestions [data-suggest]").first().waitFor({state:"visible",timeout:7000});
  assert((await page.locator("#foodSuggestions").innerText()).includes("Proteínový prášok"),"Local foods remain usable during API outage");
  await page.locator("#closeFood").click();
  // A known successful search should be cached in localStorage and survive reload.
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("kakao");
  await page.waitForFunction(()=>document.getElementById("foodSuggestions")?.innerText?.includes("Proteínové kakao"),{timeout:12000});
  const cacheEntries=await page.evaluate(()=>JSON.parse(localStorage.getItem("forma-off-search-cache-v1")||"[]"));
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
  await page.locator("#diarySections [data-edit-food]").first().click();
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
  await context.close();
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
