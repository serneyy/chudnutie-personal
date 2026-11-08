/* FORMA 3.0 | mobile-first personal tracker | no server-side account */
(function(){
"use strict";
const KEY="forma-personal-v2";
const $=id=>document.getElementById(id);
const $all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const today=dateLocal(new Date());
const MEALS=[["ranajky","Raňajky"],["desiata","Desiata"],["obed","Obed"],["olovrant","Olovrant"],["vecera","Večera"],["ine","Ostatné"]];
const EXERCISES={gym:{name:"Fitko / silový tréning",met:3.5},walk:{name:"Svižná chôdza",met:4.8},bike:{name:"Bicykel",met:6},run:{name:"Beh",met:8}};
const DEFAULT={profile:{weight:94,height:189,target:88,age:22,sex:"male",activity:1.2,rate:.3},foods:[],weights:[],workouts:[]};
let state=structuredCloneSafe(DEFAULT);
let selectedDay=today,foodContextMeal="ranajky",activeView="home",toastTimer;
let scanner=null,nativeStream=null,nativeTimer=null,nativeVideoActive=false,scannerRunning=false,scanSession=0,barcodeBusy=false;
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
function validProfile(p){return p&&validNum(p.weight,35,300)&&validNum(p.target,35,300)&&validNum(p.height,120,230)&&validNum(p.age,18,95)&&["male","female"].includes(p.sex)&&[1.2,1.375,1.55,1.725].includes(Number(p.activity))&&[.25,.3,.4,.5,.65,.75].includes(Number(p.rate))}
function normalize(input){
 if(!input||!validProfile(input.profile)||!Array.isArray(input.foods)||!Array.isArray(input.weights)||!Array.isArray(input.workouts))throw Error("Neplatný súbor údajov.");
 const p=input.profile;const obj={profile:{weight:+p.weight,target:+p.target,height:+p.height,age:+p.age,sex:p.sex,activity:+p.activity,rate:+p.rate},foods:[],weights:[],workouts:[]};
 obj.foods=input.foods.slice(0,20000).filter(x=>x&&typeof x.name==="string"&&x.name.length<=100&&validDate(x.date)&&MEALS.some(m=>m[0]===x.meal)&&validNum(x.grams,1,10000)&&["kcal","protein","carbs","fat","sugar"].every(k=>validNum(x[k],0,200000))).map(x=>({id:String(x.id||uid()).slice(0,100),name:x.name,date:x.date,meal:x.meal,grams:+x.grams,kcal:+x.kcal,protein:+x.protein,carbs:+x.carbs,fat:+x.fat,sugar:+x.sugar,fiber:validNum(x.fiber,0,200000)?+x.fiber:null,code:String(x.code||"").slice(0,16)}));
 obj.weights=input.weights.slice(0,10000).filter(x=>x&&validDate(x.date)&&validNum(x.kg,35,300)).map(x=>({date:x.date,kg:+x.kg}));
 obj.workouts=input.workouts.slice(0,10000).filter(x=>x&&validDate(x.date)&&EXERCISES[x.type]&&validNum(x.minutes,1,480)).map(x=>({id:String(x.id||uid()).slice(0,100),type:x.type,date:x.date,minutes:+x.minutes}));
 return obj;
}
try{let v=localStorage.getItem(KEY);if(v)state=normalize(JSON.parse(v))}catch(e){console.warn("Chyba pri čítaní uložených dát:",e)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){notify("Údaje sa neuložili. Skús zálohu.")}}
function notify(text){$("toast").textContent=text;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3300)}
function lastWeight(){const weights=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));return weights.length?weights[weights.length-1].kg:state.profile.weight}
function plan(){
 const p=state.profile;
 const bmr=10*p.weight+6.25*p.height-5*p.age+(p.sex==="male"?5:-161);
 const tdee=bmr*p.activity;
 const desired=tdee-p.rate*7700/7;
 const floor=p.sex==="male"?1600:1400;
 const calories=Math.max(floor,Math.round(Math.max(floor,desired)/50)*50);
 const protein=Math.round(p.target*1.6),fat=Math.round(p.target*.8);
 const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
 const deficit=Math.max(0,tdee-calories),rate=deficit*7/7700;
 const remaining=Math.max(0,lastWeight()-p.target);
 const weeks=remaining===0?0:rate>0?Math.ceil(remaining/rate):null;
 return {bmr,tdee,calories,protein,fat,carbs,deficit,rate,remaining,weeks,targetDate:weeks===null?null:addDays(today,weeks*7),floor,capped:desired<floor};
}
function foodsFor(day){return state.foods.filter(f=>f.date===day)}
function daily(day){let o={kcal:0,protein:0,carbs:0,fat:0,sugar:0,fiber:0};foodsFor(day).forEach(f=>Object.keys(o).forEach(k=>o[k]+=Number(f[k])||0));return o}
function streak(){const dates=new Set([...state.foods.map(x=>x.date),...state.weights.map(x=>x.date),...state.workouts.map(x=>x.date)]);let count=0;for(let i=0;i<400;i++){let day=addDays(today,-i);if(dates.has(day))count++;else if(i>0)break}return count}
function capProgress(value,max){return Math.max(0,Math.min(100,100*value/Math.max(max,1)))}
function setView(view){if(!$("view-"+view))return;activeView=view;$all(".view").forEach(el=>el.classList.toggle("active",el.id==="view-"+view));$all("[data-nav]").forEach(el=>el.classList.toggle("active",el.dataset.nav===view));window.scrollTo({top:0,behavior:"instant"});$("main").focus({preventScroll:true})}
function mealMarkup(f,mini=false){
 const edit=mini?"":'<button class="small-button" data-edit-food="'+escapeHTML(f.id)+'" aria-label="Upraviť">'+icon("edit")+'</button>';
 const del=mini?"":'<button class="small-button" data-remove-food="'+escapeHTML(f.id)+'" aria-label="Zmazať">'+icon("trash")+'</button>';
 return '<div class="meal-item"><span class="meal-icon">'+icon("list")+'</span><div class="meal-details"><strong>'+escapeHTML(f.name)+'</strong><small>'+dec(f.grams)+' g/ml · B '+dec(f.protein)+' g · S '+dec(f.carbs)+' g</small></div><div class="meal-kcal">'+fmt(f.kcal)+' kcal</div>'+edit+del+'</div>';
}
function renderHome(){
 const c=plan(),s=daily(today),sCount=streak(),start=state.profile.weight,target=state.profile.target;
 $("headerDate").textContent=formatDate(today);
 $("homeHeading").textContent=sCount>=3?"Len tak ďalej.":"Dnes sa počíta.";
 $("heroWeights").innerHTML=dec(start)+' <span>→</span> '+dec(target)+' <small>kg</small>';
 $("heroStreak").innerHTML=icon("bolt")+" "+(sCount?sCount+" dní v rytme":"Začíname");
 $("heroRemaining").textContent=dec(c.remaining)+" kg";$("heroWeeks").textContent=c.weeks===null?"–":c.weeks;
 let p=start<=target?100:capProgress(start-lastWeight(),start-target);
 $("heroTrack").style.width=p+"%";$("heroCaption").textContent=c.remaining===0?"Cieľ dosiahnutý. Teraz udržuj svoju formu.":p>0?"Už si prešiel "+fmt(p)+" % cesty.":"Prvý krok je začať.";
 $("homeCalories").textContent=fmt(s.kcal);$("homeCaloriesGoal").textContent=fmt(c.calories);
 $("homeRemaining").textContent=fmt(c.calories-s.kcal);
 $("energyRing").style.setProperty("--fill",Math.min(360,s.kcal/c.calories*360)+"deg");
 $("calorieFill").style.width=capProgress(s.kcal,c.calories)+"%";
 $("calorieNote").textContent=s.kcal>c.calories?"Cieľ je prekročený. Zajtra pokračuj normálne, bez kompenzovania.":s.kcal?"Sleduj príjem a jedz pravidelne.":"Pridaj svoje prvé jedlo. Začínaš jednoducho.";
 const macro=[["protein","Bielkoviny",s.protein,c.protein],["carbs","Sacharidy",s.carbs,c.carbs],["fat","Tuky",s.fat,c.fat]];
 $("homeMacros").innerHTML=macro.map(x=>'<div class="macro-card '+x[0]+'"><span>'+x[1]+'</span><strong>'+fmt(x[2])+' <small>g</small></strong><small>z '+fmt(x[3])+' g</small><div class="macro-line"><div style="width:'+capProgress(x[2],x[3])+'%"></div></div></div>').join("");
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
 $("diaryMacroText").textContent="B "+dec(s.protein)+" g  ·  S "+dec(s.carbs)+" g  ·  T "+dec(s.fat)+" g  ·  Cukry "+dec(s.sugar)+" g";
 $("diarySections").innerHTML=MEALS.map(([key,name])=>{
   const foods=foodsFor(selectedDay).filter(f=>f.meal===key),sum=foods.reduce((n,f)=>n+f.kcal,0);
   return '<section class="diary-group"><div class="diary-head"><div><h2>'+name+'</h2><small>'+fmt(sum)+' kcal</small></div><button data-add-meal="'+key+'">+ Pridať</button></div><div class="card">'+(foods.length?foods.map(f=>mealMarkup(f)).join(""):'<div class="empty-state">Zatiaľ žiadne jedlo.</div>')+'</div></section>';
 }).join("");
}
function macroRow(key,name,g,show){return '<div class="macro-row '+key+'"><div class="row"><strong>'+name+'</strong><small>'+fmt(g)+' g / deň</small></div><div class="macro-line"><div style="width:'+show+'%"></div></div></div>'}
function exerciseBurn(type,minutes){return Math.round(EXERCISES[type].met*3.5*lastWeight()/200*minutes)}
function monday(date){let d=new Date(date+"T12:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));return dateLocal(d)}
function renderPlan(){
 const c=plan(),p=state.profile;
 [["pWeight",p.weight],["pTarget",p.target],["pHeight",p.height],["pAge",p.age],["pSex",p.sex],["pActivity",p.activity],["pRate",p.rate]].forEach(x=>$(x[0]).value=x[1]);
 $("planCalories").textContent=fmt(c.calories);$("planTdee").textContent=fmt(c.tdee);$("planDeficit").textContent="−"+fmt(c.deficit);
 $("planWeeks").textContent=c.weeks===null?"–":c.weeks+" t.";
 $("planDate").textContent=c.targetDate?"cca "+formatDate(c.targetDate):"Odlišné tempo";
 $("planSubtitle").textContent=c.capped?"Tempo bolo zmiernené, aby príjem nebol extrémne nízky.":"Odhad pri zvolenej aktivite a tempe.";
 $("planMacroCard").innerHTML=macroRow("protein","Bielkoviny",c.protein,Math.round(c.protein*4/c.calories*100))+macroRow("carbs","Sacharidy",c.carbs,Math.round(c.carbs*4/c.calories*100))+macroRow("fat","Tuky",c.fat,Math.round(c.fat*9/c.calories*100))+'<p class="card-sub">Makrá sú orientačné. Bielkoviny cca 1,6 g/kg cieľovej váhy, tuky cca 0,8 g/kg a zvyšok sacharidy.</p>';
 $("sugarAdvice").textContent="Orientačne pod "+dec(c.calories*.1/4)+" g voľných cukrov denne (10 % energie).";
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
 $("weightStart").textContent=dec(state.profile.weight);$("weightNow").textContent=dec(lastWeight());$("weightLeft").textContent=dec(c.remaining);
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
 $("foodForm").reset();$("foodEditId").value="";$("foodTitle").textContent="Pridať jedlo";$("foodSave").innerHTML='Pridať do denníka '+icon("check");
 $("foodMeal").value=options.meal||foodContextMeal;$("foodDate").value=options.date||selectedDay;
 $("foodGrams").value="100";["fProtein","fCarbs","fFat","fSugar"].forEach(id=>$(id).value="0");
 $("fFiber").value="";$("fKcal").value="";$("foodEAN").value="";
 $("foodLookupMessage").hidden=true;$("foodLookupMessage").classList.remove("warn");
 if(options.record){
  const f=options.record,m=100/f.grams;
  $("foodEditId").value=f.id;$("foodTitle").textContent="Upraviť jedlo";$("foodSave").innerHTML='Uložiť zmeny '+icon("check");
  $("foodName").value=f.name;$("foodGrams").value=f.grams;$("foodDate").value=f.date;$("foodMeal").value=f.meal;$("foodEAN").value=f.code||"";
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([id,key])=>$(id).value=f[key]===null?"":round(f[key]*m));
 }
 if(options.product){
  const p=options.product;
  $("foodName").value=p.name||"";$("foodEAN").value=p.code||"";
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([id,key])=>$(id).value=p[key]==null?"":round(p[key]));
  if(p.notice){$("foodLookupMessage").hidden=false;$("foodLookupMessage").textContent=p.notice;$("foodLookupMessage").classList.add("warn")}
 }
 renderFoodPreview();$("foodOverlay").hidden=false;bodyLock();
}
function closeFood(){$("foodOverlay").hidden=true;bodyUnlock()}
function renderFoodPreview(){
 const g=Number($("foodGrams").value)||0,calc=id=>round((Number($(id).value)||0)*g/100);
 $("foodPreviewCalories").textContent=fmt(calc("fKcal"))+" kcal";
 $("foodPreviewMacros").textContent="B "+dec(calc("fProtein"))+" g · S "+dec(calc("fCarbs"))+" g · T "+dec(calc("fFat"))+" g";
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
 const entry={id:old||String(uid()),name:name.slice(0,100),date,meal,grams,...data,fiber:fiber===null?null:round(fiber*grams/100),code:$("foodEAN").value.trim()};
 if(old)state.foods=state.foods.filter(f=>f.id!==old);
 state.foods.push(entry);selectedDay=date;save();closeFood();render();notify(old?"Zmeny boli uložené.":"Jedlo je zapísané.");
}
function submitPlan(e){
 e.preventDefault();
 const p={weight:+$("pWeight").value,target:+$("pTarget").value,height:+$("pHeight").value,age:+$("pAge").value,sex:$("pSex").value,activity:+$("pActivity").value,rate:+$("pRate").value};
 if(!validProfile(p)||p.target>p.weight){notify("Skontroluj údaje. Cieľ nesmie byť vyšší než aktuálna váha.");return}
 state.profile=p;save();render();notify("Tvoj plán je prepočítaný.");
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
 const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="forma-zaloha-"+today+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function importData(file){if(!file)return;try{const data=normalize(JSON.parse(await file.text()));if(!confirm("Nahradiť všetky existujúce záznamy touto zálohou?"))return;state=data;save();render();notify("Záloha obnovená.")}catch(e){notify("Záloha je neplatná.")}}
function scanMessage(message,isError=false){$("scanStatus").textContent=message;$("scanStatus").classList.toggle("error",isError)}
function cameraPlaceholder(message,show=true){$("cameraPlaceholder").hidden=!show;if(show)$("cameraPlaceholder").querySelector("span").textContent=message}
function scannerFormats(){const f=window.Html5QrcodeSupportedFormats;if(!f)return undefined;return [f.EAN_13,f.EAN_8,f.UPC_A,f.UPC_E,f.CODE_128,f.ITF,f.CODE_39].filter(x=>x!==undefined)}
function isValidEAN(code){return /^\d{8,14}$/.test(String(code||"").trim())}
async function loadScannerLibrary(){
 if(window.Html5Qrcode)return true;
 const sources=["https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js","https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"];
 for(const src of sources){
  const ok=await new Promise(resolve=>{const script=document.createElement("script");script.src=src;script.onload=()=>resolve(!!window.Html5Qrcode);script.onerror=()=>resolve(false);document.head.appendChild(script)});
  if(ok)return true;
 }
 return false;
}
async function stopCamera(){
 scanSession++;if(nativeTimer!==null){clearTimeout(nativeTimer);nativeTimer=null}
 if(nativeStream){nativeStream.getTracks().forEach(t=>t.stop());nativeStream=null}
 $("cameraVideo").pause();$("cameraVideo").srcObject=null;nativeVideoActive=false;
 if(scanner){const s=scanner,active=scannerRunning;scanner=null;scannerRunning=false;try{if(active)await s.stop()}catch(e){}try{await s.clear()}catch(e){}}
 $("nativeCamera").hidden=false;$("html5Camera").hidden=true;
}
function closeScan(){stopCamera();$("scanOverlay").hidden=true;bodyUnlock()}
function scanSuccess(code){
 if(barcodeBusy||!isValidEAN(code))return;
 barcodeBusy=true;
 scanMessage("Kód "+String(code).trim()+" rozpoznaný. Načítavam výživové hodnoty…");
 try{if(navigator.vibrate)navigator.vibrate(80)}catch(e){}
 stopCamera().then(async()=>{
  $("scanOverlay").hidden=true;bodyUnlock();
  await lookupCode(String(code).trim());
  barcodeBusy=false;
 }).catch(()=>{barcodeBusy=false});
}
async function startNative(token){
 if(!("BarcodeDetector" in window)||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)return false;
 let formats;
 try{const available=await BarcodeDetector.getSupportedFormats();formats=["ean_13","ean_8","upc_a","upc_e","code_128","itf","code_39"].filter(f=>available.includes(f))}catch(e){formats=[]}
 if(!formats.length||token!==scanSession)return false;
 try{
  const detector=new BarcodeDetector({formats});
  nativeStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
  if(token!==scanSession){nativeStream.getTracks().forEach(t=>t.stop());nativeStream=null;return false}
  const video=$("cameraVideo");video.srcObject=nativeStream;await video.play();nativeVideoActive=true;cameraPlaceholder("",false);
  scanMessage("Kamera aktívna. Namier čiarový kód do rámčeka, načíta sa automaticky.");
  const tick=async()=>{
   if(token!==scanSession||barcodeBusy||!nativeVideoActive)return;
   try{
    if(video.readyState>=2){const matches=await detector.detect(video);if(token!==scanSession)return;const found=matches.find(x=>isValidEAN(x.rawValue));if(found){scanSuccess(found.rawValue);return}}
   }catch(e){console.warn("BarcodeDetector:",e)}
   if(token===scanSession)nativeTimer=setTimeout(tick,180);
  };
  tick();return true;
 }catch(e){console.warn("Natívna kamera zlyhala:",e);if(nativeStream){nativeStream.getTracks().forEach(t=>t.stop());nativeStream=null}return false}
}
async function startFallback(token){
 if(token!==scanSession)return;
 cameraPlaceholder("Načítavam skener…");
 scanMessage("Spúšťam alternatívny kamerový skener…");
 const ok=await loadScannerLibrary();
 if(!ok||token!==scanSession){if(token===scanSession){cameraPlaceholder("Skener sa nenačítal.");scanMessage("Skener nie je dostupný. Použi možnosť Odfotiť obal alebo zadaj EAN ručne.",true)}return}
 $("nativeCamera").hidden=true;$("html5Camera").hidden=false;
 try{
  scanner=new Html5Qrcode("html5Camera",{formatsToSupport:scannerFormats(),verbose:false});
  const cfg={fps:12,qrbox:(w,h)=>({width:Math.floor(Math.min(290,w*.84)),height:Math.floor(Math.min(125,h*.55))}),disableFlip:true};
  await scanner.start({facingMode:"environment"},cfg,decoded=>scanSuccess(decoded));
  if(token!==scanSession){await stopCamera();return}
  scannerRunning=true;cameraPlaceholder("",false);
  scanMessage("Kamera je pripravená. Drž čiarový kód rovno v rámčeku, bez odleskov.");
 }catch(err){
  console.warn("HTML5 skener:",err);
  cameraPlaceholder("Prístup ku kamere zlyhal.");
  scanMessage("Nepodarilo sa spustiť kameru. Povoľ prístup ku kamere v nastaveniach prehliadača alebo použi foto režim.",true);
 }
}
async function openScanner(){
 if(!$("scanOverlay").hidden)return;
 await stopCamera();$("scanOverlay").hidden=false;bodyLock();barcodeBusy=false;$("manualEAN").value="";
 cameraPlaceholder("Pripravujem kameru…");scanMessage("Žiadam povolenie pre kameru…");
 if(!window.isSecureContext){cameraPlaceholder("Vyžaduje sa HTTPS.");scanMessage("Kamera potrebuje zabezpečenú adresu HTTPS. GitHub Pages ju podporuje. Použi foto režim.",true);return}
 const token=scanSession;
 const native=await startNative(token);if(token!==scanSession)return;if(!native)await startFallback(token);
}
async function forceFallback(){
 await stopCamera();barcodeBusy=false;const token=scanSession;await startFallback(token);
}
async function photoDecode(file){
 if(!file)return;
 await stopCamera();barcodeBusy=false;
 cameraPlaceholder("Spracúvam fotografiu…");scanMessage("Hľadám čiarový kód na fotografii…");
 const token=scanSession;
 try{
  if("BarcodeDetector" in window){
   try{
    const formats=await BarcodeDetector.getSupportedFormats();
    const good=["ean_13","ean_8","upc_a","upc_e","code_128","itf","code_39"].filter(f=>formats.includes(f));
    if(good.length){
     const bitmap=await createImageBitmap(file),d=new BarcodeDetector({formats:good});
     const codes=await d.detect(bitmap);bitmap.close&&bitmap.close();
     if(token!==scanSession)return;
     const hit=codes.find(x=>isValidEAN(x.rawValue));if(hit){scanSuccess(hit.rawValue);return}
    }
   }catch(e){console.warn("Foto native decode:",e)}
  }
  if(!await loadScannerLibrary())throw Error("Knižnicu skenera sa nepodarilo načítať.");
  if(token!==scanSession)return;
  $("html5Camera").hidden=false;$("nativeCamera").hidden=true;
  const temp=new Html5Qrcode("html5Camera",{formatsToSupport:scannerFormats(),verbose:false});
  let result;try{result=await temp.scanFileV2(file,true)}finally{try{await temp.clear()}catch(e){}}
  if(token!==scanSession)return;
  const code=typeof result==="string"?result:result&&result.decodedText;
  if(!isValidEAN(code))throw Error("Na fotke sa nenašiel čitateľný EAN/UPC.");
  scanSuccess(code);
 }catch(e){console.warn("Fotka:",e);if(token===scanSession){cameraPlaceholder("Čiarový kód sa nenašiel.");scanMessage("Na fotke sa nepodarilo nájsť kód. Skús ostrejšiu fotografiu celého kódu alebo zadaj EAN ručne.",true)}}
}
async function lookupCode(code){
 const input=String(code||"").trim();
 if(!isValidEAN(input)){notify("EAN musí mať 8 až 14 číslic.");return}
 foodModal({meal:foodContextMeal,date:selectedDay,product:{code:input,name:"",notice:"Hľadám výrobok podľa čiarového kódu…"}});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const url="https://world.openfoodfacts.org/api/v3/product/"+encodeURIComponent(input)+"?fields=code,product_name,product_name_sk,product_name_en,nutriments";
  const response=await fetch(url,{signal:controller.signal,headers:{"Accept":"application/json"}});
  if(!response.ok)throw Error("API odpovedalo chybou "+response.status);
  const data=await response.json();
  if(!data.product||data.status==="failure"||data.status===0)throw Error("Výrobok sa v databáze nenašiel.");
  const p=data.product,n=p.nutriments||{};
  const value=k=>{const v=n[k+"_100g"];return v==null||!Number.isFinite(Number(v))?null:Number(v)};
  let kcal=value("energy-kcal");if(kcal===null){const kj=value("energy-kj");if(kj!==null)kcal=kj/4.184}
  const info={name:p.product_name_sk||p.product_name||p.product_name_en||"Produkt "+input,code:input,kcal,protein:value("proteins"),carbs:value("carbohydrates"),fat:value("fat"),sugar:value("sugars"),fiber:value("fiber")};
  if($("foodOverlay").hidden)return;
  $("foodName").value=info.name;
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([field,key])=>$(field).value=info[key]===null?"":round(info[key]));
  const missing=["kcal","protein","carbs","fat","sugar"].filter(k=>info[k]===null);
  $("foodLookupMessage").hidden=false;$("foodLookupMessage").classList.toggle("warn",missing.length>0);
  $("foodLookupMessage").textContent=missing.length?"Produkt nájdený, ale niektoré nutričné hodnoty chýbajú. Doplň ich podľa obalu.":"Produkt rozpoznaný. Skontroluj údaje podľa obalu a uprav množstvo.";
  renderFoodPreview();
 }catch(e){
  if($("foodOverlay").hidden)return;
  $("foodLookupMessage").hidden=false;$("foodLookupMessage").classList.add("warn");
  $("foodLookupMessage").textContent="Nenašlo sa: "+(e.name==="AbortError"?"Vyhľadávanie trvalo príliš dlho.":e.message)+ " Zadaj údaje z obalu ručne.";
 }finally{clearTimeout(timeout)}
}
function delegatedClick(e){
 const nav=e.target.closest("[data-nav]");if(nav){setView(nav.dataset.nav);return}
 if(e.target.closest('[data-action="scan"]')){foodContextMeal="ranajky";selectedDay=today;openScanner();return}
 const meal=e.target.closest("[data-add-meal]");if(meal){foodContextMeal=meal.dataset.addMeal;foodModal({meal:foodContextMeal,date:selectedDay});return}
 const edit=e.target.closest("[data-edit-food]");if(edit){let f=state.foods.find(x=>x.id===edit.dataset.editFood);if(f)foodModal({record:f});return}
 const remove=e.target.closest("[data-remove-food]");if(remove){if(confirm("Vymazať toto jedlo?")){state.foods=state.foods.filter(x=>x.id!==remove.dataset.removeFood);save();render();notify("Jedlo vymazané.")}return}
 const wr=e.target.closest("[data-remove-weight]");if(wr){if(confirm("Vymazať toto váženie?")){state.weights=state.weights.filter(x=>x.date!==wr.dataset.removeWeight);save();render()}return}
 const ex=e.target.closest("[data-remove-workout]");if(ex){if(confirm("Vymazať túto aktivitu?")){state.workouts=state.workouts.filter(x=>x.id!==ex.dataset.removeWorkout);save();render()}return}
}
document.addEventListener("click",delegatedClick);
$("homeAdd").addEventListener("click",()=>{foodContextMeal="ranajky";foodModal({meal:foodContextMeal,date:today})});
$("prevDay").addEventListener("click",()=>{selectedDay=addDays(selectedDay,-1);renderDiary()});
$("nextDay").addEventListener("click",()=>{selectedDay=addDays(selectedDay,1);renderDiary()});
$("foodForm").addEventListener("submit",submitFood);
$("foodForm").addEventListener("input",renderFoodPreview);
$("planForm").addEventListener("submit",submitPlan);
$("weightForm").addEventListener("submit",submitWeight);
$("workoutForm").addEventListener("submit",submitWorkout);
$("closeFood").addEventListener("click",closeFood);
$("foodOverlay").addEventListener("click",e=>{if(e.target===$("foodOverlay"))closeFood()});
$("closeScan").addEventListener("click",closeScan);
$("scanOverlay").addEventListener("click",e=>{if(e.target===$("scanOverlay"))closeScan()});
$("fallbackScan").addEventListener("click",forceFallback);
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
$("resetBtn").addEventListener("click",()=>{if(confirm("Naozaj odstrániť všetky lokálne záznamy? Bez zálohy ich neobnovíš.")){state=structuredCloneSafe(DEFAULT);selectedDay=today;save();render();notify("Všetky záznamy boli vymazané.")}});
$("weightDate").value=today;$("wDate").value=today;
render();setView("home");
})();
