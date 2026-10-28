# بوابة الدفع للأعمال — Tabby وTamara

**الوصف المختصر:** نموذج أولي لخادم وسيط يهيّئ تدفق الطلبات والتكامل مع Tabby وTamara، مع واجهة ولوحة متابعة.

## الفكرة والهدف
فصل منطق الطلبات وحالة الدفع عن واجهة المتجر، والتحقق من إشعارات مزود الدفع قبل تحديث حالة الطلب. يستهدف المشروع متاجر تحتاج إلى تكامل دفع منظم وقابل للاختبار.

## البنية المقصودة
`Base44 checkout → server-side gateway → Tabby/Tamara → HTTPS webhooks → state updates → dashboard`

## الحالة الحالية
وضع المعاينة مفعّل بحسب التوثيق الحالي. هذا المستودع **ليس دليلًا على أن عمليات الدفع الحقيقية مفعلة أو معتمدة لدى مزودي الدفع**. لا تعتمد عليه لتحصيل أموال فعلية قبل إكمال مفاتيح التاجر واختبارات sandbox والتحقق من webhooks.

## ما يتضمنه التصميم
- إعدادات خادم لمزودي الدفع.
- تقييد CORS عبر `ALLOWED_ORIGIN`.
- Helmet وتحديد معدل الطلبات.
- التحقق من المدخلات باستخدام Zod.
- مراعاة تكرار إشعارات webhooks عند تحديث حالة الطلب.

## قائمة ما قبل الإنتاج
1. توفير مفاتيح sandbox أو الإنتاج من حساب التاجر الرسمي.
2. ضبط رموز Tamara ومفاتيح الإشعارات وفق متطلبات الحساب.
3. التحقق من توقيع ومصادقة webhooks حسب الوثائق الرسمية لكل مزود.
4. ضبط عناوين HTTPS العامة.
5. اختبار حالات الموافقة والرفض والتفويض والتحصيل والإلغاء والاسترداد والانتهاء.
6. عدم تعيين الطلب إلى PAID اعتمادًا على تحويل المتصفح وحده؛ يجب التحقق من حدث مزود موثوق.
7. تفعيل وضع الإنتاج فقط بعد مراجعة أمنية واختبار ناجح.

## التشغيل والأمان
راجع `package.json` وملفات الإعداد لمعرفة أوامر التشغيل الفعلية. لا تضع مفاتيح API أو كلمات مرور أو بيانات شخصية داخل GitHub. استخدم متغيرات بيئة في منصة الاستضافة.

## الملكية
M5mOsH


---

# English Guide

This repository describes a prototype server-side payment gateway flow for Tabby and Tamara, including order-state handling and a dashboard. Documentation and a deployed preview do not mean a merchant account is approved or live payments are enabled.

## Production readiness checklist
1. Use official merchant credentials and sandbox environments first.
2. Configure secrets in the hosting platform, never in Git.
3. Verify webhook signatures and authentication according to each provider's official requirements.
4. Test authorization, capture, rejection, cancellation, refund, expiry, retries, and duplicate webhook delivery.
5. Never mark an order as paid based only on browser redirects; verify a trusted provider event server-side.
6. Switch to production only after security review and successful end-to-end tests.

Review `package.json` and runtime configuration for the actual build and start commands. Do not accept real payments until the integration and merchant configuration have been independently verified.