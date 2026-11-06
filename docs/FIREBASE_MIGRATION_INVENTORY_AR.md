# جرد ترحيل APEX من Supabase إلى Firebase

> الحالة: جرد موثق وتجهيز آمن فقط. هذا الملف لا ينفذ نقل بيانات ولا يغيّر المتجر الحي.

## المشاريع والفروع

- مستودع التطبيق: `almhmdey8-code/APEX-`
- فرع الإنتاج الحالي: `main` — ما زال يستخدم Supabase.
- فرع العمل المعزول: `firebase-migration-prep`.
- مشروع Firebase المستهدف في `.firebaserc`: `apex-3c12f`.
- مشروع Supabase المصدر: `ulzxdvtzziydhuvennzw` (ACTIVE_HEALTHY وقت الجرد).
- لا تدمج فرع الترحيل في `main` قبل اكتمال الاختبارات ومراجعة الفروقات.

## ما تأكد من قاعدة البيانات

### مجموعات Firestore المقترحة

| Supabase table | Firestore collection | ملاحظات |
|---|---|---|
| apex_products | products | وثائق بمعرّف ثابت من رقم المنتج القديم؛ 21 سجلًا |
| apex_orders | orders | وثائق بمعرّف ثابت؛ تحفظ items وحقول الدفع والشحن والحالة |
| apex_admins | admins | لا تُمنح صلاحية المدير من بيانات العميل؛ Custom Claims موثوقة |
| apex_banners | banners | ترتيب sort_order وحالة active |
| apex_payment_methods | paymentMethods | لا تُخزن مفاتيح بوابات الدفع هنا |
| apex_wallets | wallets | وثيقة واحدة لكل uid؛ لا يسمح للعميل بتعديل الرصيد |
| apex_wallet_transactions | walletTransactions | سجل مالي append-only |
| apex_referral_codes | referralCodes | الكود فريد، ويرتبط بـ uid |
| apex_referral_signups | referralSignups | referred uid فريد |
| apex_store_settings | storeSettings | وثيقة currency |
| apex_wallet_topups | walletTopups | مراجعة المدير عبر Cloud Functions |
| apex_referral_rewards | referralRewards | المكافآت تنشأ خادمياً فقط |
| apex_order_status_history | orderStatusHistory | سجل حالات الطلب append-only |
| apex_order_refunds | orderRefunds | الاسترداد عملية خادمية |
| apex_shipping_providers | shippingProviders | بيانات عامة فقط؛ الأسرار في Secret Manager |
| apex_security_events | securityEvents | كتابة خادمية فقط، مع تقليل البيانات الشخصية |
| apex_email_settings | emailSettings | إعدادات خادمية |
| apex_email_cron_auth | (Secret Manager) | لا تنقل قيمة التجزئة كوثيقة قابلة للقراءة العامة |
| apex_referral_visits | referralVisits | معرّف مركب آمن من code + visitor hash |
| private.apex_gateway_transactions | privateGatewayTransactions | خادمية فقط |
| private.apex_payment_webhook_events | paymentWebhookEvents | خادمية فقط؛ deduplication للـ webhook |
| private.apex_shipping_jobs | shippingJobs | خادمية فقط |

## وظائف Supabase المطلوب إعادة بنائها

| Edge Function | المقابل المقترح في Firebase |
|---|---|
| apex-wallet-checkout | Callable Cloud Function مع Firestore transaction |
| apex-create-order | Callable Cloud Function؛ إعادة حساب السعر والمخزون خادمياً |
| apex-admin-customers | Callable Cloud Function؛ تحقق Auth + admin custom claim |
| apex-ai-guard | HTTPS/Callable Function؛ لا تكشف OPENAI_API_KEY |
| apex-email-campaign | Callable Function؛ Resend key في Secret Manager وفحص موافقة التسويق |
| apex-store-assistant | HTTPS/Callable Function؛ قراءة بيانات المتجر والطلب بعد تحقق هوية المستخدم |

