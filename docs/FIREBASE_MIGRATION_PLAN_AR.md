# خطة نقل متجر APEX إلى Firebase

## الحالة
هذه مرحلة تجهيز آمنة على الفرع `firebase-migration-prep`. لم يتم تغيير واجهة المتجر المنشورة، ولم يتم حذف أو تعديل بيانات Supabase، ولم يتم نشر أي إعداد إلى Firebase.

## الخدمات المستهدفة
- Firebase Authentication لحسابات العملاء والمديرين.
- Cloud Firestore للكتالوج والطلبات والمحافظ والإعدادات وسجل الدعوات.
- Cloud Storage لصور المنتجات والبنرات المرفوعة من لوحة المدير.
- Cloud Functions للخدمات الحساسة التي تعمل حالياً على خادم موثوق.
- Firebase App Check بعد إعداد التطبيقات والنطاقات المدعومة.

## تدفق البريد الحالي
التسجيل في `index.html` يستخدم `signInWithOtp({ email })` ثم `verifyOtp({ email, token, type: 'email' })`، ويتحقق من رمز رقمي من 6 أرقام قبل إكمال الملف الشخصي. لا يجوز استبدال هذا بصمت برابط تحقق؛ فهما تجربتان مختلفتان.

المسار المقترح للحفاظ على التجربة:
1. وظيفة خادمية `sendSignupCode` تنشئ رمزاً عشوائياً، تحفظ بصمته فقط مع وقت انتهاء قصير وحد للمحاولات والإرسال، وترسله عبر مزود بريد.
2. وظيفة `verifySignupCode` تتحقق من الرمز مرة واحدة، ثم تنشئ/تؤكد حساب Firebase Auth وتعيد Custom Token.
3. المتصفح يسجل الدخول باستخدام Custom Token ثم يحفظ بيانات الملف الشخصي في Firestore وفق قواعد مقيدة.
4. استعادة كلمة المرور ورسائل تغيير البريد تستخدم تدفقات Firebase الرسمية، بعد ضبط قالب البريد والنطاقات المسموح بها.

يلزم إعداد مزود بريد (SMTP أو Resend أو غيره) كمفتاح سري في بيئة Functions. لا يوضع أي مفتاح بريد أو Admin SDK أو OpenAI في ملفات HTML.

## نطاق البيانات المكتشف في الواجهة
الجداول المشار إليها في الكود تشمل:
- `apex_store_settings`
- `apex_products`
- `apex_banners`
- `apex_payment_methods`
- `apex_wallets`
- `apex_wallet_transactions`
- `apex_referral_codes`
- `apex_referral_signups`
- `apex_referral_rewards`
- `apex_wallet_topups`
- `apex_referral_visits`
- `apex_order_status_history`
- `apex_orders`
- كما تستخدم لوحة المدير جداول `apex_admins` و`apex_security_events` و`apex_email_settings` و`apex_shipping_providers`.

وتستخدم الواجهة إجراءات خادمية/RPC تشمل:
- `apex_track_referral_visit`
- `apex_request_wallet_topup`
- `apex_claim_referral_code`
- `apex_create_order`
- `apex_wallet_checkout`
- `apex_admin_review_wallet_topup`
- `apex_admin_refund_order_to_wallet`
- `apex-store-assistant`
- `apex-ai-guard`
- `apex-admin-customers`
- `apex-create-order`
- `apex-wallet-checkout`

## بوابة الأمان
قواعد Firestore الحالية في هذا الفرع تمنع كل قراءة وكتابة من العميل عمداً. لا تفتح القواعد العامة لتسهيل الاختبار. يجب تصميم صلاحيات كل مجموعة على حدة، والتحقق من هوية المدير من Custom Claims موثوقة، لا من بريد مخفي في الواجهة أو قيمة يرسلها المتصفح.

عمليات المحفظة، استرداد الأموال، إنشاء الطلبات، مراجعة الشحنات، ومكافآت الدعوات يجب أن تبقى في وظائف خادمية ذات تحقق من المستخدم، وتحقق من الأسعار والمخزون، ومنع التكرار (idempotency)، وسجل تدقيق.

## عناصر تمنع إكمال النقل الآمن حتى الآن
1. ملفات إنشاء الطلب والدفع من المحفظة والإدارة الأمنية والعملاء والشحن غير موجودة ضمن شجرة Supabase Functions في المستودع الحالي؛ توجد استدعاءات لها في HTML، لكن لا توجد مصادر تنفيذ يمكن تحويلها بأمان.
2. ملفات migrations القديمة التي تنشئ المخطط الكامل وسياسات RLS ليست محفوظة في المستودع. الموجود فقط خمس migrations حديثة، ولذلك لا يمكن استنتاج كل الأعمدة والعلاقات أو استيراد البيانات اعتماداً على هذا المستودع.
3. لا توجد نسخة تصدير من بيانات Supabase أو مخطط قاعدة البيانات الكامل.
4. لم يتم تأكيد تفعيل Firestore وAuthentication وStorage وCloud Functions في مشروع Firebase.
5. لا توجد بيانات مزود البريد المطلوبة لإرسال رمز رقمي من 6 أرقام.

## ترتيب التنفيذ المطلوب
1. استعادة SQL schema الكامل وRLS ونسخ وظائف Supabase Edge Functions.
2. إنشاء نموذج Firestore ومخطط تحقق للبيانات مع أدوات استيراد قابلة لإعادة التشغيل.
3. بناء واختبار وظائف البريد والطلبات والمحفظة والإدارة والمساعد الذكي.
4. نقل البيانات مع مطابقة أعداد السجلات والمجاميع المالية والعلاقات.
5. نشر بيئة اختبار، وتشغيل اختبارات عميل/مدير، ثم اختبار البريد والطلبات والمحفظة والرفع.
6. تحويل واجهتي `index.html` و`admin.html` إلى Firebase في تغيير منفصل بعد اجتياز الاختبارات.
7. إبقاء Supabase متاحاً للرجوع حتى اعتماد Firebase نهائياً.

## النشر
لا تشغّل `firebase deploy` في هذه المرحلة. ملف `firebase.json` يعرّف قواعد Firestore فقط، والقواعد مغلقة افتراضياً. إعداد Hosting غير مضاف حتى لا يتغير استضافة GitHub Pages الحالية.
