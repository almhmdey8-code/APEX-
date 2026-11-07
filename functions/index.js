import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { randomInt } from "node:crypto";

initializeApp();
const db = getFirestore();
const REGION = "us-central1";
const OWNER_EMAIL = "apex.1.shopping@gmail.com";
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const SECURITY_HASH_SALT = defineSecret("APEX_SECURITY_HASH_SALT");
const statusAr = { new:"تم استلام الطلب", confirmed:"تم تأكيد الطلب", processing:"قيد التجهيز", shipped:"تم تسليم الطلب لشركة الشحن", delivered:"تم التسليم", cancelled:"ملغي" };
const fail = (code, message) => { throw new HttpsError(code, message); };
const clean = (v, max=500) => String(v ?? "").trim().slice(0,max);
const money = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const requireUser = (request) => { if (!request.auth?.uid) fail("unauthenticated","يجب تسجيل الدخول أولاً."); return request.auth; };
async function requireAdmin(request) {
  const auth = requireUser(request);
  const snap = await db.doc("admins/"+auth.uid).get();
  if (!snap.exists || snap.get("active") !== true) fail("permission-denied","هذه العملية للمدير المعتمد فقط.");
  if (String(auth.token.email || "").toLowerCase() !== OWNER_EMAIL && snap.get("role") !== "admin") fail("permission-denied","غير مصرح.");
  if (auth.token.admin !== true) {
    const userRecord=await getAuth().getUser(auth.uid);
    await getAuth().setCustomUserClaims(auth.uid,{...(userRecord.customClaims||{}),admin:true});
  }
  return auth;
}
function validItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) fail("invalid-argument","السلة غير صالحة.");
  const grouped = new Map();
  for (const item of raw) {
    const id = clean(item?.id ?? item?.product_id,80);
    const quantity = Number(item?.quantity);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) fail("invalid-argument","قائمة المنتجات غير صالحة؛ الحد الأقصى 20 قطعة لكل منتج.");
    grouped.set(id,(grouped.get(id)||0)+quantity);
  }
  for (const q of grouped.values()) if (q > 20) fail("invalid-argument","الحد الأقصى لكل منتج هو 20 قطعة.");
  return [...grouped].map(([id,quantity])=>({id,quantity}));
}
async function makeOrder(request, walletMode) {
  const auth=requireUser(request), b=request.data||{};
  const name=clean(b.customer_name,160), phone=clean(b.phone,40), address=clean(b.address,1000), notes=clean(b.notes,1000), shipping=clean(b.shipping_method||"توصيل إلى المنزل",100);
  const requestId=clean(b.request_id,64), items=validItems(b.items);
  if (!name || !phone || !/^[0-9a-f-]{36}$/i.test(requestId)) fail("invalid-argument","بيانات الطلب غير مكتملة.");
  const paymentId=walletMode ? "wallet" : clean(b.payment_method_id,80);
  if (!walletMode && !/^\d+$/.test(paymentId)) fail("invalid-argument","وسيلة الدفع غير صالحة.");
  const idemRef=db.doc("checkoutRequests/"+auth.uid+"_"+requestId);
  const orderRef=db.collection("orders").doc();
  const now=FieldValue.serverTimestamp();
  const productRefs=items.map(x=>db.doc("products/"+x.id));
  const paymentRef=walletMode?null:db.doc("paymentMethods/"+paymentId);
  const walletRef=db.doc("wallets/"+auth.uid);
  let resultOrderId=null;
  await db.runTransaction(async tx=>{
    const idem=await tx.get(idemRef);
    if(idem.exists){resultOrderId=idem.get("orderId");return;}
    const productSnaps=await tx.getAll(...productRefs);
    const methodSnap=paymentRef?await tx.get(paymentRef):null;
    const walletSnap=walletMode?await tx.get(walletRef):null;
    const lines=[]; let total=0;
    for(let i=0;i<items.length;i++){
      const snap=productSnaps[i], item=items[i];
      if(!snap.exists || snap.get("active")!==true) fail("failed-precondition","أحد المنتجات غير متاح حالياً.");
      const price=Number(snap.get("price"));
      if(!Number.isFinite(price)||price<=0) fail("failed-precondition","يوجد منتج بسعر غير صالح.");
      const line=money(price*item.quantity); total=money(total+line);
      lines.push({id:Number(item.id),name:clean(snap.get("name"),180),quantity:item.quantity,unit_price_sar:money(price),line_total_sar:line});
    }
    if(total<=0) fail("failed-precondition","قيمة الطلب غير صالحة.");
    if(!walletMode && (!methodSnap?.exists || methodSnap.get("enabled")!==true || methodSnap.get("ordersEnabled")!==true || methodSnap.get("methodType")!=="manual")) fail("failed-precondition","وسيلة الدفع غير متاحة للطلبات.");
    if(walletMode && Number(walletSnap?.get("balanceSar")||0)<total) fail("failed-precondition","رصيد محفظة APEX غير كافٍ.");
    const orderId=orderRef.id;
    const order={
      userId:auth.uid,customerName:name,phone,address,items:lines,notes:(notes+"\nطريقة الشحن: "+shipping).slice(0,1400),
      status:"new",totalSar:total,paymentMethod:walletMode?"wallet":clean(methodSnap.get("name"),100),
      paymentStatus:walletMode?"paid":"pending",shippingStatus:"order_received",customerCurrency:"SAR",
      checkoutRequestId:requestId,createdAt:now,updatedAt:now
    };
    tx.create(orderRef,order);
    tx.create(idemRef,{orderId,uid:auth.uid,createdAt:now});
    const historyRef=db.collection("orderStatusHistory").doc();
    tx.create(historyRef,{orderId,userId:auth.uid,status:"new",note:walletMode?"تم استلام الطلب والدفع من محفظة APEX":"تم استلام الطلب وبانتظار تأكيد الدفع ومراجعة الإدارة",changedBy:auth.uid,createdAt:now});
    if(walletMode){
      tx.set(walletRef,{userId:auth.uid,balanceSar:money(Number(walletSnap.get("balanceSar"))-total),updatedAt:now},{merge:true});
      const ledger=db.collection("walletTransactions").doc();
      tx.create(ledger,{userId:auth.uid,amountSar:total,transactionType:"purchase",description:"شراء الطلب رقم #"+orderId,referenceType:"order",referenceId:orderId,createdAt:now});
    }
    resultOrderId=orderId;
  });
  return {success:true,order_id:resultOrderId};
}
export const apexCreateOrder=onCall({region:REGION},request=>makeOrder(request,false));
export const apexWalletCheckout=onCall({region:REGION},request=>makeOrder(request,true));

