# تجهيز Firebase لمتجر APEX

المشروع المستهدف: `apex-3c12f` — المنطقة: `us-central1`.

## ما أصبح موجوداً في المستودع

- Firebase Auth مع تسجيل بريد وكلمة مرور، استعادة كلمة المرور، وتسجيل عميل برمز OTP من 6 أرقام.
- طبقة توافق للواجهة الحالية تنقل طلبات Auth وFirestore وStorage وCallable Functions إلى Firebase عند وجود إعداد Web App.
- وظائف Cloud Functions للطلبات، شراء المحفظة، العملاء، الحماية، حملات البريد، ومساعد المتجر.
- عمليات محفظة إضافية: طلب شحن يدوي، اعتماد/رفض الشحن، واسترداد الطلب إلى المحفظة.
- قواعد Firestore/Storage وفهارس أساسية.
- Supabase يبقى fallback محفوظاً؛ لا تحذف بياناته.

## خطوات التفعيل المطلوبة في Firebase Console

1. افتح مشروع `apex-3c12f` وأنشئ Web App باسم APEX Store.
2. فعّل Authentication > Email/Password.
3. أنشئ Firestore Database وStorage في المشروع نفسه.
4. انسخ إعدادات Web App العامة إلى الملف المحلي المتجاهل `firebase/runtime-config.js` اعتماداً على `firebase/runtime-config.example.js`. هذا الملف لا يُرفع إلى GitHub. لا تضع فيه Service Account أو مفاتيح بوابات الدفع.
5. أضف النطاق المنشور إلى Authorized Domains في Authentication.
6. اضبط أسرار الوظائف من بيئة موثوقة:
   `firebase functions:secrets:set RESEND_API_KEY`
   `firebase functions:secrets:set OPENAI_API_KEY`
   `firebase functions:secrets:set APEX_SECURITY_HASH_SALT`
7. أنشئ مستند المدير يدوياً في Firestore على `admins/{Firebase Auth UID}` بقيم `active: true` و`role: "admin"`. لا تمنح هذا الدور لأي حساب آخر.
8. لتفعيل رفع صور لوحة الإدارة، امنح الحساب Custom Claim باسم `admin: true` باستخدام:
   `node functions/scripts/set-admin-claim.js FIREBASE_AUTH_UID`
   شغّل الأمر فقط من Cloud Shell أو جهاز موثوق بعد تسجيل Application Default Credentials.
9. اختبر Auth وOTP والطلبات والمحفظة والصلاحيات في Emulator/بيئة اختبار أولاً. بعد ذلك فقط انشر القواعد والوظائف.

## ملاحظات تشغيلية مهمة

- وظائف الطلبات الحالية تعتمد طرق الدفع اليدوية فقط. لا تعتبر Tabby أو Tamara أو PayPal أو Moyasar متصلة حتى تضاف مفاتيحها في Secret Manager وتُبنى webhooks وتنجح اختبارات sandbox لكل بوابة.
- لا يتم شحن المحفظة إلا بعد اعتماد المدير لطلب تحويل يدوي. لا يكتب العميل الرصيد مباشرة.
- صلاحية المدير لا تأتي من البريد وحده؛ يجب وجود مستند المدير المعتمد.
- إعدادات Firebase العامة غير متوفرة في المستودع بعد، لذلك يبقى مسار Firebase غير نشط حتى يضاف الملف المحلي.
- لم يتم نسخ بيانات Supabase أو المستخدمين أو الطلبات إلى Firestore. ترحيل بيانات الإنتاج يحتاج خطة نسخ/مطابقة وموافقة منفصلة؛ لا تحذف Supabase.
- لا يوجد نشر إنتاجي من هذا الفرع. طلب الدمج #11 يبقى مسودة حتى اكتمال الاختبارات والمراجعة.
