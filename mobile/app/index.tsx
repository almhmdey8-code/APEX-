import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../src/lib/supabase';
import { theme } from '../src/theme';

type Product = { id: number|string; name: string; category: string|null; description: string|null; price: number|null; image_url: string|null; image_urls?: string[]|null };
type CartLine = { id: number|string; name: string; price: number; quantity: number; image_url?: string|null };
type PaymentMethod = { id: number; name: string; method_code: string; instructions: string|null; method_type: string|null; country_code: string; account_holder?: string|null; account_number?: string|null; account_iban?: string|null; enabled: boolean; orders_enabled: boolean; integration_status?: string|null };
type Order = { id: number; created_at: string; status: string; items: any; total_sar: number; payment_status: string|null; shipping_status: string|null; carrier: string|null; aramex_tracking_number: string|null };
type Screen = 'الرئيسية'|'الأقسام'|'السلة'|'الطلبات'|'المزيد'|'حسابي'|'المساعد الذكي'|'تتبع الشحنات'|'البحث'|'الدفع';

const C=theme.colors;
const CART_KEY='apex_native_cart_v1';
const FAV_KEY='apex_native_favorites_v1';
const currencyName=(country:string)=>country==='YE'?'ر.ي':'ر.س';
const money=(n:number,country:string,rate:number)=>country==='YE'?(n*rate).toLocaleString('ar-YE',{maximumFractionDigits:0})+' ر.ي':Number(n||0).toLocaleString('ar-SA',{style:'currency',currency:'SAR',maximumFractionDigits:2});
const statusLabel=(s:string)=>({new:'تم استلام الطلب',confirmed:'تم تأكيد الطلب',processing:'قيد التجهيز',shipped:'قيد الشحن',delivered:'تم التسليم',cancelled:'ملغي',return_requested:'طلب إرجاع قيد المراجعة'} as Record<string,string>)[s]||s;
const safeError=(e:any)=>String(e?.message||'حدث خطأ غير متوقع');

function Button({title,onPress,secondary=false,disabled=false}:any){return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,secondary&&styles.buttonSecondary,disabled&&styles.disabled,pressed&&styles.pressed]}><Text style={[styles.buttonText,secondary&&styles.buttonSecondaryText]}>{title}</Text></Pressable>}
function Field({label,value,onChangeText,placeholder,keyboardType='default',secureTextEntry=false,multiline=false}:any){return <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder||label} placeholderTextColor="#7D8798" keyboardType={keyboardType} secureTextEntry={secureTextEntry} multiline={multiline} style={[styles.input,multiline&&styles.multiline]} textAlign="right" autoCapitalize="none"/></View>}
function SectionTitle({title,action,onAction}:any){return <View style={styles.sectionHeading}><View style={styles.headingLine}/><Text style={styles.sectionTitle}>{title}</Text>{action?<Pressable onPress={onAction}><Text style={styles.link}>{action}</Text></Pressable>:null}<View style={styles.headingLine}/></View>}