export const apexAdminCustomers=onCall({region:REGION},async request=>{
  await requireAdmin(request);
  const [orders]=await Promise.all([db.collection("orders").limit(5000).get()]);
  const users=[];let pageToken;
  do{const page=await getAuth().listUsers(1000,pageToken);users.push(...page.users);pageToken=page.pageToken;}while(pageToken&&users.length<20000);
  const stats=new Map();
  for(const doc of orders.docs){const o=doc.data(),uid=o.userId;if(!uid)continue;const s=stats.get(uid)||{accepted:0,rejected:0,pending:0,total:0,orderName:"",orderPhone:""};s.total++;if(["confirmed","processing","shipped","delivered"].includes(o.status))s.accepted++;else if(o.status==="cancelled")s.rejected++;else s.pending++;s.orderName ||= o.customerName||"";s.orderPhone ||= o.phone||"";stats.set(uid,s);}
  const customers=users.map(u=>{const s=stats.get(u.uid)||{accepted:0,rejected:0,pending:0,total:0,orderName:"",orderPhone:""};const p=u.customClaims||{};return {id:u.uid,name:clean(u.displayName||s.orderName||"عميل APEX",120),email:u.email||"",phone:clean(s.orderPhone,40),accepted_orders:s.accepted,rejected_orders:s.rejected,pending_orders:s.pending,total_orders:s.total,admin:p.admin===true};}).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
  return {customers};
});

