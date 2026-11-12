import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-apex-device-id","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const OWNER="apex.1.shopping@gmail.com";
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return json({error:"يلزم تسجيل دخول المدير"},401);
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}}),{data:ud,error:ue}=await auth.auth.getUser(token);
  
  const jwtPayload=(()=>{try{return JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));}catch{return null;}})();
  if(jwtPayload?.aal!=="aal2")return json({error:"يلزم تأكيد رمز Google Authenticator قبل استخدام صلاحيات المدير"},403);
if(ue||!ud.user||(ud.user.email||"").toLowerCase()!==OWNER)return json({error:"غير مصرح"},403);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),{data:adm,error:ae}=await db.from("apex_admins").select("user_id").eq("user_id",ud.user.id).maybeSingle();
  if(ae||!adm)return json({error:"حساب المدير غير معتمد"},403);

  const deviceId=req.headers.get("x-apex-device-id")||"";
  if(!/^[0-9a-f-]{36}$/i.test(deviceId))return json({error:"هذا الجهاز غير معتمد. استخدم رمز QR من جهاز مدير موثوق."},403);
  const {data:trustedDevice,error:deviceError}=await db.from("apex_admin_trusted_devices").select("device_id").eq("user_id",ud.user.id).eq("device_id",deviceId).maybeSingle();
  if(deviceError)throw deviceError;
  if(!trustedDevice)return json({error:"هذا الجهاز غير موجود ضمن أجهزة APEX الموثوقة."},403);
  const {error:touchError}=await db.from("apex_admin_trusted_devices").update({last_seen_at:new Date().toISOString()}).eq("user_id",ud.user.id).eq("device_id",deviceId);
  if(touchError)throw touchError;
  const {data:emailSettings,error:settingsError}=await db.from("apex_email_settings").select("marketing_campaigns_enabled").eq("id",1).maybeSingle();
  if(settingsError)throw settingsError;
  if(!emailSettings?.marketing_campaigns_enabled)return json({email_status:"disabled",note:"إرسال الحملات متوقف من إعدادات لوحة المدير."});
  const body=await req.json();if(body.action!=="send_campaign")return json({error:"عملية غير مدعومة"},400);
  const subject=String(body.subject||"").trim().slice(0,150),title=String(body.title||"").trim().slice(0,180),content=String(body.content||"").trim().slice(0,5000),image=String(body.image_url||""),link=String(body.link_url||"");
  if(!subject||!title||!content)return json({error:"أكمل بيانات الحملة"},400);
  if((image&&!/^https:\/\//i.test(image))||(link&&!/^https:\/\//i.test(link)))return json({error:"رابط غير آمن"},400);
  const key=Deno.env.get("RESEND_API_KEY");if(!key)return json({email_status:"not_configured"});
  const from=Deno.env.get("APEX_REPORT_FROM")||"APEX <onboarding@resend.dev>",recipients:string[]=[];
  for(let page=1;page<=20;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:500});if(error)throw error;for(const u of data.users||[])if(u.email&&u.email_confirmed_at&&u.user_metadata?.apex_marketing_opt_in===true)recipients.push(u.email);if(!data.users||data.users.length<500)break;}
  if(!recipients.length)return json({email_status:"no_recipients",sent:0,failed:0,total:0,note:"لا يوجد مشتركون وافقوا على استقبال العروض."});
  const html='<div dir="rtl" style="font-family:Tahoma,Arial;background:#080b09;color:#f8f2df;padding:24px"><div style="max-width:620px;margin:auto;background:#101612;border:1px solid #b78b35;border-radius:18px;padding:22px"><b style="color:#e9bd55">APEX 👑</b><h1 style="color:#f5d879">'+esc(title)+'</h1>'+(image?'<img src="'+esc(image)+'" alt="" style="width:100%;border-radius:12px">':'')+'<p style="white-space:pre-wrap;line-height:1.9">'+esc(content)+'</p>'+(link?'<p><a href="'+esc(link)+'" style="display:inline-block;background:#d8ad4f;color:#171006;padding:12px 22px;border-radius:8px;text-decoration:none">اكتشف العرض</a></p>':'')+'<hr><small>وصلتك الرسالة لأنك وافقت على استقبال عروض APEX. لإيقاف الرسائل، أرسل طلب إلغاء الاشتراك إلى apex.1.shopping@gmail.com.</small></div></div>';
  let sent=0,failed=0;for(let i=0;i<recipients.length;i++){const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipients[i]],subject,html})});if(response.ok)sent++;else failed++;if(i%10===9)await new Promise(r=>setTimeout(r,250));}
  return json({email_status:failed===0?"sent":sent===0?"failed":"partial",sent,failed,total:recipients.length});
 }catch(e){return json({error:e instanceof Error?e.message:"تعذر إرسال الحملة"},400)}
});