const assert=require("node:assert/strict");
const fs=require("node:fs");
(async()=>{
 const src=fs.readFileSync("cloudflare/forma-github-sync.js","utf8");
 const worker=(await import("data:text/javascript;base64,"+Buffer.from(src).toString("base64"))).default;
 let cloud={version:1,profiles:[]},sha="initial",writes=0;
 const realFetch=global.fetch;
 const b64=s=>Buffer.from(s,"utf8").toString("base64");
 global.fetch=async(url,options={})=>{
  const u=String(url),method=options.method||"GET";
  assert(u.startsWith("https://api.github.com/repos/serneyy/chudnutie-personal/contents/data/forma-family.json"),"Only expected GitHub file");
  if(method==="GET")return new Response(JSON.stringify({sha,content:b64(JSON.stringify(cloud))}),{status:200});
  assert.equal(method,"PUT");
  assert.equal(options.headers.Authorization,"Bearer test_server_secret");
  const body=JSON.parse(options.body);
  if(body.sha!==sha)return new Response("conflict",{status:409});
  cloud=JSON.parse(Buffer.from(body.content,"base64").toString("utf8"));
  writes++;
  sha="sha"+writes;
  return new Response(JSON.stringify({content:{sha}}),{status:200});
 };
 const origin="https://serneyy.github.io";
 const make=(method,path,body)=>new Request("https://forma-github-sync.threadid.workers.dev"+path,{
  method,headers:{"Origin":origin,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})
 });
 try{
  const health=await (await worker.fetch(make("GET","/health"),{})).json();
  assert.equal(health.ready,false,"No secret means no cloud backup");
  const unavailable=await worker.fetch(make("POST","/profiles"),{});
  assert.equal(unavailable.status,503,"Do not fake success if not configured");
  const options=await worker.fetch(make("OPTIONS","/profiles"),{});
  assert.equal(options.status,200,"CORS OPTIONS must have a valid status");
  const blocked=await worker.fetch(new Request("https://forma-github-sync.threadid.workers.dev/profiles",{headers:{"Origin":"https://malicious.example"}}),{});
  assert.equal(blocked.status,403,"Unexpected origin should be rejected (not strong authentication)");
  const p={id:"daniel",name:"Daniel",createdAt:"2026-11-08",updatedAt:"2026-11-08T21:00:00Z",
   data:{profile:{weight:94},foods:[{id:"f1",name:"Praženica"}],weights:[],workouts:[]}};
  const res=await worker.fetch(make("POST","/profiles",{version:1,profiles:[p]}),{GITHUB_TOKEN:"test_server_secret"});
  assert.equal(res.status,200);
  assert.equal((await res.json()).saved,true);
  assert.equal(writes,1);
  assert.equal(cloud.profiles[0].data.foods[0].name,"Praženica");
  const older={...p,updatedAt:"2026-11-01T00:00:00Z",data:{...p.data,foods:[]}};
  const olderResponse=await worker.fetch(make("POST","/profiles",{version:1,profiles:[older]}),{GITHUB_TOKEN:"test_server_secret"});
  assert.equal(olderResponse.status,200);
  assert.equal(writes,1,"Outdated client may not erase new diary data");
  const mom={id:"mom",name:"Mama",updatedAt:"2026-11-08T21:05:00Z",
   data:{profile:{weight:65},foods:[],weights:[],workouts:[]}};
  const momResponse=await worker.fetch(make("POST","/profiles",{version:1,profiles:[mom]}),{GITHUB_TOKEN:"test_server_secret"});
  assert.equal(momResponse.status,200);
  assert.equal(cloud.profiles.length,2,"Merge preserves Daniel and Mom");
  const loaded=await (await worker.fetch(make("GET","/profiles"),{GITHUB_TOKEN:"test_server_secret"})).json();
  assert.equal(loaded.profiles.length,2);
  assert.equal(loaded.profiles.find(x=>x.id==="daniel").data.foods.length,1);
  console.log("PASS: Worker REST endpoint, secret guard, optimistic GitHub writes, profile merge");
 }finally{global.fetch=realFetch}
})().catch(e=>{console.error(e);process.exit(1)});