export const apexAiGuard=onCall({region:REGION,secrets:[RESEND_API_KEY,SECURITY_HASH_SALT]},async request=>{
  const b=request.data||{},eventType=clean(b.event_type||"event",60);
  const allowed=new Set(["login_success","login_failed","signup_attempt","duplicate_account","suspicious_activity","access_denied","rate_limited"]);
  if(b.action==="send_report"){
    await requireAdmin(request);
    const hours=Math.max(1,Math.min(168,Number(b.hours)||24)),since=Date.now()-hours*3600000;
    const snap=await db.collection("securityEvents").where("createdAtMs",">=",since).orderBy("createdAtMs","desc").limit(500).get();
    const counts={};for(const d of snap.docs){const t=d.get("eventType");counts[t]=(counts[t]||0)+1;}
    const status=await sendAdminMail("APEX AI GUARD — التقرير الأمني", "إجمالي الأحداث: "+snap.size+"\n"+Object.entries(counts).map(([k,v])=>k+": "+v).join("\n"));
    return {total_events:snap.size,counts,email_status:status};
  }
  if(!allowed.has(eventType)) fail("invalid-argument","نوع الحدث غير مسموح.");
  const rawIp=request.rawRequest?.ip||"unknown";
  const salt=SECURITY_HASH_SALT.value()||"apex-security-v1";
  const ipHash=await sha256(rawIp+salt);
  const recent=await db.collection("securityEvents").where("ipHash","==",ipHash).where("createdAtMs",">=",Date.now()-60000).limit(20).get();
  if(recent.size>=20) fail("resource-exhausted","محاولات كثيرة؛ حاول لاحقاً.");
  const severity={login_success:"info",signup_attempt:"info",login_failed:"warning",duplicate_account:"high",suspicious_activity:"high",access_denied:"warning",rate_limited:"high"}[eventType];
  const email=clean(b.email,254).toLowerCase();
  await db.collection("securityEvents").add({eventType,severity,uid:request.auth?.uid||null,emailHash:email?await sha256(email):null,ipHash,userAgent:clean(request.rawRequest?.get("user-agent"),300),source:clean(b.source||"storefront",40),details:safeDetails(b.details),createdAt:FieldValue.serverTimestamp(),createdAtMs:Date.now()});
  let alert_status="not_required";
  if(["high","critical"].includes(severity)) alert_status=await sendAdminMail("تنبيه أمني عاجل — APEX AI GUARD","تم رصد حدث أمني: "+eventType+"\nدرجة الخطورة: "+severity);
  return {accepted:true,alert_status};
});

export const apexEmailCampaign=onCall({region:REGION,timeoutSeconds:540,memory:"512MiB",secrets:[RESEND_API_KEY]},async request=>{
  const auth=await requireAdmin(request);
  if(String(auth.token.email||"").toLowerCase()!==OWNER_EMAIL) fail("permission-denied","غير مصرح.");
  const settings=await db.doc("emailSettings/main").get();
  if(!settings.exists || settings.get("marketingCampaignsEnabled")!==true) return {email_status:"disabled"};
  const b=request.data||{};
  if(b.action!=="send_campaign") fail("invalid-argument","عملية غير مدعومة.");
  const subject=clean(b.subject,150),title=clean(b.title,180),content=clean(b.content,5000),image=clean(b.image_url,2000),link=clean(b.link_url,2000);
  if(!subject||!title||!content) fail("invalid-argument","أكمل بيانات الحملة.");
  if((image&&!/^https:\/\//i.test(image))||(link&&!/^https:\/\//i.test(link))) fail("invalid-argument","رابط غير آمن.");
  const key=RESEND_API_KEY.value();if(!key)return {email_status:"not_configured"};
  const recipients=[];let token;
  do{const page=await getAuth().listUsers(1000,token);for(const u of page.users){const c=await db.doc("customers/"+u.uid).get();if(u.email&&u.emailVerified&&c.get("marketingOptIn")===true)recipients.push(u.email);}token=page.pageToken;}while(token&&recipients.length<10000);
  let sent=0,failed=0;
  const html='<div dir="rtl" style="font-family:Tahoma,Arial;background:#080b09;color:#f8f2df;padding:24px"><div style="max-width:620px;margin:auto;background:#101612;border:1px solid #b78b35;border-radius:18px;padding:22px"><b style="color:#e9bd55">APEX 👑</b><h1 style="color:#f5d879">'+esc(title)+'</h1>'+(image?'<img src="'+esc(image)+'" alt="" style="width:100%;border-radius:12px">':'')+'<p style="white-space:pre-wrap;line-height:1.9">'+esc(content)+'</p>'+(link?'<p><a href="'+esc(link)+'">اكتشف العرض</a></p>':'')+'<hr><small>وصلتك الرسالة لأنك وافقت على استقبال عروض APEX.</small></div></div>';
  for(let i=0;i<recipients.length;i+=5){const results=await Promise.all(recipients.slice(i,i+5).map(to=>fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"APEX <onboarding@resend.dev>",to:[to],subject,html})})));for(const res of results)if(res.ok)sent++;else failed++;}
  return {email_status:"sent",sent,failed,total:recipients.length};
});

