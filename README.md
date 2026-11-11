# APEX — متجر إلكتروني

واجهة متجر APEX ولوحة المدير المستقلة، مع Supabase كخلفية تشغيل وحيدة.

- [افتح المتجر](https://almhmdey8-code.github.io/APEX-/)
- [لوحة المدير](https://almhmdey8-code.github.io/APEX-/admin.html)
- [سياسة الخصوصية](https://almhmdey8-code.github.io/APEX-/privacy.html)

## بنية المشروع

- `index.html`: واجهة العميل.
- `admin.html`: لوحة الإدارة.
- `privacy.html`: سياسة الخصوصية.
- `supabase/functions/`: الوظائف الخلفية الست.
- `supabase/migrations/`: سجل ترحيلات قاعدة البيانات المطابق للمشروع الحي.
- `android/`: تطبيق Android مستقل مبني على WebView للمتجر.

**Firebase غير مستخدم في النسخة الحالية.** لا تضع مفاتيح الخدمة أو مفاتيح الدفع أو مفاتيح شركات الشحن داخل ملفات الواجهة.

راجع [تقرير التكامل وجاهزية الإطلاق](APP_INTEGRATION.md) لمعرفة الاختبارات المنفذة والعناصر التي تمنع الإطلاق العام.
