// FORMA food-search proxy. No profile access, no credentials, no persistent user data.
// Deployed as a dedicated Cloudflare Worker; never modify the family-sync Worker.
const ALLOWED_ORIGINS = new Set(["https://serneyy.github.io", "http://127.0.0.1:8765", "http://localhost:8765"]);
const OFF_FIELDS = "code,product_name,product_name_sk,product_name_en,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,image_front_small_url,image_small_url,image_front_url,image_url,lang,lc";
const USER_AGENT = "FORMA-Personal/2.0 (help@teenwear.eu)";

function respond(body, status, origin, extra={}) {
 const headers = {
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "Vary":"Origin",
  "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin) ? origin : "https://serneyy.github.io",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Access-Control-Allow-Headers":"Accept",
  "X-Content-Type-Options":"nosniff",
  ...extra
 };
 return new Response(JSON.stringify(body),{status,headers});
}
function normalizeProduct(input){
 const p=input?._source||input?.source||input;
 if(!p||typeof p!=="object")return null;
 const code=String(p.code||"").replace(/[^0-9]/g,"").slice(0,14);
 const name=String(p.product_name_sk||p.product_name||p.product_name_en||"").trim().slice(0,150);
 const n=p.nutriments;
 if(!name||!n||typeof n!=="object")return null;
 const kcal=Number(n["energy-kcal_100g"]??(Number(n["energy-kj_100g"])/4.184));
 if(!Number.isFinite(kcal)||kcal<0||kcal>1800)return null;
 const brand=Array.isArray(p.brands)?p.brands.join(", "):String(p.brands||"");
 const numeric={};
 for(const key of ["energy-kcal","energy-kj","proteins","carbohydrates","fat","sugars","fiber"]){
  const val=Number(n[key+"_100g"]);
  if(n[key+"_100g"]!=null && Number.isFinite(val) && val>=0 && val<=2000)numeric[key+"_100g"]=val;
 }
 const imageCandidates=[p.image_front_small_url,p.image_small_url,p.image_front_url,p.image_url];
 const image=imageCandidates.find(x=>typeof x==="string"&&/^https:\/\/(images|static)\.openfoodfacts\.org\//.test(x))||"";
 return {code,product_name:name,product_name_sk:String(p.product_name_sk||"").slice(0,150),brands:brand.slice(0,100),
  serving_size:String(p.serving_size||"").slice(0,50),
  serving_quantity:p.serving_quantity,serving_quantity_unit:p.serving_quantity_unit,
  product_quantity:p.product_quantity,product_quantity_unit:p.product_quantity_unit,
  nutriments:numeric,image_front_small_url:image};
}
async function requestOFF(url){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const r=await fetch(url,{headers:{"Accept":"application/json","User-Agent":USER_AGENT},signal:controller.signal,redirect:"follow"});
  if(!r.ok)throw new Error("upstream HTTP "+r.status);
  const json=await r.json();
  const entries=Array.isArray(json.hits)?json.hits:Array.isArray(json.products)?json.products:[];
  const seen=new Set(),products=[];
  for(const item of entries){
   const normalized=normalizeProduct(item);
   if(!normalized)continue;
   const id=normalized.code||normalized.product_name;
   if(seen.has(id))continue;
   seen.add(id);products.push(normalized);
   if(products.length===12)break;
  }
  return products;
 }finally{clearTimeout(timer)}
}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),origin=request.headers.get("Origin")||"";
  if(origin&&!ALLOWED_ORIGINS.has(origin))return respond({ok:false,error:"Origin not allowed"},403,origin);
  if(request.method==="OPTIONS")return respond({ok:true},200,origin,{"Access-Control-Max-Age":"86400"});
  if(request.method!=="GET")return respond({ok:false,error:"Method not allowed"},405,origin);
  if(url.pathname==="/health")return respond({ok:true,service:"forma-food-search",version:1},200,origin);
  if(url.pathname!=="/search")return respond({ok:false,error:"Not found"},404,origin);
  const q=(url.searchParams.get("q")||"").trim().slice(0,80);
  if(q.length<2)return respond({ok:false,error:"Too short"},400,origin);
  const cacheKey=new Request("https://forma-cache.invalid/v1?q="+encodeURIComponent(q.toLowerCase()));
  const cache=caches.default;
  const hit=await cache.match(cacheKey);
  if(hit){
   const data=await hit.json();
   return respond({...data,cached:true},200,origin);
  }
  const fields=OFF_FIELDS;
  const endpoints=[
   new URL("https://search.openfoodfacts.org/search"),
   new URL("https://world.openfoodfacts.org/cgi/search.pl")
  ];
  endpoints[0].searchParams.set("q",q);
  endpoints[0].searchParams.set("page_size","20");
  endpoints[0].searchParams.set("langs","sk,cs,en");
  endpoints[0].searchParams.set("fields",fields);
  endpoints[1].searchParams.set("search_terms",q);
  endpoints[1].searchParams.set("search_simple","1");
  endpoints[1].searchParams.set("action","process");
  endpoints[1].searchParams.set("json","1");
  endpoints[1].searchParams.set("page_size","16");
  endpoints[1].searchParams.set("fields",fields);
  let lastError="";
  for(let i=0;i<endpoints.length;i++){
   try{
    const products=await requestOFF(endpoints[i].toString());
    if(products.length){
     const data={ok:true,products,source:i===0?"search-a-licious":"open-food-facts"};
     ctx.waitUntil(cache.put(cacheKey,new Response(JSON.stringify(data),{headers:{"Cache-Control":"public, max-age=21600"}})));
     return respond(data,200,origin);
    }
   }catch(e){lastError=String(e.message||e).slice(0,100)}
  }
  return respond({ok:false,products:[],error:lastError||"No indexed results"},503,origin);
 }
};