export const apexStoreAssistant=onCall({region:REGION,secrets:[OPENAI_API_KEY]},async request=>{
  const auth=requireUser(request),b=request.data||{},messages=b.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>12) fail("invalid-argument","الرسائل غير صالحة.");
  const cleanMessages=messages.map(m=>{if(!m||!["user","assistant"].includes(m.role)||typeof m.content!=="string"||m.content.length<1||m.content.length>1500)fail("invalid-argument","إحدى الرسائل غير صالحة.");return {role:m.role,content:m.content};});
  if(cleanMessages.at(-1).role!=="user")fail("invalid-argument","آخر رسالة يجب أن تكون من العميل.");
  const [products,payments,settings]=await Promise.all([
    db.collection("products").where("active","==",true).limit(40).get(),
    db.collection("paymentMethods").where("enabled","==",true).where("ordersEnabled","==",true).limit(30).get(),
    db.doc("storeSettings/currency").get()
  ]);
  const country=String((await db.doc("customers/"+auth.uid).get()).get("country")||"SA");
  const catalog=products.docs.map(d=>{const p=d.data();return {name:p.name,category:p.category,description:clean(p.description,240),price_sar:p.price,stock:p.stock,availability:Number(p.stock||0)>0?"متوفر":"غير متوفر"};});
  const methods=payments.docs.map(d=>{const p=d.data();return {name:p.name,instructions:p.instructions,type:p.methodType,country:p.countryCode};}).filter(p=>!p.country||p.country==="ALL"||p.country===country);
  let orderContext=null;
  // Search the full recent user history: customers often mention the order number
  // once, then ask follow-up questions without repeating it.
  let requestedOrderId=null;
  for(const message of [...cleanMessages].reverse()){
    if(message.role!=="user")continue;
    const match=message.content.match(/(?:رقم\s*(?:الطلب|طلب)|طلب\s*رقم|الطلب\s*(?:رقمه|رقم)?|طلب\s*#)\s*[:：#-]?\s*(\d{1,15})/i);
    if(match?.[1]){requestedOrderId=match[1];break;}
  }
  if(requestedOrderId){
    let order=await db.doc("orders/"+requestedOrderId).get();
    if(!order.exists){const q=await db.collection("orders").where("userId","==",auth.uid).where("legacyId","==",Number(requestedOrderId)).limit(1).get();if(!q.empty)order=q.docs[0];}
    if(order.exists&&order.get("userId")===auth.uid){
      const o=order.data();
      const history=await db.collection("orderStatusHistory").where("orderId","==",order.id).orderBy("createdAt","desc").limit(12).get();
      orderContext={id:order.id,created_at:o.createdAt?.toDate?.()?.toISOString?.()||null,updated_at:o.updatedAt?.toDate?.()?.toISOString?.()||null,status:o.status,status_ar:statusAr[o.status]||o.status,total_sar:o.totalSar,payment_method:o.paymentMethod,payment_status:o.paymentStatus,shipping_status:o.shippingStatus,carrier:o.carrier||null,tracking_number:o.trackingNumber||o.aramexTrackingNumber||null,items:o.items,status_history:history.docs.map(d=>({status:statusAr[d.get("status")]||d.get("status"),note:d.get("note")||"",at:d.get("createdAt")?.toDate?.()?.toISOString?.()||null}))};
    }else orderContext={requested_order_id:requestedOrderId,found:false};
  }
  const apiKey=OPENAI_API_KEY.value();if(!apiKey)fail("unavailable","مساعد APEX غير مهيأ بعد.");
  const system="أنت مساعد خدمة العملاء الرسمي لمتجر APEX فقط. أجب بالعربية الواضحة. النطاق: منتجات APEX وأسعارها ومخزونها والحساب والسلة والشراء والدفع والشحن ومتابعة طلبات العميل. استخدم بيانات المتجر والطلب المرفقة فقط ولا تخترع سعراً أو مخزوناً أو سياسة أو حالة طلب. لا تكشف أي طلب لا يخص المستخدم الحالي، ولا تطلب كلمة مرور أو رمز تحقق أو بيانات بطاقة. إذا كان السؤال خارج نطاق المتجر فاعتذر باختصار. إذا لم تتوفر المعلومة فقل ذلك ووجّه للبريد apex.1.shopping@gmail.com. أضف [[APEX_HANDOFF]] عند طلب موظف.";
  const payload=[{role:"developer",content:system+"\nبيانات المتجر: "+JSON.stringify({country,products:catalog,payment_methods:methods,currency:settings.exists?settings.data():null,order:orderContext})},...cleanMessages.slice(-8)];
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+apiKey,"Content-Type":"application/json"},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:"gpt-6.1-sol",input:payload,max_output_tokens:500})});
  const data=await response.json().catch(()=>({}));if(!response.ok){logger.error("APEX assistant provider error",response.status,data?.error?.code);fail("unavailable","تعذر تشغيل المساعد حالياً.");}
  let reply=data.output_text||data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n")||"";
  if(!reply.trim())fail("unavailable","لم يصل رد من المساعد.");
  const handoff=reply.includes("[[APEX_HANDOFF]]");reply=reply.replace(/\s*\[\[APEX_HANDOFF\]\]\s*/g,"").trim();
  return {reply,handoff};
});