## قواعد سلامة لا يجوز تجاوزها

1. لا تثق بسعر أو إجمالي أو مخزون أو صلاحية مدير يرسلها المتصفح.
2. جميع عمليات الطلب والمحفظة والاسترداد وشحن الرصيد ومراجعة الدفع تنفذ خادمياً داخل معاملات Firestore عند الحاجة.
3. لا تسمح للعميل بالكتابة المباشرة إلى wallets أو walletTransactions أو paymentWebhookEvents أو gateway transactions أو shippingJobs أو securityEvents.
4. صلاحية المدير عبر Firebase Auth Custom Claims تضبطها عملية إدارية موثوقة فقط؛ لا تعتمد على custom user profile fields.
5. أسرار بوابات الدفع وOpenAI وResend تحفظ في Firebase Secret Manager، ولا تكتب في Firestore أو ملفات Git.
6. Webhooks تتحقق من توقيع المزود وتمنع معالجة event id أكثر من مرة.
7. احتفظ بمعرّفات Supabase الأصلية في حقل legacyId لضمان التتبع ومنع التكرار.
8. لا تحذف Supabase ولا تغيّر عنوان API في المتجر قبل اكتمال التحقق والمقارنة.

## خطة التنفيذ المرتبة

- [x] تحديد فرع ترحيل منفصل ومشروع Firebase المستهدف.
- [x] جرد مخطط الجداول العامة والخاصة وعدد السجلات المعروف.
- [x] حصر Edge Functions الستة والتحقق من نسخها الحية وإصداراتها في مشروع Supabase.
- [x] تشغيل اختبارات Firestore Security Rules على Emulator بنجاح في GitHub Actions run `42292247193` (commit `3e8cd1266d9cf9cc783e3e7f07f73c6dffebcfe1`).
- [ ] فحص Auth users وطرق الدخول وتحديد ترحيل كلمات المرور (لا تفترض إمكانية نقل password hashes).
- [x] إنشاء قواعد Firestore مغلقة افتراضياً واختبارات Emulator؛ اجتازت الاختبارات الحالية. ما زال اعتماد نموذج الوصول النهائي لكل مجموعة مطلوباً قبل فتح أي صلاحية.
- [ ] بناء Cloud Functions الستة مع اختبارات وحدات وتكامل.
- [ ] تصدير بيانات Supabase إلى ملف محلي مؤقت آمن ثم استيرادها إلى Firestore مع تقرير counts/checksums؛ لا تضع بيانات العملاء في Git.
- [ ] نقل ملفات Storage مع الحفاظ على الروابط أو تحديثها.
- [ ] بناء مسار مصادقة Firebase ومزامنة جلسات المستخدم.
- [ ] تحويل واجهة المتجر ولوحة الإدارة إلى Firebase في فرع الترحيل فقط.
- [ ] اختبار تسجيل الدخول والتسجيل واستعادة الحساب والمنتجات والسلة والطلبات والدفع والمحفظة والإحالات والشحن والإدارة والمساعد.
- [ ] تشغيل مقارنة قراءة مزدوجة قبل التحويل النهائي.
- [ ] تحويل الإنتاج بعد موافقة المستخدم والتحقق من نجاح جميع اختبارات القبول.

## ملاحظات الجرد

- الجداول العامة المفحوصة مفعّل عليها RLS.
- ظهر تحذير أمني حرج في المخطط الخاص: RLS غير مفعّل على `private.apex_gateway_transactions` و`private.apex_payment_webhook_events` و`private.apex_shipping_jobs`. لم يتم تعديلها تلقائياً؛ يجب مراجعة سياسات الوصول قبل أي تغيير.
- أعداد السجلات المرصودة وقت الجرد: products 21، banners 1، payment methods 8، wallets 2، admins 1، referral codes 2، security events 9؛ orders 0 وبقية السجلات المذكورة كانت 0.
- لا يشمل الجرد ملفات Storage أو مستخدمي Auth أو محتوى جميع سجلات الجداول.
