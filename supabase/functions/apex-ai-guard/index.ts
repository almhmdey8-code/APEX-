import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-apex-cron-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const ADMIN_EMAIL="apex.1.shopping@gmail.com";
const publicEvents=new Set(["login_success","login_failed","signup_attempt","duplicate_account","suspicious_activity","access_denied","rate_limited","admin_login_attempt"]);
const severity:Record<string,string>={login_success:"info",signup_attempt:"info",login_failed:"warning",duplicate_account:"high",suspicious_activity:"high",access_denied:"warning",rate_limited:"high",admin_login_attempt:"high"};
const hash=async(v:string)=>{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");};
async function sendMail(subject:string,textBody:string){
 const key=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("APEX_REPORT_FROM");
 if(!key||!from)return "not_configured";
 const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[ADMIN_EMAIL],subject,text:textBody})});
 if(!res.ok){console.error("APEX security email failed",res.status,await res.text().catch(()=>""));return "failed";}
 return "sent";
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!service||!anon)return json({error:"Security service is not configured"},503);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(),action=String(body.action||"event"),authHeader=req.headers.get("Authorization")||"",token=authHeader.replace(/^Bearer\s+/i,"");
  let actor:any=null;
  if(token){const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});const {data}=await auth.auth.getUser(token);actor=data.user||null;}
  if(action==="send_report"||action==="scheduled_report"){
   const scheduled=action==="scheduled_report";
   if(scheduled){
    const provided=req.headers.get("x-apex-cron-secret")||"";
    if(!provided)return json({error:"غير مصرح"},403);
    const {data:cronAuth,error:cronAuthError}=await db.from("apex_email_cron_auth").select("secret_sha256").eq("id",1).maybeSingle();
    if(cronAuthError||!cronAuth||await hash(provided)!==cronAuth.secret_sha256)return json({error:"غير مصرح"},403);
    const {data:emailSettings,error:settingsError}=await db.from("apex_email_settings").select("daily_security_report_enabled,report_hours").eq("id",1).maybeSingle();
    if(settingsError)throw settingsError;
    if(!emailSettings?.daily_security_report_enabled)return json({email_status:"disabled",note:"التقارير اليومية متوقفة من لوحة المدير."});
    body.hours=emailSettings.report_hours||24;
   }else{
    if(!actor||(actor.email||"").toLowerCase()!==ADMIN_EMAIL)return json({error:"غير مصرح"},403);
    const {data:adminRow,error:adminError}=await db.from("apex_admins").select("user_id").eq("user_id",actor.id).maybeSingle();
    if(adminError||!adminRow)return json({error:"غير مصرح"},403);
   }
   const hours=Math.min(168,Math.max(1,Number(body.hours)||24)),since=new Date(Date.now()-hours*3600000).toISOString();
   const {data:events,error}=await db.from("apex_security_events").select("event_type,severity,source,created_at,details").gte("created_at",since).order("created_at",{ascending:false}).limit(500);
   if(error)throw error;
   const counts:Record<string,number>={};for(const e of events||[])counts[e.event_type]=(counts[e.event_type]||0)+1;
   const summary=Object.entries(counts).map(([k,v])=>k+": "+v).join("\n")||"لا توجد أحداث مسجلة";
   const bodyText="التقرير الأمني لمتجر APEX\nالفترة: آخر "+hours+" ساعة\nإجمالي الأحداث: "+(events?.length||0)+"\n\n"+summary+"\n\nوقت التقرير: "+new Date().toISOString();
   const email_status=await sendMail("APEX AI GUARD — التقرير الأمني",bodyText);
   return json({total_events:events?.length||0,counts,email_status});
  }
  const eventType=String(body.event_type||"");
  if(!publicEvents.has(eventType))return json({error:"نوع الحدث غير مسموح من العميل"},400);
  // Admin authentication events are never accepted anonymously. The password
  // rejection path has no authenticated session and is intentionally not logged
  // from the browser; this prevents arbitrary visitors forging manager alerts.
  if(eventType==="admin_login_attempt"){
   if(!actor||(actor.email||"").toLowerCase()!==ADMIN_EMAIL)return json({error:"يلزم إثبات هوية المدير لتسجيل هذا الحدث"},401);
   const {data:adminRow,error:adminError}=await db.from("apex_admins").select("user_id").eq("user_id",actor.id).maybeSingle();
   if(adminError||!adminRow)return json({error:"حساب المدير غير معتمد"},403);
  }
  const ip=req.headers.get("cf-connecting-ip")||req.headers.get("x-real-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const maskIp=(value:string)=>{
   if(value.includes(".")){const parts=value.split(".");return parts.length===4?parts[0]+"."+parts[1]+"."+parts[2]+".x":"غير متاح";}
   if(value.includes(":"))return value.split(":").slice(0,3).join(":")+":…";
   return "غير متاح";
  };
  const ipMasked=maskIp(ip);
  const ipHash=await hash(ip+(Deno.env.get("APEX_SECURITY_HASH_SALT")||service.slice(0,24)));
  const {count,error:countError}=await db.from("apex_security_events").select("id",{count:"exact",head:true}).eq("ip_hash",ipHash).gte("created_at",new Date(Date.now()-60000).toISOString());
  if(countError)throw countError;
  if((count||0)>=20)return json({accepted:false,reason:"rate_limited"},429);
  if(eventType==="admin_login_attempt"){const {count:adminAttemptCount,error:adminAttemptError}=await db.from("apex_security_events").select("id",{count:"exact",head:true}).eq("ip_hash",ipHash).eq("event_type","admin_login_attempt").gte("created_at",new Date(Date.now()-5*60000).toISOString());if(adminAttemptError)throw adminAttemptError;if((adminAttemptCount||0)>=3)return json({accepted:false,reason:"admin_attempt_throttled"},429);}
  const email=String(body.email||"").trim().toLowerCase().slice(0,254),raw=body.details&&typeof body.details==="object"?body.details:{},details:Record<string,unknown>={};
  for(const k of ["reason","screen","method","attempt","outcome","code"])if(raw[k]!==undefined)details[k]=String(raw[k]).slice(0,120);
  if(email)details.account_masked=email.replace(/^(.{1,2})[^@]*(@.*)$/,"$1***$2");
  const userAgent=(req.headers.get("user-agent")||"").slice(0,300),ua=userAgent;
  const device={device:/iPad|Tablet/i.test(ua)?"جهاز لوحي":/Mobi|Android|iPhone/i.test(ua)?"هاتف":ua?"كمبيوتر":"غير معروف",os:/Android/i.test(ua)?"Android":/iPhone|iPad|iPod/i.test(ua)?"iOS":/Windows/i.test(ua)?"Windows":/Mac OS X|Macintosh/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"غير معروف",browser:/Edg\//i.test(ua)?"Microsoft Edge":/OPR\//i.test(ua)?"Opera":/SamsungBrowser/i.test(ua)?"Samsung Internet":/Firefox\//i.test(ua)?"Firefox":/Chrome\//i.test(ua)?"Google Chrome":/Safari\//i.test(ua)?"Safari":"غير معروف"};
  details.device=device;
  details.ip_masked=ipMasked;
  let location:Record<string,unknown>={};
  const countryHeader=req.headers.get("cf-ipcountry");
  try{
   if(ip!=="unknown"&&!/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\\./.test(ip)){
    const geoResponse=await fetch("https://ipwho.is/"+encodeURIComponent(ip),{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(2500)});
    if(geoResponse.ok){const geo=await geoResponse.json();if(geo?.success){location={city:geo.city||null,region:geo.region||null,country:geo.country||null,latitude:typeof geo.latitude==="number"?geo.latitude:null,longitude:typeof geo.longitude==="number"?geo.longitude:null,timezone:geo.timezone?.id||null,isp:geo.connection?.isp||geo.connection?.org||null};}}
   }
  }catch(geoError){console.warn("APEX IP geolocation unavailable:",geoError instanceof Error?geoError.message:"lookup failed")}
  if(!location.country&&countryHeader&&countryHeader!=="XX")location.country=countryHeader;
  details.location=location;
  const outcome=String(details.outcome||"");
  const level=eventType==="admin_login_attempt"&&outcome==="mfa_rejected"?"high":eventType==="admin_login_attempt"?"info":(severity[eventType]||"info");
  const {error:insertError}=await db.from("apex_security_events").insert({event_type:eventType,severity:level,user_id:actor?.id||null,email_hash:email?await hash(email):null,ip_hash:ipHash,user_agent:userAgent,source:String(body.source||"storefront").slice(0,40),details});
  if(insertError)throw insertError;
  // Only a verified manager session reporting an actual MFA rejection can
  // trigger email. Anonymous/public telemetry is never allowed to send mail.
  let alert_status="not_required";
  if(eventType==="admin_login_attempt"&&outcome==="mfa_rejected"&&actor?.id){
   alert_status=await sendMail("تنبيه أمني مهم — محاولة تحقق مرفوضة في APEX",
    "رصد نظام APEX محاولة تحقق ثنائي مرفوضة لحساب المدير.\\n"+
    "الحساب: "+(details.account_masked||ADMIN_EMAIL)+"\\n"+
    "عنوان الشبكة (مخفي جزئياً): "+ipMasked+"\\n"+
    "الجهاز: "+device.device+" / "+device.os+" / "+device.browser+"\\n"+
    "الموقع التقريبي: "+[location.city,location.region,location.country].filter(Boolean).join("، ")+"\\n"+
    "مزود الشبكة: "+(location.isp||"غير متاح")+"\\n"+
    "الوقت: "+new Date().toISOString()+"\\n"+
    "راجع سجل الحماية في لوحة مدير APEX. الموقع تقريبي حسب IP وليس GPS.");
  }
  return json({accepted:true,alert_status,device,location});
 }catch(e){return json({error:e instanceof Error?e.message:"تعذر تنفيذ عملية الحماية"},400);}
});