async function sendAdminMail(subject,textBody){
  const key=RESEND_API_KEY.value();if(!key)return "not_configured";
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"APEX Security <onboarding@resend.dev>",to:[OWNER_EMAIL],subject,text:textBody})});
  return response.ok?"sent":"failed";
}
async function sha256(value){const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function safeDetails(raw){const out={};if(raw&&typeof raw==="object")for(const key of ["reason","screen","method","attempt","code"])if(raw[key]!==undefined)out[key]=clean(raw[key],120);return out;}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}


export const apexRequestSignupOtp=onCall({region:REGION,secrets:[RESEND_API_KEY,SECURITY_HASH_SALT]},async request=>{
  const email=clean(request.data?.email,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("invalid-argument","أدخل بريداً إلكترونياً صحيحاً.");
  const key=RESEND_API_KEY.value();if(!key) fail("unavailable","خدمة إرسال رمز التحقق غير مهيأة حالياً.");
  try{await getAuth().getUserByEmail(email);fail("already-exists","هذا البريد مسجل مسبقاً. انتقل إلى تسجيل الدخول.");}
  catch(error){if(error instanceof HttpsError)throw error;if(error.code!=="auth/user-not-found")throw error;}
  const emailHash=await sha256(email),ref=db.doc("signupOtpChallenges/"+emailHash),now=Date.now();
  const prior=await ref.get();
  if(prior.exists && now-Number(prior.get("lastSentAtMs")||0)<60000) fail("resource-exhausted","انتظر دقيقة قبل طلب رمز جديد.");
  const code=String(randomInt(0,1000000)).padStart(6,"0");
  const salt=SECURITY_HASH_SALT.value()||"apex-signup-otp-v1";
  await ref.set({emailHash,codeHash:await sha256(code+salt),createdAtMs:now,lastSentAtMs:now,expiresAtMs:now+10*60*1000,attempts:0,verified:false});
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"APEX <onboarding@resend.dev>",to:[email],subject:"رمز التحقق لإنشاء حساب APEX",text:"رمز التحقق الخاص بك: "+code+"\\nصلاحية الرمز 10 دقائق. لا تشارك الرمز مع أي شخص."})});
  if(!response.ok){await ref.delete();logger.error("APEX signup OTP delivery failed",response.status);fail("unavailable","تعذر إرسال رمز التحقق. حاول لاحقاً.");}
  return {sent:true,expires_in_seconds:600};
});

