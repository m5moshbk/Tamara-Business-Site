# بوابة الدفع للأعمال — Tabby وTamara

## العربية

**الحالة:** نموذج أولي بوضع `preview` فقط. هذا المستودع لا يثبت أن المدفوعات الحقيقية مفعّلة أو معتمدة من Tabby أو Tamara.

### الضوابط الحالية
- مصادقة لوحة الإدارة تعتمد `ADMIN_USERNAME` و`ADMIN_PASSWORD_HASH` و`ADMIN_SESSION_SECRET`.
- عند غياب أي متغير من متغيرات مصادقة الإدارة، تُرفض الجلسات مغلقًا.
- طلبات المعاينة تحمل الحالة `preview` ولا تُحتسب مدفوعة أو إيرادًا حقيقيًا.
- Webhooks معطّلة برد `503` حتى تُنفّذ مراجعة توقيع رسمية خاصة بكل مزود.
- وضع `PAYMENT_MODE=live` لا يتيح التحصيل؛ مسار الدفع الحقيقي يرجع `501` إلى أن يكتمل تكامل المزود الرسمي.
- لا تضع مفاتيح API أو كلمات المرور أو أسرار الجلسات في GitHub.

### التشغيل والاختبارات
```bash
npm install
npm test
npm start
```

يستخدم الاختبار `node --test` ولا يحتاج إلى مفاتيح مزود دفع حقيقية. استخدم بيانات اختبار فقط.

### متطلبات ما قبل الإنتاج
1. إكمال تكامل رسمي لكل مزود مع توقيع Webhook موثّق.
2. التحقق من كل انتقال حالة من إشعار موثوق من المزود، لا من تحويل المتصفح.
3. اختبار تدفقات sandbox: الموافقة، الرفض، التفويض، التحصيل، الإلغاء والاسترداد.
4. مراجعة نطاقات العودة وCORS والحد من المعدل.
5. اختيار تخزين دائم وموثوق للطلبات والأحداث؛ التخزين الحالي في الذاكرة يضيع عند إعادة التشغيل.
6. لا تغيّر `PAYMENT_MODE` إلى `live` قبل إتمام هذه المتطلبات.

## English

**Status:** prototype in `preview` mode only. This repository does not prove that real payments are enabled or certified by Tabby or Tamara.

### Current safeguards
- Admin authentication uses `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`.
- If any required admin-auth variable is missing, sessions fail closed.
- Preview orders use status `preview` and are not counted as paid orders or real revenue.
- Webhooks return `503` until provider-specific official signature verification is implemented.
- `PAYMENT_MODE=live` does not enable collection; the live checkout path returns `501` until official provider integration is complete.
- Never commit API keys, passwords, or session secrets to GitHub.

### Run and test
```bash
npm install
npm test
npm start
```

Tests use Node's built-in `node --test` runner and require no real provider credentials. Use test data only.

### Production requirements
1. Implement an official integration for each provider with documented webhook signature verification.
2. Only transition order state from verified provider events, never from browser redirects alone.
3. Test sandbox approval, decline, authorization, capture, cancellation, and refund flows.
4. Review return URL allow-lists, CORS, and rate limiting.
5. Choose durable storage for orders and events; current in-memory storage is lost on restart.
6. Do not set `PAYMENT_MODE=live` until these requirements are complete.

## بصمة المشروع | Project fingerprint
- Owner: Ahmed jafari
- Signature / rights tag: M5mOsH
- Contact: +99507190799