export default function HomeScreen(){
 const [screen,setScreen]=useState<Screen>('الرئيسية');
 const [products,setProducts]=useState<Product[]>([]);
 const [banners,setBanners]=useState<any[]>([]);
 const [cart,setCart]=useState<CartLine[]>([]);
 const [favorites,setFavorites]=useState<string[]>([]);
 const [categories,setCategories]=useState<string[]>([]);
 const [category,setCategory]=useState('الكل');
 const [query,setQuery]=useState('');
 const [country,setCountry]=useState('SA');
 const [rate,setRate]=useState(1);
 const [paymentMethods,setPaymentMethods]=useState<PaymentMethod[]>([]);
 const [selectedPayment,setSelectedPayment]=useState<number|null>(null);
 const [payerName,setPayerName]=useState('');
 const [paymentReference,setPaymentReference]=useState('');
 const [customerName,setCustomerName]=useState('');
 const [phone,setPhone]=useState('');
 const [address,setAddress]=useState('');
 const [shipping,setShipping]=useState('توصيل إلى المنزل');
 const [session,setSession]=useState<any>(null);
 const [orders,setOrders]=useState<Order[]>([]);
 const [walletBalance,setWalletBalance]=useState(0);
 const [referralCode,setReferralCode]=useState('');
 const [email,setEmail]=useState('');
 const [otp,setOtp]=useState('');
 const [password,setPassword]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [authMode,setAuthMode]=useState<'login'|'signup'|'recovery'>('login');
 const [authStep,setAuthStep]=useState<'details'|'otp'|'profile'>('details');
 const [privacyAccepted,setPrivacyAccepted]=useState(false);
 const [aiInput,setAiInput]=useState('');
 const [aiMessages,setAiMessages]=useState<{role:'user'|'assistant';content:string}[]>([]);
 const [busy,setBusy]=useState(false);
 const [refreshing,setRefreshing]=useState(false);
 const [detail,setDetail]=useState<Product|null>(null);
 const [checkoutOpen,setCheckoutOpen]=useState(false);
 const [message,setMessage]=useState('');

 const cartCount=useMemo(()=>cart.reduce((n,x)=>n+x.quantity,0),[cart]);
 const cartTotal=useMemo(()=>cart.reduce((n,x)=>n+x.price*x.quantity,0),[cart]);
 const visibleProducts=useMemo(()=>products.filter(p=>(category==='الكل'||p.category===category)&&(!query.trim()||[p.name,p.category,p.description].join(' ').toLowerCase().includes(query.toLowerCase()))),[products,category,query]);

 const loadStore=useCallback(async()=>{
  const [p,b,c] = await Promise.all([
   supabase.from('apex_products').select('id,name,category,description,price,image_url,image_urls,active').eq('active',true).order('created_at',{ascending:false}),
   supabase.from('apex_banners').select('id,title,subtitle,image_url,link_url').eq('active',true).order('sort_order',{ascending:true}),
   supabase.from('apex_store_settings').select('exchange_rate').eq('setting_key','currency').maybeSingle(),
  ]);
  if(p.error)throw p.error;
  const list=(p.data||[]) as Product[];setProducts(list);setCategories([...new Set(list.map(x=>x.category).filter(Boolean) as string[])]);
  setBanners((b.data||[]).filter((x:any)=>x.image_url));
  if(c.data && Number(c.data.exchange_rate)>0)setRate(Number(c.data.exchange_rate));
  const [storedCart,storedFav]=await Promise.all([SecureStore.getItemAsync(CART_KEY),SecureStore.getItemAsync(FAV_KEY)]);
  if(storedCart){try{setCart(JSON.parse(storedCart))}catch{setCart([])}}
  if(storedFav){try{setFavorites(JSON.parse(storedFav))}catch{setFavorites([])}}
 },[]);

 const loadMethods=useCallback(async(countryCode:string)=>{
  const {data,error}=await supabase.from('apex_payment_methods').select('id,name,method_code,instructions,method_type,country_code,account_holder,account_number,account_iban,enabled,orders_enabled,integration_status').order('sort_order',{ascending:true});
  if(error){setPaymentMethods([]);return}
  const allowed=countryCode==='YE'?['alkuraimi_bank','jeeb','one_cash','alamri_cash']:['mada','visa','google_pay'];
  setPaymentMethods(((data||[]) as PaymentMethod[]).filter(m=>(m.country_code===countryCode||m.country_code==='ALL')&&allowed.includes(m.method_code)&&m.enabled&&m.orders_enabled&&String(m.method_type||'manual').toLowerCase()!=='gateway'&&(!!m.account_number||!!m.account_iban)));
 },[]);

 const loadCustomer=useCallback(async(s:any)=>{
  setSession(s||null);
  if(!s?.user){setOrders([]);setWalletBalance(0);setReferralCode('');return}
  const meta=s.user.user_metadata||{};
  setCustomerName(meta.full_name||'');setPhone(meta.phone||'');setAddress(meta.address||'');
  const cc=String(meta.country||'SA').toUpperCase()==='YE'?'YE':'SA';setCountry(cc);
  const [o,w,r]=await Promise.all([
   supabase.from('apex_orders').select('id,created_at,status,items,aramex_tracking_number,total_sar,payment_status,shipping_status,carrier').eq('user_id',s.user.id).order('created_at',{ascending:false}),
   supabase.from('apex_wallets').select('balance_sar').eq('user_id',s.user.id).maybeSingle(),
   supabase.from('apex_referral_codes').select('code').eq('user_id',s.user.id).maybeSingle(),
  ]);
  if(!o.error)setOrders((o.data||[]) as Order[]);
  if(!w.error)setWalletBalance(Number(w.data?.balance_sar||0));
  if(!r.error)setReferralCode(r.data?.code||'');
 },[]);

 const refresh=useCallback(async()=>{
  setRefreshing(true);
  try{await loadStore();await loadMethods(country);const {data}=await supabase.auth.getSession();await loadCustomer(data.session)}catch(e){setMessage('تعذر تحديث المتجر: '+safeError(e))}finally{setRefreshing(false)}
 },[loadStore,loadMethods,loadCustomer,country]);

 useEffect(()=>{
  let mounted=true;
  (async()=>{try{await loadStore();await loadMethods('SA');const {data}=await supabase.auth.getSession();if(mounted)await loadCustomer(data.session)}catch(e){if(mounted)setMessage('تعذر تحميل بيانات المتجر: '+safeError(e))}})();
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{if(mounted)void loadCustomer(s)});
  return()=>{mounted=false;subscription.unsubscribe()};
 },[loadStore,loadMethods,loadCustomer]);

 useEffect(()=>{void SecureStore.setItemAsync(CART_KEY,JSON.stringify(cart))},[cart]);
 useEffect(()=>{void SecureStore.setItemAsync(FAV_KEY,JSON.stringify(favorites))},[favorites]);
 useEffect(()=>{void loadMethods(country)},[country,loadMethods]);

 const navigate=(to:Screen)=>{setScreen(to);setMessage('')};
 const addToCart=(p:Product)=>{if(p.price===null||Number(p.price)<=0){Alert.alert('غير متاح للطلب','سعر هذا المنتج لم يُحدد بعد.');return}setCart(old=>{const i=old.findIndex(x=>String(x.id)===String(p.id));if(i>=0){const next=[...old];next[i]={...next[i],quantity:Math.min(99,next[i].quantity+1)};return next}return [...old,{id:p.id,name:p.name,price:Number(p.price),quantity:1,image_url:p.image_url}]});Alert.alert('APEX','تمت إضافة المنتج إلى السلة')};
 const changeQty=(id:number|string,delta:number)=>setCart(old=>old.map(x=>String(x.id)===String(id)?{...x,quantity:x.quantity+delta}:x).filter(x=>x.quantity>0&&x.quantity<=99));
 const toggleFavorite=(id:number|string)=>setFavorites(old=>old.includes(String(id))?old.filter(x=>x!==String(id)):[...old,String(id)]);

 const requestOtp=async()=>{
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setMessage('أدخل بريداً إلكترونياً صحيحاً.');return}
  if(authMode==='signup'&&!privacyAccepted){setMessage('يجب الموافقة على سياسة الخصوصية قبل إنشاء الحساب.');return}
  setBusy(true);setMessage('جارٍ إرسال رمز التحقق إلى بريدك...');
  try{const {error}=authMode==='recovery'?await supabase.auth.resetPasswordForEmail(email.trim()):await supabase.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:authMode==='signup'}});if(error)throw error;setAuthStep('otp');setMessage('تم إرسال رمز مكوّن من 6 أرقام إلى بريدك.')}
  catch(e){setMessage('تعذر إرسال الرمز: '+safeError(e))}finally{setBusy(false)}
 };
 const verifyCode=async()=>{
  if(!/^\d{6}$/.test(otp)){setMessage('أدخل رمزاً صحيحاً من 6 أرقام.');return}
  setBusy(true);
  try{
   const {data,error}=await supabase.auth.verifyOtp({email:email.trim(),token:otp.trim(),type:authMode==='recovery'?'recovery':'email'});if(error)throw error;
   if(authMode==='recovery'){setAuthStep('profile');setMessage('تم التحقق. أدخل كلمة المرور الجديدة.');return}
   if(authMode==='signup'){setAuthStep('profile');setMessage('تم التحقق من البريد. أكمل بيانات الحساب.');return}
   await loadCustomer(data.session);setScreen('حسابي');setAuthStep('details');setMessage('تم تسجيل الدخول بنجاح.');
  }catch(e){setMessage('تعذر التحقق: '+safeError(e))}finally{setBusy(false)}
 };
 const finishProfile=async()=>{
  if(authMode==='recovery'){
   if(newPassword.length<6){setMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');return}
   setBusy(true);try{const {error}=await supabase.auth.updateUser({password:newPassword});if(error)throw error;setAuthMode('login');setAuthStep('details');setOtp('');setNewPassword('');setMessage('تم تحديث كلمة المرور.');}catch(e){setMessage(safeError(e))}finally{setBusy(false)}return;
  }
  if(!customerName.trim()||!phone.trim()||!address.trim()){setMessage('أدخل الاسم ورقم الجوال والعنوان.');return}
  if(!privacyAccepted){setMessage('الموافقة على سياسة الخصوصية مطلوبة.');return}
  setBusy(true);
  try{const {data,error}=await supabase.auth.updateUser({data:{full_name:customerName.trim(),phone:phone.trim(),address:address.trim(),country,apex_privacy_policy_accepted:true,apex_privacy_policy_version:'2026-11-13-enhanced-privacy',apex_privacy_policy_accepted_at:new Date().toISOString()}});if(error)throw error;if(data.user){const {data:s}=await supabase.auth.getSession();await loadCustomer(s.session)}setScreen('حسابي');setAuthMode('login');setAuthStep('details');setMessage('تم حفظ حسابك بنجاح.')}
  catch(e){setMessage('تعذر حفظ الحساب: '+safeError(e))}finally{setBusy(false)}
 };
 const signOut=async()=>{const {error}=await supabase.auth.signOut();if(error)Alert.alert('تعذر تسجيل الخروج',error.message);else{setScreen('الرئيسية');setMessage('تم تسجيل الخروج.')}};

 const checkout=async()=>{
  if(!session?.user){Alert.alert('تسجيل الدخول','سجّل الدخول بالبريد أولاً لحفظ الطلب.');navigate('حسابي');setAuthMode('login');return}
  if(!cart.length){Alert.alert('السلة فارغة','أضف منتجات قبل إتمام الطلب.');return}
  if(!customerName.trim()||!phone.trim()||!address.trim()){Alert.alert('بيانات التوصيل','أكمل الاسم ورقم الجوال والعنوان في حسابك.');navigate('حسابي');return}
  if(!selectedPayment){Alert.alert('طريقة الدفع','اختر وسيلة دفع مفعّلة.');return}
  if(!payerName.trim()||!paymentReference.trim()){Alert.alert('بيانات الحوالة','أدخل اسم المحوّل ورقم مرجع الحوالة.');return}
  setBusy(true);
  try{
   const {data:profile,error:profileError}=await supabase.auth.updateUser({data:{...(session.user.user_metadata||{}),full_name:customerName.trim(),phone:phone.trim(),address:address.trim(),country}});
   if(profileError)throw profileError;
   if(profile?.user){const {data:s}=await supabase.auth.getSession();if(s.session)await loadCustomer(s.session)}
   const method=paymentMethods.find(x=>x.id===selectedPayment);
   const notes=['وسيلة الدفع: '+(method?.name||''),'اسم المحوّل: '+payerName.trim(),'مرجع الحوالة: '+paymentReference.trim()].join('\n');
   const {data,error}=await supabase.functions.invoke('apex-create-order',{body:{customer_name:customerName.trim(),phone:phone.trim(),address:address.trim(),notes,shipping_method:shipping,delivery_country:country,delivery_location:null,items:cart.map(x=>({id:x.id,quantity:x.quantity})),payment_method_id:selectedPayment,request_id:makeRequestId()}});
   if(error)throw error;if(!data?.success)throw new Error(data?.error||'تعذر إنشاء الطلب.');
   setCart([]);setCheckoutOpen(false);setPaymentReference('');setPayerName('');setSelectedPayment(null);await refresh();setScreen('الطلبات');Alert.alert('تم استلام طلبك','رقم الطلب #'+data.order_id+' — الدفع بانتظار التحقق من المتجر.');
  }catch(e){Alert.alert('تعذر إرسال الطلب',safeError(e))}finally{setBusy(false)}
 };
 const sendAi=async()=>{
  const text=aiInput.trim();if(!text||busy)return;
  const next=[...aiMessages,{role:'user' as const,content:text}];setAiMessages(next);setAiInput('');setBusy(true);
  try{const {data,error}=await supabase.functions.invoke('apex-store-assistant',{body:{messages:next.slice(-12)}});if(error)throw error;if(!data?.reply)throw new Error('لم يصل رد صالح.');setAiMessages([...next,{role:'assistant',content:data.reply}])}
  catch(e){setAiMessages([...next,{role:'assistant',content:'تعذر الاتصال بالمساعد حالياً: '+safeError(e)}])}finally{setBusy(false)}
 };

 const productCard=({item}: {item:Product})=><View style={styles.productCard}>
  <Pressable onPress={()=>setDetail(item)} style={styles.productImageWrap}>
   {item.image_url?<Text style={styles.imageHint}>صورة المنتج</Text>:<Text style={styles.productGem}>◇</Text>}
   {(item.image_url||item.image_urls?.[0])?<ProductImage uri={(item.image_url||item.image_urls?.[0]) as string}/>:null}
  </Pressable>
  <Pressable onPress={()=>toggleFavorite(item.id)} style={styles.fav}><Text style={{color:favorites.includes(String(item.id))?C.goldLight:C.muted,fontSize:20}}>{favorites.includes(String(item.id))?'♥':'♡'}</Text></Pressable>
  <Text style={styles.productCategory}>{item.category||'APEX SELECT'}</Text>
  <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
  <Text style={styles.productPrice}>{item.price===null?'السعر غير محدد':money(Number(item.price),country,rate)}</Text>
  <View style={styles.productActions}><Button title="التفاصيل" secondary onPress={()=>setDetail(item)}/><Button title="＋ السلة" onPress={()=>addToCart(item)} disabled={item.price===null||Number(item.price)<=0}/></View>
 </View>;

 return <SafeAreaView style={styles.safe} edges={['top','left','right']}>
  <StatusBar barStyle="light-content" backgroundColor={C.background}/>
  <View style={styles.topBar}>
   <Pressable onPress={()=>navigate('المزيد')} style={styles.topIcon}><Text style={styles.topIconText}>☰</Text></Pressable>
   <View style={styles.brandBlock}><Text style={styles.crown}>♛</Text><Text style={styles.brand}>APEX</Text><Text style={styles.tagline}>ROYAL SHOPPING EXPERIENCE</Text></View>
   <View style={styles.topActions}><Pressable onPress={()=>navigate('البحث')} style={styles.topIcon}><Text style={styles.searchIcon}>⌕</Text></Pressable><Pressable onPress={()=>navigate('السلة')} style={styles.topIcon}><Text style={styles.topIconText}>▣</Text><View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View></Pressable></View>
  </View>
  {!!message&&<Pressable onPress={()=>setMessage('')} style={styles.message}><Text style={styles.messageText}>{message}</Text></Pressable>}
  {screen==='الرئيسية'?<ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.goldLight}/>}>
   <View style={styles.hero}><View style={styles.heroBlueOrb}/><View style={styles.heroGoldHalo}/><Text style={styles.heroKicker}>APEX / ROYAL COLLECTION</Text><Text style={styles.heroTitle}>متجر النخبة</Text><Text style={styles.heroSubtitle}>تسوّق بذكاء .. عش الفخامة</Text><Button title="تسوّق الآن" onPress={()=>navigate('الأقسام')}/><Text style={styles.heroCrown}>♛</Text></View>
   <View style={styles.servicesRow}>{[['✧','المساعد الذكي','المساعد الذكي'],['♧','الشحن والتتبع','تتبع الشحنات'],['♙','حسابي','حسابي'],['▣','السلة','السلة']].map(x=><Pressable key={x[1]} onPress={()=>navigate(x[2] as Screen)} style={styles.serviceCard}><Text style={styles.serviceIcon}>{x[0]}</Text><Text style={styles.serviceLabel}>{x[1]}</Text></Pressable>)}</View>
   {banners.length>0&&<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:16}}>{banners.map((b:any)=><Pressable key={b.id} onPress={()=>b.link_url&&Linking.openURL(b.link_url)} style={styles.bannerCard}><Text style={styles.bannerTitle}>{b.title}</Text><Text style={styles.bannerSubtitle}>{b.subtitle}</Text></Pressable>)}</ScrollView>}
   <SectionTitle title="الأقسام الرئيسية" action="عرض الكل" onAction={()=>navigate('الأقسام')}/>
   <View style={styles.categoriesGrid}>{categories.slice(0,4).map((x,i)=><Pressable key={x} onPress={()=>{setCategory(x);navigate('الأقسام')}} style={styles.categoryCard}><Text style={styles.categoryIcon}>{['⌁','◉','◷','◇'][i%4]}</Text><Text style={styles.categoryName}>{x}</Text></Pressable>)}</View>
   <SectionTitle title="أحدث المنتجات" action="عرض الكل" onAction={()=>navigate('الأقسام')}/>
   {products.length?<FlatList data={products.slice(0,4)} renderItem={productCard} keyExtractor={x=>String(x.id)} numColumns={2} scrollEnabled={false} columnWrapperStyle={{gap:10}} contentContainerStyle={{gap:10}}/>:<Empty title="لا توجد منتجات متاحة حالياً" desc="ستظهر هنا المنتجات النشطة من متجر APEX."/>}
   <SectionTitle title="خدمات APEX" />
   {['تتبع الشحنات','المساعد الذكي','طرق دفع السعودية واليمن'].map((x,i)=><Pressable key={x} style={styles.featureCard} onPress={()=>navigate(i===0?'تتبع الشحنات':i===1?'المساعد الذكي':'الدفع')}><Text style={styles.featureIcon}>{['♧','✧','◈'][i]}</Text><View style={{flex:1}}><Text style={styles.featureTitle}>{x}</Text><Text style={styles.featureDesc}>خدمات متجر النخبة في مكان واحد</Text></View><Text style={styles.featureArrow}>‹</Text></Pressable>)}
   <Text style={styles.footer}>APEX • SHOP SMART · LIVE LUXURY</Text>
  </ScrollView>:null}

  {screen==='الأقسام'||screen==='البحث'?<View style={styles.flex}><View style={styles.searchWrap}><Field label="ابحث عن منتج" value={query} onChangeText={setQuery} placeholder="اسم المنتج أو القسم"/></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><Chip title="الكل" active={category==='الكل'} onPress={()=>setCategory('الكل')}/>{categories.map(x=><Chip key={x} title={x} active={category===x} onPress={()=>setCategory(x)}/>)}</ScrollView><FlatList data={visibleProducts} renderItem={productCard} keyExtractor={x=>String(x.id)} numColumns={2} columnWrapperStyle={{gap:10}} contentContainerStyle={styles.productGrid} ListEmptyComponent={<Empty title="لا توجد منتجات مطابقة" desc="جرّب تغيير البحث أو اختيار قسم آخر."/>} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.goldLight}/>}/></View>:null}

  {screen==='السلة'?<ScrollView contentContainerStyle={styles.content}><SectionTitle title="سلة التسوق"/>{cart.length===0?<Empty title="سلتك فارغة حالياً" desc="ابدأ التسوق وأضف المنتجات التي تعجبك."/>:cart.map(x=><View key={String(x.id)} style={styles.cartRow}><View style={{flex:1}}><Text style={styles.productName}>{x.name}</Text><Text style={styles.productPrice}>{money(x.price*x.quantity,country,rate)}</Text><View style={styles.qtyRow}><Button title="−" secondary onPress={()=>changeQty(x.id,-1)}/><Text style={styles.qtyText}>{x.quantity}</Text><Button title="＋" secondary onPress={()=>changeQty(x.id,1)}/><Button title="حذف" secondary onPress={()=>setCart(old=>old.filter(i=>String(i.id)!==String(x.id)))}/></View></View></View>)}{cart.length>0&&<View style={styles.totalCard}><Text style={styles.totalLabel}>الإجمالي التقريبي</Text><Text style={styles.total}>{money(cartTotal,country,rate)}</Text><Text style={styles.muted}>لا يشمل رسوم الشحن. يتم تثبيت السعر عند تأكيد الطلب.</Text><Button title="متابعة إلى الدفع" onPress={()=>{setCheckoutOpen(true);void loadMethods(country)}}/></View>}</ScrollView>:null}

  {screen==='الطلبات'||screen==='تتبع الشحنات'?<ScrollView contentContainerStyle={styles.content}><SectionTitle title={screen==='الطلبات'?'طلباتي':'تتبع الشحنات'} action="تحديث" onAction={refresh}/>{!session?<Empty title="سجّل الدخول أولاً" desc="طلباتك تظهر بعد تسجيل الدخول بالبريد." action="حسابي" onAction={()=>navigate('حسابي')}/>:orders.length===0?<Empty title="لا توجد طلبات حتى الآن" desc="عندما تنشئ طلباً سيظهر هنا مع حالة التجهيز والشحن."/>:orders.map(o=><View key={o.id} style={styles.orderCard}><View style={styles.orderHead}><Text style={styles.orderId}>طلب #{o.id}</Text><Text style={styles.orderStatus}>{statusLabel(o.status)}</Text></View><Text style={styles.muted}>{new Date(o.created_at).toLocaleString('ar-SA')}</Text><Text style={styles.productPrice}>{money(Number(o.total_sar||0),country,rate)}</Text><Text style={styles.muted}>حالة الدفع: {o.payment_status||'بانتظار التحقق'}</Text>{o.carrier?<Text style={styles.muted}>شركة الشحن: {o.carrier}</Text>:null}{o.aramex_tracking_number?<Text style={styles.link}>رقم التتبع: {o.aramex_tracking_number}</Text>:null}<Button title="تفاصيل الطلب" secondary onPress={()=>Alert.alert('طلب #'+o.id,'الحالة: '+statusLabel(o.status)+'\nحالة الشحن: '+(o.shipping_status||'قيد التحديث'))}/></View>)}</ScrollView>:null}

  {screen==='حسابي'?<ScrollView contentContainerStyle={styles.content}><SectionTitle title="حسابي"/>
   {session?<><View style={styles.accountCard}><Text style={styles.accountCrown}>♛</Text><Text style={styles.accountName}>{customerName||'عضو APEX'}</Text><Text style={styles.muted}>{session.user.email}</Text><Text style={styles.walletBalance}>رصيد المحفظة: {money(walletBalance,'SA',1)}</Text>{referralCode?<Text style={styles.muted}>كود الدعوة: APEX{referralCode}</Text>:null}</View><Field label="الاسم الكامل" value={customerName} onChangeText={setCustomerName}/><Field label="رقم الجوال" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/><Field label="الدولة" value={country} onChangeText={setCountry} placeholder="SA أو YE"/><Field label="عنوان التوصيل" value={address} onChangeText={setAddress} multiline/><Button title="حفظ بيانات الحساب" onPress={async()=>{setBusy(true);try{const {data,error}=await supabase.auth.updateUser({data:{...(session.user.user_metadata||{}),full_name:customerName,phone,address,country}});if(error)throw error;if(data.user){const {data:s}=await supabase.auth.getSession();await loadCustomer(s.session)}Alert.alert('APEX','تم حفظ بيانات الحساب.')}catch(e){Alert.alert('خطأ',safeError(e))}finally{setBusy(false)}}} /><Field label="البريد الجديد" value={email} onChangeText={setEmail} keyboardType="email-address"/><Button title="طلب تغيير البريد" secondary onPress={async()=>{const {error}=await supabase.auth.updateUser({email:email.trim()});Alert.alert(error?'تعذر إرسال الطلب':'تحقق من البريد',error?.message||'أرسلنا رسالة تأكيد إلى البريد الجديد.')}}/><Button title="تسجيل الخروج" secondary onPress={signOut}/></>:<><Text style={styles.accountSectionTitle}>{authMode==='login'?'تسجيل الدخول بالبريد':authMode==='signup'?'إنشاء حساب جديد':'استعادة كلمة المرور'}</Text>{authStep==='details'?<><Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} keyboardType="email-address"/>{authMode==='signup'?<><Text style={styles.privacyText}>بإنشاء الحساب، أنت توافق على سياسة خصوصية APEX وحماية بياناتك واستخدامها لمعالجة الطلبات والشحن وخدمة العملاء.</Text><Pressable onPress={()=>setPrivacyAccepted(!privacyAccepted)} style={styles.privacyRow}><Text style={styles.privacyCheck}>{privacyAccepted?'☑':'□'}</Text><Text style={styles.muted}>أوافق على سياسة الخصوصية</Text></Pressable></>:null}<Button title="إرسال رمز التحقق" onPress={requestOtp} disabled={busy}/><View style={styles.inlineActions}><Text onPress={()=>{setAuthMode(authMode==='login'?'signup':'login');setAuthStep('details');setMessage('')}} style={styles.link}>{authMode==='login'?'إنشاء حساب جديد':'العودة لتسجيل الدخول'}</Text><Text onPress={()=>{setAuthMode('recovery');setAuthStep('details')}} style={styles.link}>نسيت كلمة المرور؟</Text></View></>:authStep==='otp'?<><Field label="رمز التحقق المكوّن من 6 أرقام" value={otp} onChangeText={setOtp} keyboardType="number-pad"/><Button title="تحقق من الرمز" onPress={verifyCode} disabled={busy}/><Button title="إعادة إرسال الرمز" secondary onPress={requestOtp} disabled={busy}/></>:<>{authMode==='signup'?<><Field label="الاسم الكامل" value={customerName} onChangeText={setCustomerName}/><Field label="رقم الجوال" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/><Field label="الدولة (SA أو YE)" value={country} onChangeText={setCountry}/><Field label="عنوان التوصيل" value={address} onChangeText={setAddress} multiline/></>:<Field label="كلمة المرور الجديدة" value={newPassword} onChangeText={setNewPassword} secureTextEntry/>}<Button title={authMode==='signup'?'إنشاء الحساب':'حفظ كلمة المرور الجديدة'} onPress={finishProfile} disabled={busy}/></>}</>}
   </ScrollView>:null}

  {screen==='المزيد'?<ScrollView contentContainerStyle={styles.content}><SectionTitle title="المزيد من APEX"/>{[['♙','حسابي','حسابك وبياناتك الشخصية','حسابي'],['✧','المساعد الذكي','مساعدة فورية حول المتجر','المساعد الذكي'],['♧','تتبع الشحنات','تابع حالة شحنتك','تتبع الشحنات'],['▤','طلباتي','كل طلباتك السابقة','الطلبات'],['◈','سياسة الخصوصية','حماية بياناتك وخصوصيتك','privacy']].map(x=><Pressable key={x[1]} style={styles.featureCard} onPress={()=>x[3]==='privacy'?Alert.alert('سياسة خصوصية APEX','نستخدم بياناتك لمعالجة الطلبات والتوصيل والدعم. لا نعرض بيانات حسابك للعملاء الآخرين. تتم معالجة بيانات الدخول عبر Supabase ولا نخزن كلمات المرور داخل التطبيق.') : navigate(x[3] as Screen)}><Text style={styles.featureIcon}>{x[0]}</Text><View style={{flex:1}}><Text style={styles.featureTitle}>{x[1]}</Text><Text style={styles.featureDesc}>{x[2]}</Text></View><Text style={styles.featureArrow}>‹</Text></Pressable>)}</ScrollView>:null}

  {screen==='المساعد الذكي'?<KeyboardAvoidingView style={styles.flex} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={styles.content}><SectionTitle title="المباشر APEX AI مساعد"/>{aiMessages.map((m,i)=><View key={i} style={[styles.aiBubble,m.role==='user'?styles.aiUser:styles.aiAssistant]}><Text style={styles.aiText}>{m.content}</Text></View>)}{aiMessages.length===0?<Empty title="مرحباً بك في مساعد APEX" desc="اسأل عن المنتجات أو الأسعار أو الطلبات أو الشحن."/>:null}</ScrollView><View style={styles.aiComposer}><TextInput value={aiInput} onChangeText={setAiInput} placeholder="اكتب سؤالك..." placeholderTextColor="#8992A2" style={styles.aiInput} textAlign="right"/><Button title="إرسال" onPress={sendAi} disabled={busy}/></View></KeyboardAvoidingView>:null}

  <View style={styles.bottomNav}>{[{icon:'•••',label:'المزيد',screen:'المزيد'},{icon:'▤',label:'الطلبات',screen:'الطلبات'},{icon:'⌂',label:'الرئيسية',screen:'الرئيسية'},{icon:'▦',label:'الأقسام',screen:'الأقسام'},{icon:'▣',label:'السلة',screen:'السلة'}].map(t=><Pressable key={t.label} onPress={()=>navigate(t.screen as Screen)} style={[styles.tab,screen===t.screen&&styles.activeTab]}><Text style={[styles.tabIcon,screen===t.screen&&styles.activeTabIcon]}>{t.icon}</Text><Text style={[styles.tabLabel,screen===t.screen&&styles.activeTabLabel]}>{t.label}</Text>{t.label==='السلة'&&cartCount>0?<Text style={styles.navCount}>{cartCount}</Text>:null}</Pressable>)}</View>

  <Modal visible={!!detail} transparent animationType="slide" onRequestClose={()=>setDetail(null)}><View style={styles.modalShade}><View style={styles.modalCard}><Pressable onPress={()=>setDetail(null)}><Text style={styles.modalClose}>✕</Text></Pressable><ScrollView><Text style={styles.detailTitle}>{detail?.name}</Text><Text style={styles.productCategory}>{detail?.category}</Text><Text style={styles.detailDesc}>{detail?.description||'لا توجد تفاصيل إضافية لهذا المنتج.'}</Text><Text style={styles.productPrice}>{detail?.price==null?'السعر غير محدد':money(Number(detail.price),country,rate)}</Text>{detail?<Button title="أضف إلى السلة" onPress={()=>{addToCart(detail);setDetail(null)}} disabled={detail.price==null||Number(detail.price)<=0}/>:null}</ScrollView></View></View></Modal>

  <Modal visible={checkoutOpen} transparent animationType="slide" onRequestClose={()=>setCheckoutOpen(false)}><View style={styles.modalShade}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.checkoutCard}><ScrollView keyboardShouldPersistTaps="handled"><Pressable onPress={()=>setCheckoutOpen(false)}><Text style={styles.modalClose}>✕</Text></Pressable><Text style={styles.detailTitle}>إتمام الطلب</Text><Field label="الاسم" value={customerName} onChangeText={setCustomerName}/><Field label="رقم الجوال" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/><Field label="عنوان التوصيل" value={address} onChangeText={setAddress} multiline/><Text style={styles.fieldLabel}>بلد التوصيل</Text><View style={styles.inlineActions}><Chip title="السعودية" active={country==='SA'} onPress={()=>setCountry('SA')}/><Chip title="اليمن" active={country==='YE'} onPress={()=>setCountry('YE')}/></View><Text style={styles.fieldLabel}>طريقة الشحن</Text><View style={styles.inlineActions}><Chip title="توصيل إلى المنزل" active={shipping==='توصيل إلى المنزل'} onPress={()=>setShipping('توصيل إلى المنزل')}/><Chip title="التنسيق مع المتجر" active={shipping==='التنسيق مع المتجر'} onPress={()=>setShipping('التنسيق مع المتجر')}/></View><Text style={styles.fieldLabel}>وسيلة الدفع المتاحة</Text>{paymentMethods.length?paymentMethods.map(m=><Pressable key={m.id} onPress={()=>setSelectedPayment(m.id)} style={[styles.paymentRow,selectedPayment===m.id&&styles.paymentSelected]}><Text style={styles.paymentRadio}>{selectedPayment===m.id?'◉':'○'}</Text><View style={{flex:1}}><Text style={styles.featureTitle}>{m.name}</Text><Text style={styles.featureDesc}>{m.instructions||'تعليمات الدفع تظهر عند اختيار الوسيلة.'}</Text>{m.account_holder?<Text style={styles.muted}>المستفيد: {m.account_holder}</Text>:null}{m.account_number?<Text style={styles.muted}>رقم الحساب: {m.account_number}</Text>:null}{m.account_iban?<Text style={styles.muted}>IBAN: {m.account_iban}</Text>:null}</View></Pressable>):<Empty title="لا توجد وسيلة دفع مفعّلة" desc="لا يمكن إرسال الطلب حتى تتوفر وسيلة دفع معتمدة من لوحة المتجر."/>}<Field label="اسم الشخص المحوِّل" value={payerName} onChangeText={setPayerName}/><Field label="رقم مرجع الحوالة" value={paymentReference} onChangeText={setPaymentReference}/><Text style={styles.muted}>إرسال الطلب لا يعني تأكيد الدفع. يتم التحقق من الدفع لدى المتجر قبل اعتماده.</Text><Button title={busy?'جارٍ إرسال الطلب...':'تأكيد وإرسال الطلب'} onPress={checkout} disabled={busy||!paymentMethods.length}/></ScrollView></KeyboardAvoidingView></View></Modal>
  {busy?<View style={styles.busyOverlay}><ActivityIndicator color={C.goldLight} size="large"/></View>:null}
 </SafeAreaView>;
}

