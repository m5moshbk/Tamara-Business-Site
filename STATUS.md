# حالة بوابة الدفع | Payment Gateway Status

> آخر تحديث / Last updated: 2026-10-28 UTC

## العربية

- **المستودع:** `m5moshbk/Tamara-Business-Site`
- **فرع الإصلاح المعزول:** `fix/payment-gateway-fail-closed`
- **الخدمة الحالية:** [beefitness-payments-gateway](https://beefitness-payments-gateway.onrender.com) تعمل من الفرع `main`. لم تُنشر تغييرات هذا الفرع.
- **المشكلات المكتشفة:** قبول جلسات موقّعة بسر فارغ عند غياب إعداد المصادقة؛ قبول Webhooks دون تحقق توقيع مزود موثوق؛ واحتساب طلبات المعاينة على أنها مدفوعة.
- **التغييرات:** جعل الجلسات تفشل مغلقًا، وتعطيل معالجة Webhooks حتى يكتمل التحقق الرسمي، ووضع حالة `preview` للطلبات التجريبية، وإضافة اختبارات Node وتوثيق عربي/إنجليزي.
- **الاختبارات:** CI بعد إضافة الاختبارات قيد التحقق.
- **الإطلاق:** `PAYMENT_MODE=preview` هو الوضع الافتراضي. مسار الدفع الحقيقي يعيد `501`، ولا ينبغي تفعيل الدفع الحي قبل تكامل رسمي واختبارات sandbox وتوقيع Webhooks موثوق.
- **التخزين:** الطلبات والأحداث محفوظة في الذاكرة حاليًا وتُفقد عند إعادة تشغيل الخدمة.
- **الأسرار:** لم تُقرأ أو تُعدّل أي قيم أسرار. يجب ضبط `ADMIN_USERNAME` و`ADMIN_PASSWORD_HASH` و`ADMIN_SESSION_SECRET` في Render دون مشاركة قيمها.

### المتبقي قبل الإنتاج
1. التأكد من نجاح CI.
2. تنفيذ تحقق توقيع خاص بكل مزود حسب الوثائق الرسمية.
3. إضافة تخزين دائم للطلبات والأحداث.
4. مراجعة نطاقات العودة وCORS وتدفقات sandbox.
5. عدم تغيير وضع الدفع إلى `live` أو نشر الإصلاح قبل المراجعة.

## English

- **Repository:** `m5moshbk/Tamara-Business-Site`
- **Isolated fix branch:** `fix/payment-gateway-fail-closed`
- **Current service:** [beefitness-payments-gateway](https://beefitness-payments-gateway.onrender.com) runs from `main`. This branch has not been deployed.
- **Issues found:** empty-secret session acceptance when auth configuration is missing; webhooks accepted without trusted provider-signature verification; and preview orders counted as paid.
- **Changes:** fail closed on incomplete session configuration, disable webhook processing until official verification exists, mark preview orders as `preview`, and add Node tests plus bilingual documentation.
- **Tests:** CI after adding the test suite is pending verification.
- **Release:** `PAYMENT_MODE=preview` remains the default. Live checkout returns `501`; do not enable live payments before official provider integration, sandbox tests, and trusted webhook-signature verification.
- **Storage:** orders and events are currently in memory and are lost on restart.
- **Secrets:** no secret values were read or changed. Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET` in Render without sharing their values.

### Production blockers
1. Confirm CI passes.
2. Implement provider-specific signature verification according to official documentation.
3. Add durable order and event storage.
4. Review return URL allow-lists, CORS, and sandbox flows.
5. Do not switch payment mode to `live` or deploy the fix before review.

## بصمة المشروع | Project fingerprint
- Owner: Ahmed jafari
- Signature / rights tag: M5mOsH
- Contact: +99507190799
