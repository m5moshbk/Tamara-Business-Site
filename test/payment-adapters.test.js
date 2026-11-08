import test from "node:test";
import assert from "node:assert/strict";
import {createTamaraSandboxSession} from "../payments/tamara.js";
import {createTabbySandboxSession,verifyTabbyWebhook} from "../payments/tabby.js";

test("Tamara adapter calls the sandbox host and returns the hosted URL",async()=>{
 let request;
 const payload={total_amount:{amount:100,currency:"SAR"},shipping_amount:{amount:0,currency:"SAR"},tax_amount:{amount:0,currency:"SAR"},order_reference_id:"BF-TEST-1",order_number:"BF-TEST-1",items:[{name:"Demo item",quantity:1,reference_id:"SKU-1",type:"Physical",unit_price:{amount:100,currency:"SAR"},total_amount:{amount:100,currency:"SAR"}}],consumer:{first_name:"Test",last_name:"Buyer",phone_number:"0500000000",email:"test@example.invalid",country_code:"SA"},merchant_url:{success:"https://store.example/success",failure:"https://store.example/failure",cancel:"https://store.example/cancel",notification:"https://store.example/webhooks/tamara"},shipping_address:{first_name:"Test",last_name:"Buyer",line1:"Test Street",city:"Sabya",country_code:"SA",phone_number:"0500000000"},risk_assessment:{}};
 const result=await createTamaraSandboxSession({token:"fake-test-token",payload,fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({order_id:"tamara-test-order",checkout_id:"tamara-test-checkout",checkout_url:"https://checkout-sandbox.tamara.co/session"})};}});
 assert.equal(request.url,"https://api-sandbox.tamara.co/checkout");
 assert.equal(request.options.headers.Authorization,"Bearer fake-test-token");
 assert.equal(result.providerOrderId,"tamara-test-order");
 assert.ok(result.checkoutUrl.startsWith("https://"));
});
test("Tamara rejects incomplete payload before making a request",async()=>{
 let called=false;
 await assert.rejects(createTamaraSandboxSession({token:"fake",payload:{},fetchImpl:async()=>{called=true;}}),/TAMARA_CHECKOUT_PAYLOAD_INVALID/);
 assert.equal(called,false);
});
test("Tabby adapter calls Saudi API endpoint and extracts installment URL",async()=>{
 let request;
 const payload={payment:{amount:"100.00",currency:"SAR",description:"Demo order",buyer:{name:"Test Buyer",email:"test@example.invalid",phone:"0500000000"},shipping_address:{city:"Sabya",address:"Test Street",zip:"00000"},order:{reference_id:"BF-TEST-2",items:[{title:"Demo item",quantity:1,unit_price:"100.00",category:"fitness"}]}},lang:"ar",merchant_urls:{success:"https://store.example/success",cancel:"https://store.example/cancel",failure:"https://store.example/failure"}};
 const result=await createTabbySandboxSession({secretKey:"fake-tabby-key",payload,fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({payment:{id:"tabby-test-payment",status:"created"},configuration:{available_products:{installments:[{web_url:"https://checkout.tabby.sa/session"}]}}})};}});
 assert.equal(request.url,"https://api.tabby.sa/api/v2/checkout");
 assert.equal(request.options.headers.Authorization,"Bearer fake-tabby-key");
 assert.equal(result.providerPaymentId,"tabby-test-payment");
 assert.ok(result.checkoutUrl.startsWith("https://"));
});
test("Tabby refuses to call provider without a secret key",async()=>{
 let called=false;
 await assert.rejects(createTabbySandboxSession({payload:{},fetchImpl:async()=>{called=true;}}),/TABBY_SECRET_KEY_MISSING/);
 assert.equal(called,false);
});

test("Tabby webhook header verifier rejects missing and incorrect values",async()=>{
 assert.equal(verifyTabbyWebhook({headerName:"X-Auth-Key",secret:"secret-value",providedValue:"secret-value"}),true);
 assert.equal(verifyTabbyWebhook({headerName:"X-Auth-Key",secret:"secret-value",providedValue:"wrong-value"}),false);
 assert.equal(verifyTabbyWebhook({headerName:"X-Auth-Key",secret:"secret-value",providedValue:null}),false);
 assert.equal(verifyTabbyWebhook({headerName:"Bad Header",secret:"secret-value",providedValue:"secret-value"}),false);
});
