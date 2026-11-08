import crypto from "node:crypto";
import { z } from "zod";
const schema=z.object({
 payment:z.object({
  amount:z.string().or(z.number()),currency:z.literal("SAR"),description:z.string().min(1),
  buyer:z.record(z.string(),z.unknown()),shipping_address:z.record(z.string(),z.unknown()),
  order:z.record(z.string(),z.unknown()),buyer_history:z.record(z.string(),z.unknown()).optional(),
  order_history:z.array(z.record(z.string(),z.unknown())).optional()
 }).passthrough(),
 lang:z.enum(["ar","en"]).default("ar"),merchant_code:z.string().optional(),
 merchant_urls:z.object({success:z.string().url(),cancel:z.string().url(),failure:z.string().url()}),
 token:z.string().nullable().optional()
}).passthrough();
export async function createTabbySandboxSession({secretKey,payload,fetchImpl=fetch}){
 if(!secretKey)throw new Error("TABBY_SECRET_KEY_MISSING");
 const parsed=schema.safeParse(payload);if(!parsed.success)throw Object.assign(new Error("TABBY_CHECKOUT_PAYLOAD_INVALID"),{issues:parsed.error.issues});
 const response=await fetchImpl("https://api.tabby.sa/api/v2/checkout",{method:"POST",headers:{Authorization:"Bearer "+secretKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error("TABBY_CHECKOUT_REJECTED"),{status:response.status,providerCode:data?.error||null});
 const webUrl=data?.configuration?.available_products?.installments?.[0]?.web_url;
 if(typeof data?.payment?.id!=="string"||typeof webUrl!=="string"||!webUrl.startsWith("https://"))throw new Error("TABBY_CHECKOUT_RESPONSE_INVALID");
 return {provider:"tabby",providerPaymentId:data.payment.id,checkoutUrl:webUrl,status:data.payment.status||"created"};
}
export function verifyTabbyWebhook({headerName,secret,providedValue}){
 if(!headerName||!secret||!providedValue||!/^[A-Za-z0-9-]{1,64}$/.test(headerName))return false;
 const expected=Buffer.from(secret),actual=Buffer.from(providedValue);
 return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
}
