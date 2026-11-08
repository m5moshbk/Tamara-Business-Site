import test,{after} from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {once} from "node:events";

process.env.NODE_ENV="test";
process.env.PAYMENT_MODE="preview";
process.env.STORE_PERSISTENCE="memory";
delete process.env.DATABASE_URL;
delete process.env.ADMIN_USERNAME;delete process.env.ADMIN_PASSWORD_HASH;delete process.env.ADMIN_SESSION_SECRET;delete process.env.TAMARA_NOTIFICATION_TOKEN;
const noAuth=await import("../server.js?ci-no-auth");
const noAuthServer=noAuth.app.listen(0,"127.0.0.1");await once(noAuthServer,"listening");
const noAuthBase="http://127.0.0.1:"+noAuthServer.address().port;
const salt=Buffer.from("ci-only-salt"),hash=crypto.scryptSync("ci-only-password",salt,64,{N:16384,r:8,p:1}).toString("base64url");
process.env.ADMIN_USERNAME="ci-admin";process.env.ADMIN_PASSWORD_HASH="scrypt$16384$8$1$"+salt.toString("base64url")+"$"+hash;
process.env.ADMIN_SESSION_SECRET="ci-only-session-secret-long-enough-for-tests";
const auth=await import("../server.js?ci-auth");
const authServer=auth.app.listen(0,"127.0.0.1");await once(authServer,"listening");
const authBase="http://127.0.0.1:"+authServer.address().port;
async function post(base,path,body,headers={}){return fetch(base+path,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});}
let adminCookie="";
after(async()=>{await Promise.all([noAuthServer,authServer].map(s=>new Promise(resolve=>s.close(resolve))));});

test("admin routes fail closed without auth configuration",async()=>{
 const payload=Buffer.from(JSON.stringify({u:"",exp:Date.now()+60000})).toString("base64url");
 const signature=crypto.createHmac("sha256","").update(payload).digest("base64url");
 const r=await fetch(noAuthBase+"/api/stats",{headers:{Cookie:"bf_admin="+payload+"."+signature}});
 assert.equal(r.status,401);
});

test("checkout rejects client-submitted totals and Tabby webhook remains fail-closed",async()=>{
 const checkout=await post(noAuthBase,"/api/checkout",{referenceId:"forged",provider:"tabby",amount:1,currency:"SAR",customer:{name:"CI Test",email:"ci@example.invalid",phone:"0500000000"},returnUrl:"https://beefitness.com.sa"});
 assert.equal(checkout.status,400);
 const webhook=await post(noAuthBase,"/webhooks/tabby",{event_type:"paid",order_reference_id:"forged"});
 assert.equal(webhook.status,503);
 assert.equal((await webhook.json()).error,"WEBHOOK_SIGNATURE_VERIFICATION_NOT_CONFIGURED");
 assert.equal(noAuth.stats().totalOrders,0);
});

test("Tamara webhook rejects missing signatures",async()=>{
 const r=await post(noAuthBase,"/webhooks/tamara",{event_type:"order_captured",order_reference_id:"ci"});
 assert.equal(r.status,401);
});

test("admin login unlocks product catalog management",async()=>{
 const login=await post(authBase,"/api/admin/login",{username:"ci-admin",password:"ci-only-password"});
 assert.equal(login.status,200);adminCookie=login.headers.get("set-cookie").split(";")[0];
 const denied=await fetch(authBase+"/api/admin/products");assert.equal(denied.status,401);
 const created=await post(authBase,"/api/admin/products",{name:"CI Demo Product",description:"Test only",category:"CI",priceHalalas:12500,sku:"CI-001",stock:3,active:true},{Cookie:adminCookie});
 assert.equal(created.status,201);const product=await created.json();assert.equal(product.priceHalalas,12500);
});

test("checkout calculates total from server catalog and ignores client amount",async()=>{
 const products=await fetch(authBase+"/api/admin/products",{headers:{Cookie:adminCookie}}).then(r=>r.json());
 const product=products.find(p=>p.sku==="CI-001");assert.ok(product);
 const checkout=await post(authBase,"/api/checkout",{provider:"tamara",items:[{productId:product.id,quantity:2}],customer:{name:"CI Test",email:"ci@example.invalid",phone:"0500000000"},amount:1,returnPath:"//evil.invalid"},{"Idempotency-Key":"ci-checkout-attempt-0001"});
 assert.equal(checkout.status,201);const data=await checkout.json();
 assert.equal(data.totalHalalas,25000);assert.equal(data.preview,true);assert.match(data.checkoutUrl,/^\/\?payment=preview/);
 assert.equal(auth.orders.get(data.orderId).amount,250);
 const retry=await post(authBase,"/api/checkout",{provider:"tamara",items:[{productId:product.id,quantity:2}],customer:{name:"CI Test",email:"ci@example.invalid",phone:"0500000000"}},{"Idempotency-Key":"ci-checkout-attempt-0001"});
 assert.equal(retry.status,201);assert.equal((await retry.json()).orderId,data.orderId);
 const quote=await post(authBase,"/api/cart/quote",{items:[{productId:product.id,quantity:4}]});
 assert.equal(quote.status,409);
});
