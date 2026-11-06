import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-apex-cron-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const ADMIN_EMAIL="apex.1.shopping@gmail.com";
const publicEvents=new Set(["login_success","login_failed","signup_attempt","duplicate_account","suspicious_activity","access_denied","rate_limited"]);
const severity:Record<string,string>={login_success:"info",signup_attempt:"info",login_failed:"warning",duplicate_account:"high",suspicious_activity:"high",access_denied:"warning",rate_limited:"high"};
const hash=async(v:string)=>{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");};
async function sendMail(subject:string,textBody:string){
 const key=Deno.env.get("RESEND_API_KEY");if(!key)return "not_configured";
 const from=Deno.env.get("APEX_REPORT_FROM")||"APEX AI Guard <onboarding@resend.dev>";
 const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[ADMIN_EMAIL],subject,text:textBody})});
 return res.ok?"sent":"failed";
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!service||!anon)return json({error:"Security service is not configured"},503);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const body=await req.json(),action=String(body.action||"event"),authHeader=req.headers.get("Authorization")||"",token=authHeader.replace(/^Bearer\\s+/i,"");
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
  const ip=req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const ipHash=await hash(ip+(Deno.env.get("APEX_SECURITY_HASH_SALT")||service.slice(0,24)));
  const {count,error:countError}=await db.from("apex_security_events").select("id",{count:"exact",head:true}).eq("ip_hash",ipHash).gte("created_at",new Date(Date.now()-60000).toISOString());
  if(countError)throw countError;
  if((count||0)>=20)return json({accepted:false,reason:"rate_limited"},429);
  const email=String(body.email||"").trim().toLowerCase().slice(0,254),raw=body.details&&typeof body.details==="object"?body.details:{},details:Record<string,unknown>={};
  for(const k of ["reason","screen","method","attempt","code"])if(raw[k]!==undefined)details[k]=String(raw[k]).slice(0,120);
  const level=severity[eventType]||"info";
  const {error:insertError}=await db.from("apex_security_events").insert({event_type:eventType,severity:level,user_id:actor?.id||null,email_hash:email?await hash(email):null,ip_hash:ipHash,user_agent:(req.headers.get("user-agent")||"").slice(0,300),source:String(body.source||"storefront").slice(0,40),details});
  if(insertError)throw insertError;
  let alert_status="not_required";
  if(["high","critical"].includes(level))alert_status=await sendMail("تنبيه أمني عاجل — APEX AI GUARD","تم رصد حدث أمني: "+eventType+"\nدرجة الخطورة: "+level+"\nالوقت: "+new Date().toISOString()+"\nيرجى مراجعة لوحة الحماية في متجر APEX.");
  return json({accepted:true,alert_status});
 }catch(e){return json({error:e instanceof Error?e.message:"تعذر تنفيذ عملية الحماية"},400);}
});