export const apexCompleteSignup=onCall({region:REGION,secrets:[SECURITY_HASH_SALT]},async request=>{
  const b=request.data||{},email=clean(b.email,254).toLowerCase(),code=clean(b.code,6),password=String(b.password||"");
  const fullName=clean(b.full_name,120),phone=clean(b.phone,30),country=b.country==="YE"?"YE":"SA",address=clean(b.address,500);
  const latitude=Number.isFinite(b.latitude)?b.latitude:null,longitude=Number.isFinite(b.longitude)?b.longitude:null;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d{6}$/.test(code)||password.length<6||!fullName||!phone||!address) fail("invalid-argument","بيانات إنشاء الحساب غير مكتملة.");
  if(latitude===null||longitude===null||Math.abs(latitude)>90||Math.abs(longitude)>180) fail("invalid-argument","حدد موقع التوصيل قبل إكمال التسجيل.");
  const emailHash=await sha256(email),ref=db.doc("signupOtpChallenges/"+emailHash),salt=SECURITY_HASH_SALT.value()||"apex-signup-otp-v1";
  let otpValid=false;
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists||snap.get("consumed")===true||Number(snap.get("expiresAtMs")||0)<Date.now()) fail("deadline-exceeded","رمز التحقق منتهي أو غير موجود. اطلب رمزاً جديداً.");
    if(Number(snap.get("attempts")||0)>=5) fail("resource-exhausted","تجاوزت عدد محاولات التحقق. اطلب رمزاً جديداً.");
    if(snap.get("verified")!==true||await sha256(code+salt)!==snap.get("codeHash")){tx.update(ref,{attempts:FieldValue.increment(1)});return;}
    tx.update(ref,{consumed:true,usedAtMs:Date.now()});
    otpValid=true;
  });
  if(!otpValid) fail("permission-denied","رمز التحقق غير صحيح.");
  let user;
  try{
    user=await getAuth().createUser({email,password,displayName:fullName,emailVerified:true,disabled:false});
    await db.doc("customers/"+user.uid).set({uid:user.uid,fullName,phone,country,address,latitude,longitude,marketingOptIn:b.marketing_opt_in===true,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    const customToken=await getAuth().createCustomToken(user.uid);
    await ref.delete();
    return {customToken,user:{uid:user.uid,email:user.email,displayName:user.displayName,emailVerified:true}};
  }catch(error){
    if(user?.uid){try{await getAuth().deleteUser(user.uid);}catch(cleanupError){logger.error("Failed to roll back incomplete APEX signup",cleanupError);}}
    throw error;
  }
});


