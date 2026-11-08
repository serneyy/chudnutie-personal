const assert=require("node:assert/strict");
const {chromium}=require("playwright");
const bwipjs=require("bwip-js");
(async()=>{
 const png=await bwipjs.toBuffer({bcid:"ean13",text:"301762401070",scale:4,height:27,includetext:false,padding:25});
 const browser=await chromium.launch({headless:true,args:["--use-fake-ui-for-media-stream","--use-fake-device-for-media-stream"]});
 const mockProduct=JSON.stringify({status:"success",product:{product_name:"Testovací jogurt",nutriments:{"energy-kcal_100g":180,"proteins_100g":8,"carbohydrates_100g":12,"fat_100g":9,"sugars_100g":7,"fiber_100g":1}}});
 async function setup(page){
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error")console.error("BROWSER:",m.text())});
  await page.route("https://world.openfoodfacts.org/**",r=>r.fulfill({status:200,contentType:"application/json",body:mockProduct}));
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
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"0");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert(overflow<=2,"Mobile layout overflow "+overflow);
  await page.locator("#homeAdd").click();
  await page.locator("#foodName").fill("Jogurt vlastný");
  await page.locator("#foodGrams").fill("150");
  await page.locator("#fKcal").fill("200");
  await page.locator("#fProtein").fill("10");
  await page.locator("#fCarbs").fill("20");
  await page.locator("#fFat").fill("5");
  await page.locator("#fSugar").fill("4");
  await page.locator("#foodSave").click();
  assert.equal((await page.locator("#homeCalories").innerText()).trim(),"300");
  await page.locator('[data-nav="diary"]').first().click();
  assert((await page.locator("#diarySections").innerText()).includes("Jogurt vlastný"));
  await page.locator('[data-nav="plan"]').first().click();
  await page.locator("#planForm button[type=submit]").click();
  assert(Number((await page.locator("#planCalories").innerText()).replace(/[^0-9]/g,""))>1300);
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
  catch(e){throw Error("Real photo barcode scan failed: "+await page.locator("#scanStatus").innerText())}
  assert.equal(await page.locator("#foodName").inputValue(),"Testovací jogurt");
  assert.equal(await page.locator("#fKcal").inputValue(),"180");
  assert.equal(await page.locator("#foodEAN").inputValue(),"3017624010701");
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
  assert.equal(await live.locator("#foodEAN").inputValue(),"3017624010701");
  assert.deepEqual(liveErrors,[],"Live browser runtime errors: "+liveErrors.join(" | "));
  console.log("PASS: REAL streaming barcode scan using Canvas MediaStream + ZXing WASM");
  await context.close();
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