function ProductImage({uri}:{uri:string}){const [failed,setFailed]=useState(false);return failed?<View style={styles.imageFallback}><Text style={styles.productGem}>◇</Text></View>:<Image source={{uri}} style={StyleSheet.absoluteFillObject} resizeMode="contain" onError={()=>setFailed(true)}/>}
function Empty({title,desc,action,onAction}:any){return <View style={styles.empty}><Text style={styles.emptyGem}>◇</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDesc}>{desc}</Text>{action?<Button title={action} onPress={onAction}/>:null}</View>}
function Chip({title,active,onPress}:any){return <Pressable onPress={onPress} style={[styles.chip,active&&styles.chipActive]}><Text style={[styles.chipText,active&&styles.chipTextActive]}>{title}</Text></Pressable>}
function makeRequestId(){return 'apex-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)}

const styles=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.background},flex:{flex:1},content:{padding:15,paddingBottom:30},topBar:{minHeight:90,paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#080C15',borderBottomWidth:1,borderBottomColor:'rgba(214,180,106,0.34)'},topActions:{flexDirection:'row',gap:8},topIcon:{width:40,height:40,borderRadius:14,backgroundColor:'rgba(255,255,255,0.055)',borderWidth:1,borderColor:'rgba(226,232,242,0.14)',alignItems:'center',justifyContent:'center'},topIconText:{color:C.white,fontSize:21},searchIcon:{color:C.white,fontSize:28},brandBlock:{alignItems:'center'},crown:{color:C.goldLight,fontSize:22},brand:{color:C.goldLight,fontSize:29,fontWeight:'900',letterSpacing:5},tagline:{color:'#B9C2D1',fontSize:7,letterSpacing:1.3},badge:{position:'absolute',right:-4,top:-5,minWidth:17,height:17,borderRadius:9,backgroundColor:C.gold,alignItems:'center',justifyContent:'center',paddingHorizontal:3},badgeText:{color:'#111318',fontSize:9,fontWeight:'900'},hero:{minHeight:210,borderRadius:24,overflow:'hidden',backgroundColor:'#0A1222',borderWidth:1.2,borderColor:C.gold,alignItems:'flex-end',justifyContent:'center',padding:20,marginBottom:15},heroBlueOrb:{position:'absolute',width:230,height:230,borderRadius:120,backgroundColor:'#0A4D9B',right:-90,bottom:-140,opacity:.8},heroGoldHalo:{position:'absolute',width:170,height:170,borderRadius:90,borderWidth:1,borderColor:'rgba(232,199,120,.25)',left:-70,top:20},heroKicker:{color:'#D7C99F',fontSize:8,letterSpacing:1.3},heroTitle:{color:'#F2D58F',fontSize:30,fontWeight:'900',marginTop:8},heroSubtitle:{color:C.white,fontSize:14,fontWeight:'700',marginTop:4,marginBottom:12},heroCrown:{position:'absolute',left:16,bottom:6,color:C.goldLight,fontSize:70,opacity:.75},servicesRow:{flexDirection:'row',gap:8,marginBottom:22},serviceCard:{flex:1,minHeight:92,borderRadius:17,backgroundColor:'rgba(15,27,46,.9)',borderWidth:1,borderColor:'rgba(214,180,106,.48)',alignItems:'center',justifyContent:'center',padding:5},serviceIcon:{color:C.goldLight,fontSize:24},serviceLabel:{color:C.white,fontSize:10,fontWeight:'800',textAlign:'center',marginTop:6},sectionHeading:{flexDirection:'row',alignItems:'center',gap:8,marginTop:15,marginBottom:13},headingLine:{flex:1,height:1,backgroundColor:'rgba(214,180,106,.45)'},sectionTitle:{color:C.white,fontSize:17,fontWeight:'900'},link:{color:'#8BC8FF',fontSize:11,fontWeight:'800'},categoriesGrid:{flexDirection:'row',gap:8,marginBottom:12},categoryCard:{flex:1,minHeight:100,borderRadius:15,backgroundColor:'#E6EAF1',alignItems:'center',justifyContent:'center',padding:8},categoryIcon:{color:C.gold,fontSize:26},categoryName:{color:'#171C26',fontSize:10,fontWeight:'900',textAlign:'center'},productGrid:{padding:15,gap:10,paddingBottom:35},productCard:{flex:1,minWidth:0,borderRadius:17,backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:'rgba(214,180,106,.32)',padding:9,marginBottom:10},productImageWrap:{height:120,borderRadius:12,backgroundColor:'#111D30',alignItems:'center',justifyContent:'center',overflow:'hidden'},imageHint:{position:'absolute',opacity:0},imageFallback:{flex:1,alignItems:'center',justifyContent:'center'},productGem:{color:C.goldLight,fontSize:38},fav:{position:'absolute',top:15,left:15,width:30,height:30,borderRadius:15,backgroundColor:'#05070DCC',alignItems:'center',justifyContent:'center'},productCategory:{color:'#8BC8FF',fontSize:9,marginTop:8,textAlign:'right'},productName:{color:C.white,fontSize:12,fontWeight:'800',textAlign:'right',minHeight:34,marginTop:4},productPrice:{color:C.goldLight,fontSize:13,fontWeight:'900',textAlign:'right',marginTop:7},productActions:{flexDirection:'row',gap:5,marginTop:8},button:{backgroundColor:C.goldLight,borderRadius:13,paddingHorizontal:11,paddingVertical:9,alignItems:'center',justifyContent:'center',marginTop:7,flex:1},buttonText:{color:'#17130A',fontSize:10,fontWeight:'900'},buttonSecondary:{backgroundColor:'rgba(255,255,255,.07)',borderWidth:1,borderColor:'rgba(214,180,106,.38)'},buttonSecondaryText:{color:C.goldLight},disabled:{opacity:.45},pressed:{opacity:.78},fieldWrap:{marginTop:12},fieldLabel:{color:'#E5D4A6',fontSize:11,fontWeight:'800',textAlign:'right',marginBottom:5},input:{width:'100%',minHeight:45,borderWidth:1,borderColor:'rgba(214,180,106,.38)',borderRadius:12,backgroundColor:'rgba(255,255,255,.05)',color:C.white,paddingHorizontal:12,paddingVertical:10,fontSize:13},multiline:{minHeight:75,textAlignVertical:'top'},muted:{color:'#AEB9CB',fontSize:10,textAlign:'right',marginTop:6,lineHeight:17},message:{padding:9,backgroundColor:'#142238',borderBottomWidth:1,borderColor:C.gold},messageText:{color:C.white,textAlign:'center',fontSize:11},bannerCard:{width:260,minHeight:105,backgroundColor:'#102344',borderRadius:16,borderWidth:1,borderColor:C.gold,padding:15,marginRight:10,justifyContent:'center'},bannerTitle:{color:C.goldLight,fontSize:18,fontWeight:'900',textAlign:'right'},bannerSubtitle:{color:C.white,fontSize:11,textAlign:'right',marginTop:5},featureCard:{flexDirection:'row',alignItems:'center',gap:12,minHeight:68,padding:12,borderRadius:15,borderWidth:1,borderColor:'rgba(214,180,106,.28)',backgroundColor:'rgba(255,255,255,.05)',marginBottom:8},featureIcon:{color:C.goldLight,fontSize:23,width:32,textAlign:'center'},featureTitle:{color:C.white,fontSize:13,fontWeight:'800',textAlign:'right'},featureDesc:{color:'#AEB9CB',fontSize:9,textAlign:'right',marginTop:3},featureArrow:{color:C.goldLight,fontSize:24},footer:{color:'#7D8798',textAlign:'center',fontSize:8,letterSpacing:1.4,marginTop:22},bottomNav:{minHeight:68,backgroundColor:'#080C15',borderTopWidth:1,borderTopColor:'rgba(214,180,106,.42)',flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:4},tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:55,gap:3},activeTab:{borderWidth:1,borderColor:'rgba(232,199,120,.7)',borderRadius:16,backgroundColor:'rgba(214,180,106,.1)',marginHorizontal:2},tabIcon:{color:'#C7D0DF',fontSize:18},activeTabIcon:{color:C.goldLight,fontSize:21},tabLabel:{color:'#C7D0DF',fontSize:9,fontWeight:'700'},activeTabLabel:{color:C.goldLight,fontWeight:'900'},navCount:{position:'absolute',top:1,right:'18%',color:C.goldLight,fontSize:8},empty:{minHeight:220,alignItems:'center',justifyContent:'center',padding:25,borderRadius:20,borderWidth:1,borderColor:'rgba(214,180,106,.28)',backgroundColor:'rgba(255,255,255,.035)',marginVertical:12},emptyGem:{color:C.goldLight,fontSize:40},emptyTitle:{color:C.white,fontSize:16,fontWeight:'900',textAlign:'center',marginTop:8},emptyDesc:{color:'#AEB9CB',fontSize:11,textAlign:'center',lineHeight:19,marginTop:7},cartRow:{padding:13,borderRadius:15,borderWidth:1,borderColor:'rgba(214,180,106,.3)',marginBottom:9,backgroundColor:'rgba(255,255,255,.05)'},qtyRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:8},qtyText:{color:C.white,fontWeight:'900'},totalCard:{padding:16,borderRadius:18,borderWidth:1,borderColor:C.gold,backgroundColor:'#111827',marginTop:15},totalLabel:{color:C.white,fontSize:12,textAlign:'right'},total:{color:C.goldLight,fontSize:22,fontWeight:'900',textAlign:'right',marginVertical:7},orderCard:{padding:15,borderRadius:17,borderWidth:1,borderColor:'rgba(214,180,106,.35)',backgroundColor:'rgba(255,255,255,.05)',marginBottom:11},orderHead:{flexDirection:'row',justifyContent:'space-between',gap:8,alignItems:'center'},orderId:{color:C.goldLight,fontWeight:'900'},orderStatus:{color:'#8BC8FF',fontSize:11,fontWeight:'800'},accountCard:{alignItems:'center',padding:20,borderRadius:20,borderWidth:1,borderColor:C.gold,backgroundColor:'#111827',marginBottom:14},accountCrown:{fontSize:42,color:C.goldLight},accountName:{fontSize:21,color:C.goldLight,fontWeight:'900'},walletBalance:{fontSize:14,color:C.white,marginTop:10},inlineActions:{flexDirection:'row',gap:10,justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',marginTop:10},privacyText:{color:'#BFC9D9',fontSize:10,lineHeight:18,textAlign:'right',marginTop:12},privacyRow:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:8,marginVertical:12},privacyCheck:{color:C.goldLight,fontSize:22},chips:{paddingHorizontal:15,paddingBottom:8,gap:8,alignItems:'center'},chip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,borderWidth:1,borderColor:'rgba(214,180,106,.4)',backgroundColor:'#101827'},chipActive:{backgroundColor:C.goldLight},chipText:{color:C.goldLight,fontSize:10,fontWeight:'800'},chipTextActive:{color:'#17130A'},searchWrap:{paddingHorizontal:15},modalShade:{flex:1,backgroundColor:'#000C',justifyContent:'flex-end'},modalCard:{maxHeight:'85%',backgroundColor:'#0C1422',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:C.gold,padding:18},modalClose:{color:C.goldLight,fontSize:24,textAlign:'left'},detailTitle:{color:C.goldLight,fontSize:22,fontWeight:'900',textAlign:'right',marginVertical:10},detailDesc:{color:C.white,fontSize:13,textAlign:'right',lineHeight:22},checkoutCard:{maxHeight:'92%',backgroundColor:'#0C1422',borderTopLeftRadius:24,borderTopRightRadius:24,borderWidth:1,borderColor:C.gold,padding:17},paymentRow:{flexDirection:'row',gap:10,padding:12,borderRadius:13,borderWidth:1,borderColor:'rgba(214,180,106,.25)',marginTop:8},paymentSelected:{borderColor:C.gold,backgroundColor:'rgba(214,180,106,.1)'},paymentRadio:{color:C.goldLight,fontSize:20},busyOverlay:{position:'absolute',top:0,left:0,right:0,bottom:68,backgroundColor:'#0005',alignItems:'center',justifyContent:'center'},aiBubble:{padding:13,borderRadius:15,marginBottom:9,maxWidth:'90%'},aiUser:{alignSelf:'flex-start',backgroundColor:'#15345A',borderWidth:1,borderColor:'#3B82C4'},aiAssistant:{alignSelf:'flex-end',backgroundColor:'#201B10',borderWidth:1,borderColor:C.gold},aiText:{color:C.white,fontSize:13,textAlign:'right',lineHeight:21},aiComposer:{flexDirection:'row',alignItems:'center',gap:8,padding:12,borderTopWidth:1,borderColor:C.border,backgroundColor:'#080C15'},aiInput:{flex:1,minHeight:44,borderWidth:1,borderColor:C.border,borderRadius:13,paddingHorizontal:12,color:C.white},accountSectionTitle:{color:C.goldLight,fontSize:20,fontWeight:'900',textAlign:'right'},headingDiamond:{color:C.gold},flexGrow:{flexGrow:1}
});