export const apexRequestWalletTopup=onCall({region:REGION},async request=>{
  const auth=requireUser(request),b=request.data||{},amount=money(Number(b.p_amount_sar??b.amount_sar)),methodId=clean(b.p_payment_method_id??b.payment_method_id,80);
  if(!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(Number(methodId))||Number(methodId)<=0) fail("invalid-argument","أدخل مبلغاً ووسيلة دفع صحيحة.");
  const method=await db.doc("paymentMethods/"+methodId).get();
  if(!method.exists||method.get("enabled")!==true||method.get("walletTopupEnabled")!==true||method.get("methodType")!=="manual") fail("failed-precondition","وسيلة شحن المحفظة غير متاحة حالياً.");
  const ref=db.collection("walletTopups").doc();
  await ref.set({userId:auth.uid,amountSar:amount,paymentMethodId:methodId,paymentMethodName:clean(method.get("name"),100),paymentInstructions:clean(method.get("instructions"),1500),customerReference:clean(b.p_customer_reference??b.customer_reference,160),status:"pending",paymentMethodType:"manual",createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  return {success:true,topup_id:ref.id};
});

export const apexAdminReviewWalletTopup=onCall({region:REGION},async request=>{
  const admin=await requireAdmin(request),b=request.data||{},id=clean(b.p_topup_id??b.topup_id,100),decision=clean(b.p_decision??b.decision,20),note=clean(b.p_admin_note??b.admin_note,500);
  if(!id||!["approved","rejected"].includes(decision)) fail("invalid-argument","قرار مراجعة طلب الشحن غير صحيح.");
  const topupRef=db.doc("walletTopups/"+id);
  await db.runTransaction(async tx=>{
    const topup=await tx.get(topupRef);if(!topup.exists)fail("not-found","طلب الشحن غير موجود.");
    const t=topup.data();if(t.paymentMethodType==="gateway")fail("failed-precondition","لا يعتمد الشحن الإلكتروني يدوياً.");
    if(t.status!=="pending")fail("failed-precondition","تمت مراجعة طلب الشحن مسبقاً.");
    const walletRef=db.doc("wallets/"+t.userId),wallet=await tx.get(walletRef);
    if(decision==="approved"){
      const amount=money(Number(t.amountSar));if(!Number.isFinite(amount)||amount<=0)fail("failed-precondition","مبلغ الشحن غير صالح.");
      tx.set(walletRef,{userId:t.userId,balanceSar:money(Number(wallet.get("balanceSar")||0)+amount),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      const ledger=db.collection("walletTransactions").doc();tx.create(ledger,{userId:t.userId,amountSar:amount,transactionType:"top_up",description:"شحن المحفظة عبر "+clean(t.paymentMethodName,100),referenceType:"wallet_topup",referenceId:id,createdAt:FieldValue.serverTimestamp()});
    }
    tx.update(topupRef,{status:decision,adminNote:note||null,reviewedBy:admin.uid,reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  });
  return {success:true,status:decision};
});

export const apexAdminRefundOrderToWallet=onCall({region:REGION},async request=>{
  const admin=await requireAdmin(request),raw=clean(request.data?.p_order_id??request.data?.order_id,100);
  if(!raw)fail("invalid-argument","رقم الطلب غير صالح.");
  let orderRef=db.doc("orders/"+raw),orderSnap=await orderRef.get();
  if(!orderSnap.exists){const q=await db.collection("orders").where("legacyId","==",Number(raw)).limit(1).get();if(q.empty)fail("not-found","الطلب غير موجود.");orderRef=q.docs[0].ref;orderSnap=q.docs[0];}
  const refundRef=db.doc("orderRefunds/"+orderRef.id);
  await db.runTransaction(async tx=>{
    const [order,refund]=await Promise.all([tx.get(orderRef),tx.get(refundRef)]);
    if(!order.exists)fail("not-found","الطلب غير موجود.");
    const o=order.data();if(!o.userId)fail("failed-precondition","الطلب غير مرتبط بحساب عميل.");
    if(o.paymentStatus!=="paid")fail("failed-precondition","لا يمكن استرداد طلب غير مدفوع.");
    if(refund.exists)fail("already-exists","تم استرداد هذا الطلب مسبقاً.");
    const amount=money(Number(o.totalSar));if(!Number.isFinite(amount)||amount<=0)fail("failed-precondition","قيمة الاسترداد غير صالحة.");
    const walletRef=db.doc("wallets/"+o.userId),wallet=await tx.get(walletRef);
    tx.create(refundRef,{orderId:orderRef.id,userId:o.userId,amountSar:amount,adminId:admin.uid,reason:clean(request.data?.p_reason??request.data?.reason,500),createdAt:FieldValue.serverTimestamp()});
    tx.set(walletRef,{userId:o.userId,balanceSar:money(Number(wallet.get("balanceSar")||0)+amount),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    const ledger=db.collection("walletTransactions").doc();tx.create(ledger,{userId:o.userId,amountSar:amount,transactionType:"refund",description:"استرداد قيمة الطلب #"+raw+" إلى محفظة APEX",referenceType:"order_refund",referenceId:orderRef.id,createdAt:FieldValue.serverTimestamp()});
    tx.update(orderRef,{paymentStatus:"refunded",status:"cancelled",shippingStatus:"cancelled",updatedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true,order_id:raw,payment_status:"refunded",wallet_credited:true};
});

export const apexClaimReferralCode=onCall({region:REGION},async request=>{
  const auth=requireUser(request),code=clean(request.data?.p_code??request.data?.code,20).toUpperCase();
  if(!auth.token.email_verified)fail("failed-precondition","يجب التحقق من الحساب قبل اعتماد الدعوة.");
  if(!/^APEX[0-9]{4}$/.test(code))fail("invalid-argument","كود الدعوة غير صحيح.");
  const q=await db.collection("referralCodes").where("code","==",code).limit(1).get();
  if(q.empty)fail("not-found","كود الدعوة غير موجود.");
  const referrerId=q.docs[0].get("userId")||q.docs[0].id;
  if(referrerId===auth.uid)fail("failed-precondition","لا يمكنك استخدام كود الدعوة الخاص بك.");
  const signupRef=db.doc("referralSignups/"+auth.uid);
  await db.runTransaction(async tx=>{
    const prior=await tx.get(signupRef);if(prior.exists)fail("already-exists","تم تسجيل دعوة لهذا الحساب مسبقاً.");
    tx.create(signupRef,{referrerId,referredUserId:auth.uid,code,status:"confirmed",confirmedAt:FieldValue.serverTimestamp(),createdAt:FieldValue.serverTimestamp()});
  });
  return {claimed:true};
});

export const apexTrackReferralVisit=onCall({region:REGION},async request=>{
  const code=clean(request.data?.p_code??request.data?.code,20).toUpperCase(),visitor=clean(request.data?.p_visitor_id??request.data?.visitor_id,100);
  if(!/^APEX[0-9]{4}$/.test(code)||!visitor)return {tracked:false};
  const q=await db.collection("referralCodes").where("code","==",code).limit(1).get();if(q.empty)return {tracked:false};
  const id=await sha256(code+":"+visitor),ref=db.doc("referralVisits/"+id);
  await db.runTransaction(async tx=>{const old=await tx.get(ref);if(!old.exists)tx.create(ref,{code,userId:q.docs[0].get("userId")||q.docs[0].id,landingPath:clean(request.data?.p_landing_path??request.data?.landing_path,200),createdAt:FieldValue.serverTimestamp()});});
  return {tracked:true};
});


export const apexGetPublicPaymentMethods=onCall({region:REGION},async ()=>{
  const snap=await db.collection("paymentMethods").where("enabled","==",true).where("ordersEnabled","==",true).orderBy("sortOrder","asc").get();
  const allowed=["legacyId","name","instructions","methodType","countryCode","accountHolder","accountNumber","accountIban","sortOrder","enabled","ordersEnabled","walletTopupEnabled","methodCode"];
  const paymentMethods=snap.docs.map(d=>{const row=d.data();return {id:row.legacyId??(Number.isNaN(Number(d.id))?d.id:Number(d.id)),...Object.fromEntries(allowed.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]))};}).filter(row=>row.methodType==="manual");
  return {paymentMethods};
});


export const apexAdminBootstrap=onCall({region:REGION},async request=>{
  const auth=await requireAdmin(request);
  return {admin:true,uid:auth.uid};
});


export const apexVerifySignupOtp=onCall({region:REGION,secrets:[SECURITY_HASH_SALT]},async request=>{
  const email=clean(request.data?.email,254).toLowerCase(),code=clean(request.data?.code,6);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d{6}$/.test(code))fail("invalid-argument","أدخل البريد والرمز المكوّن من 6 أرقام.");
  const ref=db.doc("signupOtpChallenges/"+await sha256(email)),salt=SECURITY_HASH_SALT.value()||"apex-signup-otp-v1";
  let valid=false;
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists||snap.get("consumed")===true||Number(snap.get("expiresAtMs")||0)<Date.now())fail("deadline-exceeded","رمز التحقق منتهي أو غير موجود. اطلب رمزاً جديداً.");
    if(Number(snap.get("attempts")||0)>=5)fail("resource-exhausted","تجاوزت عدد محاولات التحقق. اطلب رمزاً جديداً.");
    if(await sha256(code+salt)!==snap.get("codeHash")){tx.update(ref,{attempts:FieldValue.increment(1)});return;}
    tx.update(ref,{verified:true,verifiedAtMs:Date.now()});
    valid=true;
  });
  if(!valid)fail("permission-denied","رمز التحقق غير صحيح.");
  return {verified:true};
});
