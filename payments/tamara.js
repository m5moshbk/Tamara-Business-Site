import { z } from "zod";
const money=z.object({amount:z.number().nonnegative(),currency:z.literal("SAR")});
const schema=z.object({
 total_amount:money,shipping_amount:money,tax_amount:money,order_reference_id:z.string().min(1).max(100),
 order_number:z.string().min(1).max(100),items:z.array(z.object({name:z.string().min(1).max(255),quantity:z.number().int().positive(),reference_id:z.string().min(1),type:z.string().min(1),sku:z.string().max(128).optional(),unit_price:money,total_amount:money})).min(1),
 consumer:z.object({first_name:z.string().min(1),last_name:z.string().min(1),phone_number:z.string().min(5),email:z.string().email(),country_code:z.literal("SA")}),
 merchant_url:z.object({success:z.string().url(),failure:z.string().url(),cancel:z.string().url(),notification:z.string().url()}),
 shipping_address:z.object({first_name:z.string(),last_name:z.string(),line1:z.string(),city:z.string(),country_code:z.literal("SA"),phone_number:z.string()}),
 risk_assessment:z.record(z.string(),z.unknown())
});
export async function createTamaraSandboxSession({token,payload,fetchImpl=fetch}){
 if(!token)throw new Error("TAMARA_API_TOKEN_MISSING");
 const parsed=schema.safeParse(payload);if(!parsed.success)throw Object.assign(new Error("TAMARA_CHECKOUT_PAYLOAD_INVALID"),{issues:parsed.error.issues});
 const response=await fetchImpl("https://api-sandbox.tamara.co/checkout",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(parsed.data),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error("TAMARA_CHECKOUT_REJECTED"),{status:response.status,providerCode:data?.code||null});
 if(typeof data.order_id!=="string"||typeof data.checkout_url!=="string"||!data.checkout_url.startsWith("https://"))throw new Error("TAMARA_CHECKOUT_RESPONSE_INVALID");
 return {provider:"tamara",providerOrderId:data.order_id,checkoutId:data.checkout_id||null,checkoutUrl:data.checkout_url,status:data.status||"created"};
}
