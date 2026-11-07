import { getFirebase, firebaseMessage } from "./client.js";
import { signInWithEmailAndPassword, signInWithCustomToken, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile, verifyBeforeUpdateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, serverTimestamp, Timestamp, documentId as firestoreDocumentId } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-storage.js";

const collections = {
  apex_products:"products", apex_banners:"banners", apex_payment_methods:"paymentMethods",
  apex_orders:"orders", apex_wallets:"wallets", apex_wallet_transactions:"walletTransactions",
  apex_wallet_topups:"walletTopups", apex_order_status_history:"orderStatusHistory",
  apex_referral_codes:"referralCodes", apex_referral_signups:"referralSignups",
  apex_referral_rewards:"referralRewards", apex_referral_visits:"referralVisits",
  apex_store_settings:"storeSettings", apex_security_events:"securityEvents",
  apex_email_settings:"emailSettings", apex_admins:"admins", apex_shipping_providers:"shippingProviders"
};
const callableNames = {
  "apex-ai-guard":"apexAiGuard","apex-store-assistant":"apexStoreAssistant",
  "apex-wallet-checkout":"apexWalletCheckout","apex-create-order":"apexCreateOrder",
  "apex-admin-customers":"apexAdminCustomers","apex-email-campaign":"apexEmailCampaign"
};
const rpcNames = {
  apex_track_referral_visit:"apexTrackReferralVisit",
  apex_request_wallet_topup:"apexRequestWalletTopup",
  apex_claim_referral_code:"apexClaimReferralCode",
  apex_admin_review_wallet_topup:"apexAdminReviewWalletTopup",
  apex_admin_refund_order_to_wallet:"apexAdminRefundOrderToWallet"
};
const snake = value => value.replace(/[A-Z]/g,c=>"_"+c.toLowerCase());
const cleanMeta=(value,max=120)=>String(value??"").slice(0,max);
const camel = value => value.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
function normalize(value){
  if(value?.toDate) return value.toDate().toISOString();
  if(Array.isArray(value)) return value.map(normalize);
  if(value && typeof value==="object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[snake(k),normalize(v)]));
  return value;
}
function denormalize(value){
  if(Array.isArray(value)) return value.map(denormalize);
  if(value && typeof value==="object") return Object.fromEntries(Object.entries(value).filter(([k])=>k!=="id").map(([k,v])=>[camel(k),denormalize(v)]));
  return value;
}
function documentId(table,row){
  if(table==="apex_wallets") return String(row.user_id||row.uid||"");
  if(table==="apex_admins") return String(row.user_id||row.uid||"");
  if(table==="apex_store_settings") return String(row.setting_key||row.id||"currency");
  if(table==="apex_email_settings") return String(row.id||"main");
  return String(row.id??row.legacy_id??crypto.randomUUID());
}
function fromDocument(table,snapshot){
  const raw=normalize(snapshot.data()||{});
  raw.id=raw.legacy_id??raw.id??snapshot.id;
  if(table==="apex_store_settings") raw.setting_key=raw.setting_key||snapshot.id;
  if(table==="apex_email_settings") raw.id=raw.id??(snapshot.id==="main"?1:snapshot.id);
  if(table==="apex_admins") raw.user_id=raw.user_id||snapshot.id;
  if(table==="apex_products"||table==="apex_banners"||table==="apex_payment_methods") raw.id=raw.legacy_id??(Number.isNaN(Number(snapshot.id))?snapshot.id:Number(snapshot.id));
  return raw;
}
class Builder {
  constructor(table){this.table=table;this.filters=[];this.sorts=[];this.max=null;this.mode="select";this.payload=null;this.returning=false;}
  select(){this.returning=true;return this;}
  eq(field,value){this.filters.push({field,value,op:"eq"});return this;}
  neq(field,value){this.filters.push({field,value,op:"neq"});return this;}
  gte(field,value){this.filters.push({field,value,op:"gte"});return this;}
  lte(field,value){this.filters.push({field,value,op:"lte"});return this;}
  in(field,values){this.filters.push({field,values,op:"in"});return this;}
  not(field,operator,value){this.filters.push({field,value,op:operator==="is"&&value===null?"notNull":"neq"});return this;}
  order(field,options={}){this.sorts.push({field,ascending:options.ascending!==false});return this;}
  limit(value){this.max=Math.max(0,Number(value)||0);return this;}
  maybeSingle(){return this.execute(true);}
  single(){return this.execute(true,true);}
  insert(payload){this.mode="insert";this.payload=payload;return this;}
  upsert(payload){this.mode="upsert";this.payload=payload;return this;}
  update(payload){this.mode="update";this.payload=payload;return this;}
  delete(){this.mode="delete";return this;}
  matches(row){
    return this.filters.every(f=>{const v=row[f.field];if(f.op==="eq")return v===f.value;if(f.op==="neq")return v!==f.value;if(f.op==="notNull")return v!==null&&v!==undefined;if(f.op==="in")return f.values.includes(v);if(f.op==="gte")return String(v??"")>=String(f.value);if(f.op==="lte")return String(v??"")<=String(f.value);return true;});
  }
  async execute(single=false,required=false){
    try{
      const {db}=getFirebase(),name=collections[this.table];if(!name)throw new Error("Unsupported APEX collection: "+this.table);
      const col=collection(db,name);
      if(this.mode==="select"||this.mode==="update"||this.mode==="delete"){
        const constraints=[];
        for(const f of this.filters){if((this.table==="apex_store_settings"&&f.field==="setting_key")||(this.table==="apex_email_settings"&&f.field==="id")||f.field==="id")continue;if(this.table==="apex_admins"&&f.field==="user_id"&&f.op==="eq"){constraints.push(where(firestoreDocumentId(),"==",String(f.value)));continue;}const field=camel(f.field);if(f.op==="eq")constraints.push(where(field,"==",f.value));else if(f.op==="neq")constraints.push(where(field,"!=",f.value));else if(f.op==="notNull")constraints.push(where(field,"!=",null));else if(f.op==="in")constraints.push(where(field,"in",f.values.slice(0,30)));else if(f.op==="gte"||f.op==="lte"){const val=typeof f.value==="string"&&/^\\d{4}-\\d{2}-\\d{2}T/.test(f.value)?Timestamp.fromDate(new Date(f.value)):f.value;constraints.push(where(field,f.op==="gte"?">=":"<=",val));}}
        const snap=await getDocs(constraints.length?query(col,...constraints):col);let rows=snap.docs.map(d=>({doc:d,row:fromDocument(this.table,d)})).filter(x=>this.matches(x.row));
        for(const s of this.sorts.slice().reverse())rows.sort((a,b)=>{const av=a.row[s.field],bv=b.row[s.field];const c=av===bv?0:av==null?-1:bv==null?1:av>bv?1:-1;return s.ascending?c:-c;});
        if(this.max!==null)rows=rows.slice(0,this.max);
        if(this.mode==="delete"){await Promise.all(rows.map(x=>deleteDoc(x.doc.ref)));return {data:null,error:null,count:rows.length};}
        if(this.mode==="update"){const patch=denormalize(this.payload||{});await Promise.all(rows.map(x=>updateDoc(x.doc.ref,{...patch,updatedAt:serverTimestamp()})));return {data:this.returning?rows.map(x=>({...x.row,...normalize(patch)})):null,error:null,count:rows.length};}
        const data=rows.map(x=>x.row);if(single){if(!data.length&&required)return {data:null,error:{message:"No rows found"}};if(data.length>1&&required)return {data:null,error:{message:"Multiple rows returned"}};return {data:data[0]||null,error:null,count:data.length};}
        return {data,error:null,count:data.length};
      }
      const payloads=Array.isArray(this.payload)?this.payload:[this.payload],written=[];
      for(const input of payloads){
        const row=input||{},id=documentId(this.table,row),target=doc(db,name,id),data={...denormalize(row),updatedAt:serverTimestamp()};
        if(this.mode==="insert"){if(row.id||row.user_id||row.setting_key)await setDoc(target,{...data,createdAt:serverTimestamp()});else await addDoc(col,{...data,createdAt:serverTimestamp()});}
        else await setDoc(target,{...data,createdAt:serverTimestamp()},{merge:true});
        written.push({...row,id:row.id??id});
      }
      return {data:this.returning?written:null,error:null,count:written.length};
    }catch(error){return {data:null,error:{message:firebaseMessage(error),code:error.code||"firebase-error"}};}
  }
  then(resolve,reject){return this.execute().then(resolve,reject);}
}
function mapUser(user,profile={}){
  if(!user)return null;
  return {id:user.uid,uid:user.uid,email:user.email,phone:user.phoneNumber,created_at:user.metadata?.creationTime,user_metadata:{full_name:user.displayName||profile.fullName||"",name:user.displayName||profile.fullName||"",phone:profile.phone||"",country:profile.country||"SA",address:profile.address||"",latitude:profile.latitude??null,longitude:profile.longitude??null,apex_marketing_opt_in:profile.marketingOptIn===true,apex_privacy_policy_accepted:profile.privacyPolicyAccepted===true,apex_privacy_policy_version:profile.privacyPolicyVersion||"",apex_privacy_policy_accepted_at:profile.privacyPolicyAcceptedAt||null},email_confirmed_at:user.emailVerified?user.metadata?.lastSignInTime||new Date().toISOString():null};
}
export function createApexFirebaseCompat(){
  const {auth,db,functions,storage}=getFirebase();
  let pendingOtp={email:"",code:""};
  async function profileFor(user){const s=await getDoc(doc(db,"customers",user.uid));return s.exists()?s.data():{};}
  async function sessionFor(user){if(!user)return null;const profile=await profileFor(user);return {access_token:await user.getIdToken(),token_type:"bearer",user:mapUser(user,profile)};}
  const authApi={
    async getSession(){try{return {data:{session:await sessionFor(auth.currentUser)},error:null};}catch(error){return {data:{session:null},error};}},
    async getUser(){try{return {data:{user:mapUser(auth.currentUser,auth.currentUser?await profileFor(auth.currentUser):{})},error:null};}catch(error){return {data:{user:null},error};}},
    async signInWithPassword({email,password}){try{const c=await signInWithEmailAndPassword(auth,email.trim().toLowerCase(),password);return {data:{user:mapUser(c.user,await profileFor(c.user)),session:await sessionFor(c.user)},error:null};}catch(error){return {data:null,error};}},
    async signInWithGoogle(){try{const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});let credential;try{credential=await signInWithPopup(auth,provider);}catch(error){if(error?.code==="auth/popup-blocked"||error?.code==="auth/operation-not-supported-in-this-environment"){await signInWithRedirect(auth,provider);return {data:{redirecting:true},error:null};}throw error;}return {data:{user:mapUser(credential.user,await profileFor(credential.user)),session:await sessionFor(credential.user)},error:null};}catch(error){return {data:null,error};}},
    async signInWithOtp({email}){try{const call=httpsCallable(functions,"apexRequestSignupOtp");await call({email});pendingOtp={email:email.trim().toLowerCase(),code:""};return {data:{},error:null};}catch(error){return {data:null,error};}},
    async verifyOtp({email,token}){try{if(email.trim().toLowerCase()!==pendingOtp.email)throw new Error("البريد لا يطابق طلب رمز التحقق.");const call=httpsCallable(functions,"apexVerifySignupOtp");await call({email,code:String(token||"")});pendingOtp.code=String(token||"");return {data:{verified:true},error:null};}catch(error){return {data:null,error};}},
    async updateUser(payload){try{
      const current=auth.currentUser;
      if(pendingOtp.code&&pendingOtp.email){
        const meta=payload.data||{},call=httpsCallable(functions,"apexCompleteSignup");
        const result=(await call({email:pendingOtp.email,code:pendingOtp.code,password:payload.password,full_name:meta.full_name||meta.name,phone:meta.phone,country:meta.country,address:meta.address,latitude:meta.latitude,longitude:meta.longitude,marketing_opt_in:meta.apex_marketing_opt_in===true})).data;
        pendingOtp={email:"",code:""};const credential=await signInWithCustomToken(auth,result.customToken);return {data:{user:mapUser(credential.user,await profileFor(credential.user))},error:null};
      }
      if(!current)throw new Error("يجب تسجيل الدخول أولاً.");
      if(payload.password)await updatePassword(current,payload.password);
      if(payload.email)await verifyBeforeUpdateEmail(current,payload.email);
      const meta=payload.data||{},profile={fullName:meta.full_name||meta.name||current.displayName||"",phone:meta.phone||"",country:meta.country==="YE"?"YE":"SA",address:meta.address||"",latitude:Number.isFinite(meta.latitude)?meta.latitude:null,longitude:Number.isFinite(meta.longitude)?meta.longitude:null,marketingOptIn:meta.apex_marketing_opt_in===true,privacyPolicyAccepted:meta.apex_privacy_policy_accepted===true,privacyPolicyVersion:cleanMeta(meta.apex_privacy_policy_version,80),privacyPolicyAcceptedAt:meta.apex_privacy_policy_accepted_at||null,marketingConsentAt:meta.apex_marketing_consent_at||null,updatedAt:serverTimestamp()};
      if(profile.fullName&&profile.fullName!==current.displayName)await updateProfile(current,{displayName:profile.fullName});
      await setDoc(doc(db,"customers",current.uid),{uid:current.uid,...profile},{merge:true});
      return {data:{user:mapUser(current,profile)},error:null};
    }catch(error){return {data:null,error};}},
    async resetPasswordForEmail(email,options={}){try{const action=options.redirectTo?{url:options.redirectTo,handleCodeInApp:false}:undefined;await sendPasswordResetEmail(auth,email.trim().toLowerCase(),action);return {data:{},error:null};}catch(error){return {data:null,error};}},
    async signOut(){try{await signOut(auth);return {error:null};}catch(error){return {error};}},
    onAuthStateChange(callback){const unsub=onAuthStateChanged(auth,async user=>{try{callback(user?"SIGNED_IN":"SIGNED_OUT",user?await sessionFor(user):null);}catch(error){console.error(error);callback(user?"SIGNED_IN":"SIGNED_OUT",null);}});return {data:{subscription:{unsubscribe:unsub}}};}
  };
  const publicUrls=new Map();
  return {
    auth:authApi,
    from(table){return new Builder(table);},
    async rpc(name,args={}){try{const fn=rpcNames[name];if(!fn)throw new Error("Unsupported APEX operation: "+name);const result=await httpsCallable(functions,fn)(args);return {data:result.data,error:null};}catch(error){return {data:null,error};}},
    functions:{async invoke(name,{body={}}={}){try{const fn=callableNames[name];if(!fn)throw new Error("Unsupported APEX function: "+name);const result=await httpsCallable(functions,fn)(body);if(name==="apex-admin-customers"&&auth.currentUser)await auth.currentUser.getIdToken(true);return {data:result.data,error:null};}catch(error){return {data:null,error};}}},
    storage:{from(bucket){return {async upload(path,file,options={}){try{if(auth.currentUser){await httpsCallable(functions,"apexAdminBootstrap")({});await auth.currentUser.getIdToken(true);}const target=ref(storage,((bucket==="apex-store"?"store":bucket)+"/"+path).replace(/^\/+/, ""));await uploadBytes(target,file,{contentType:options.contentType||file.type,cacheControl:options.cacheControl||"3600"});const url=await getDownloadURL(target);publicUrls.set(path,url);return {data:{path},error:null};}catch(error){return {data:null,error};}},getPublicUrl(path){return {data:{publicUrl:publicUrls.get(path)||""}};}};}}
  };
}
