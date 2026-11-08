/* FORMA 3.0 | mobile-first personal tracker | no server-side account */
(function(){
"use strict";
const KEY="forma-personal-v2";
const $=id=>document.getElementById(id);
const $all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const today=dateLocal(new Date());
const MEALS=[["ranajky","Raňajky"],["desiata","Desiata"],["obed","Obed"],["olovrant","Olovrant"],["vecera","Večera"],["ine","Ostatné"]];
const EXERCISES={gym:{name:"Fitko / silový tréning",met:3.5},walk:{name:"Svižná chôdza",met:4.8},bike:{name:"Bicykel",met:6},run:{name:"Beh",met:8}};
const DEFAULT={profile:{weight:94,height:189,target:88,age:22,sex:"male",activity:1.2,rate:.3,mode:"lose",lossTarget:88},foods:[],weights:[],workouts:[]};
let state=structuredCloneSafe(DEFAULT);
let selectedDay=today,foodContextMeal="ranajky",activeView="home",toastTimer,activeLookupNonce=0,lossTargetDraft=88;
let nativeStream=null,nativeTimer=null,scanSession=0,barcodeBusy=false,frameInFlight=false;
let cameraDevices=[],cameraIndex=0,requestedDeviceId=null,scanStartedAt=0,scanAttempts=0;
let nativeDetector=null,zxingPromise=null,zxingReady=false,photoProcessing=false;
const frameCanvas=document.createElement("canvas");
const frameContext=frameCanvas.getContext("2d",{willReadFrequently:true});
const BARCODE_FORMATS=["EAN13","EAN8","UPCA","UPCE","Code128","Code39","ITF"];
const LIB_VERSION="3.1.6";
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
 obj.foods=input.foods.slice(0,20000).filter(x=>x&&typeof x.name==="string"&&x.name.length<=100&&validDate(x.date)&&MEALS.some(m=>m[0]===x.meal)&&validNum(x.grams,1,10000)&&["kcal","protein","carbs","fat","sugar"].every(k=>validNum(x[k],0,200000))).map(x=>({id:String(x.id||uid()).slice(0,100),name:x.name,date:x.date,meal:x.meal,grams:+x.grams,kcal:+x.kcal,protein:+x.protein,carbs:+x.carbs,fat:+x.fat,sugar:+x.sugar,fiber:validNum(x.fiber,0,200000)?+x.fiber:null,code:String(x.code||"").slice(0,16)}));
 obj.weights=input.weights.slice(0,10000).filter(x=>x&&validDate(x.date)&&validNum(x.kg,35,300)).map(x=>({date:x.date,kg:+x.kg}));
 obj.workouts=input.workouts.slice(0,10000).filter(x=>x&&validDate(x.date)&&EXERCISES[x.type]&&validNum(x.minutes,1,480)).map(x=>({id:String(x.id||uid()).slice(0,100),type:x.type,date:x.date,minutes:+x.minutes}));
 return obj;
}
try{let v=localStorage.getItem(KEY);if(v)state=normalize(JSON.parse(v))}catch(e){console.warn("Chyba pri čítaní uložených dát:",e)}
lossTargetDraft=state.profile.lossTarget||state.profile.target;
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){notify("Údaje sa neuložili. Skús zálohu.")}}
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
 const protein=Math.round((maintain?p.weight:p.target)*1.6);
 const fat=Math.round((maintain?p.weight:p.target)*.8);
 const carbs=Math.max(0,Math.round((calories-protein*4-fat*9)/4));
 const deficit=maintain?0:Math.max(0,tdee-calories),rate=deficit*7/7700;
 const remaining=maintain?0:Math.max(0,lastWeight()-p.target);
 const weeks=maintain?null:remaining===0?0:rate>0?Math.ceil(remaining/rate):null;
 return {bmr,tdee,calories,protein,fat,carbs,deficit,rate,remaining,weeks,maintain,fiber:25,
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
 return '<div class="meal-item"><span class="meal-icon">'+icon("list")+'</span><div class="meal-details"><strong>'+escapeHTML(f.name)+'</strong><small>'+dec(f.grams)+' g/ml · B '+dec(f.protein)+' g · S '+dec(f.carbs)+' g</small></div><div class="meal-kcal">'+fmt(f.kcal)+' kcal</div>'+edit+del+'</div>';
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
 $("homeExtras").innerHTML='<div class="nutrient-card sugar"><div class="nutrient-symbol">◈</div><div><span>Cukry celkom</span><strong>'+dec(s.sugar)+' g</strong><small>z dnešných jedál</small></div></div>'+
 '<div class="nutrient-card fiber"><div class="nutrient-symbol">≋</div><div><span>Vláknina</span><strong>'+dec(s.fiber)+' <small>/ '+c.fiber+' g</small></strong><small>'+(hasUnknown?"minimum zo známych hodnôt":"orientačný denný cieľ")+'</small></div></div>';
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
 $("diaryExtrasText").textContent="Cukry "+dec(s.sugar)+" g  ·  Vláknina "+dec(s.fiber)+" g";
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
 $("planMacroCard").innerHTML=macroRow("protein","Bielkoviny",c.protein,Math.round(c.protein*4/c.calories*100))+macroRow("carbs","Sacharidy",c.carbs,Math.round(c.carbs*4/c.calories*100))+macroRow("fat","Tuky",c.fat,Math.round(c.fat*9/c.calories*100))+'<p class="card-sub">Bielkoviny cca 1,6 g/kg hmotnosti, tuky cca 0,8 g/kg, zvyšok sacharidy. Orientačný návrh.</p>';
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
 $("foodForm").reset();$("foodEditId").value="";
 $("foodTitle").textContent=options.product?"Načítavam produkt…":"Pridať jedlo";
 $("foodStep").textContent="JEDNODUCHÝ ZÁPIS JEDLA";
 $("foodSave").innerHTML='Uložiť jedlo '+icon("check");
 $("foodSave").disabled=Boolean(options.product);
 $("foodMeal").value=options.meal||preferredMeal();
 $("foodDate").value=options.date||selectedDay;
 $("foodGrams").value="100";
 ["fProtein","fCarbs","fFat","fSugar"].forEach(id=>$(id).value="0");
 $("fFiber").value="";$("fKcal").value="";$("foodEAN").value="";
 $("foodLookupMessage").hidden=true;$("foodLookupMessage").classList.remove("warn");
 $("foodDetails").open=!options.product;
 if(options.record){
  const f=options.record,m=100/f.grams;
  $("foodEditId").value=f.id;$("foodTitle").textContent="Upraviť jedlo";
  $("foodSave").innerHTML='Uložiť zmeny '+icon("check");
  $("foodSave").disabled=false;
  $("foodName").value=f.name;$("foodGrams").value=f.grams;
  $("foodDate").value=f.date;$("foodMeal").value=f.meal;$("foodEAN").value=f.code||"";
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([id,key])=>$(id).value=f[key]===null?"":round(f[key]*m));
  $("foodDetails").open=false;
 }
 if(options.product){
  const p=options.product;
  $("foodName").value=p.name||"";$("foodEAN").value=p.code||"";
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([id,key])=>$(id).value=p[key]==null?"":round(p[key]));
  if(p.notice){$("foodLookupMessage").hidden=false;$("foodLookupMessage").textContent=p.notice;$("foodLookupMessage").classList.add("warn")}
 }
 renderFoodPreview();$("foodOverlay").hidden=false;bodyLock();
}
function closeFood(){++activeLookupNonce;$("foodOverlay").hidden=true;bodyUnlock()}
function renderFoodPreview(){
 const grams=Number($("foodGrams").value)||0,calc=id=>round((Number($(id).value)||0)*grams/100);
 $("foodPreviewCalories").textContent=fmt(calc("fKcal"))+" kcal";
 $("foodPreviewMacros").textContent="B "+dec(calc("fProtein"))+" g · S "+dec(calc("fCarbs"))+" g · T "+dec(calc("fFat"))+" g · Cukry "+dec(calc("fSugar"))+" g";
 $all("[data-grams]").forEach(el=>el.classList.toggle("selected",Number(el.dataset.grams)===grams));
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
 const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="forma-zaloha-"+today+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function importData(file){if(!file)return;try{const data=normalize(JSON.parse(await file.text()));if(!confirm("Nahradiť všetky existujúce záznamy touto zálohou?"))return;state=data;save();render();notify("Záloha obnovená.")}catch(e){notify("Záloha je neplatná.")}}
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
  const url="https://world.openfoodfacts.org/api/v3/product/"+encodeURIComponent(input)+"?fields=code,product_name,product_name_sk,product_name_en,nutriments";
  const response=await fetch(url,{signal:controller.signal,headers:{"Accept":"application/json"}});
  if(!response.ok)throw Error("API odpovedalo chybou "+response.status);
  const data=await response.json();
  if(!data.product||data.status==="failure"||data.status===0)throw Error("Výrobok sa v databáze nenašiel.");
  if(nonce!==activeLookupNonce||$("foodOverlay").hidden)return;
  const p=data.product,n=p.nutriments||{};
  const value=k=>{const v=n[k+"_100g"];return v==null||!Number.isFinite(Number(v))?null:Number(v)};
  let kcal=value("energy-kcal");if(kcal===null){const kj=value("energy-kj");if(kj!==null)kcal=kj/4.184}
  const info={name:p.product_name_sk||p.product_name||p.product_name_en||"Produkt "+input,code:input,kcal,protein:value("proteins"),carbs:value("carbohydrates"),fat:value("fat"),sugar:value("sugars"),fiber:value("fiber")};
  $("foodName").value=info.name;$("foodTitle").textContent="Zapísať potravinu";
  [["fKcal","kcal"],["fProtein","protein"],["fCarbs","carbs"],["fFat","fat"],["fSugar","sugar"],["fFiber","fiber"]].forEach(([field,key])=>$(field).value=info[key]===null?"":round(info[key]));
  const missing=["kcal","protein","carbs","fat","sugar"].filter(k=>info[k]===null);
  $("foodSave").disabled=false;
  $("foodLookupMessage").hidden=false;
  $("foodLookupMessage").classList.toggle("warn",missing.length>0);
  $("foodLookupMessage").textContent=missing.length?"Produkt sa našiel, ale niektoré hodnoty chýbajú. Otvorené detaily doplň podľa etikety.":"Produkt nájdený. Stačí nastaviť množstvo a uložiť.";
  $("foodDetails").open=missing.length>0;
  renderFoodPreview();
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
$("homeAdd").addEventListener("click",()=>{foodContextMeal=preferredMeal();foodModal({meal:foodContextMeal,date:today})});
$("prevDay").addEventListener("click",()=>{selectedDay=addDays(selectedDay,-1);renderDiary()});
$("nextDay").addEventListener("click",()=>{selectedDay=addDays(selectedDay,1);renderDiary()});
$("foodForm").addEventListener("submit",submitFood);
$("foodForm").addEventListener("input",renderFoodPreview);
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
$("resetBtn").addEventListener("click",()=>{if(confirm("Naozaj odstrániť všetky lokálne záznamy? Bez zálohy ich neobnovíš.")){state=structuredCloneSafe(DEFAULT);selectedDay=today;save();render();notify("Všetky záznamy boli vymazané.")}});
$("weightDate").value=today;$("wDate").value=today;
render();setView("home");
})();
