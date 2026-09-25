import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { z } from "zod";

const app=express();
const PORT=Number(process.env.PORT||10000);
const ORIGIN=process.env.ALLOWED_ORIGIN||"https://beefitness.com.sa";
const MODE=process.env.PAYMENT_MODE||"preview";

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"256kb"}));
app.use((req,res,next)=>{res.setHeader("Access-Control-Allow-Origin",ORIGIN);res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");if(req.method==="OPTIONS")return res.sendStatus(204);next()});
app.use(rateLimit({windowMs:60_000,max:120,standardHeaders:true,legacyHeaders:false}));
app.use(express.static("public"));

const orders=new Map();
const events=new Map();

const orderSchema=z.object({
  referenceId:z.string().min(1).max(100),
  provider:z.enum(["tabby","tamara"]),
  amount:z.number().positive(),
  currency:z.literal("SAR"),
  customer:z.object({name:z.string().min(1).max(120),email:z.string().email().max(200),phone:z.string().min(8).max(30)}),
  returnUrl:z.string().url().max(500)
});

function id(prefix){return prefix+"_"+crypto.randomBytes(10).toString("hex")}
function stats(){
  const all=[...orders.values()];
  const paid=all.filter(o=>["paid","captured","authorised"].includes(o.status));
  return {totalOrders:all.length,paidOrders:paid.length,pending:all.filter(o=>o.status==="pending").length,failed:all.filter(o=>o.status==="failed").length,revenue:paid.reduce((s,o)=>s+o.amount,0),providers:{tabby:all.filter(o=>o.provider==="tabby").length,tamara:all.filter(o=>o.provider==="tamara").length}};
}

app.get("/health",(req,res)=>res.json({ok:true,service:"beefitness-payments",mode:MODE,time:new Date().toISOString()}));
app.get("/api/stats",(req,res)=>res.json(stats()));
app.get("/api/orders",(req,res)=>res.json([...orders.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)));

app.post("/api/checkout",async(req,res)=>{
  const parsed=orderSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"INVALID_ORDER",details:parsed.error.issues});
  const data=parsed.data;
  const order={id:id("ord"),...data,status:"pending",createdAt:new Date().toISOString(),providerOrderId:null};
  orders.set(order.id,order);

  if(MODE!=="live"){
    order.providerOrderId=id(data.provider);
    order.status="paid";
    order.checkoutUrl=data.returnUrl+"?payment=preview&order="+encodeURIComponent(order.id);
    orders.set(order.id,order);
    return res.json({orderId:order.id,checkoutUrl:order.checkoutUrl,status:order.status,preview:true});
  }

  return res.status(501).json({error:"LIVE_PROVIDER_NOT_CONFIGURED",message:"Configure provider credentials and exact production adapter before enabling live mode."});
});

function recordWebhook(provider,req,res){
  const eventId=req.get("x-event-id")||req.get("x-webhook-id")||crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
  if(events.has(eventId))return res.status(200).json({ok:true,idempotent:true});
  events.set(eventId,{provider,receivedAt:new Date().toISOString()});
  const body=req.body||{};
  const reference=body.order_reference_id||body.reference_id||body.order_reference||body.order_id;
  const order=[...orders.values()].find(o=>o.referenceId===reference||o.providerOrderId===reference||o.id===reference);
  if(order){
    const event=String(body.event_type||body.event||body.status||"").toLowerCase();
    if(event.includes("declin")||event.includes("fail")||event.includes("cancel")||event.includes("expire"))order.status="failed";
    else if(event.includes("captur")||event.includes("author")||event.includes("approv")||event.includes("paid"))order.status=event.includes("captur")?"captured":"paid";
    orders.set(order.id,order);
  }
  return res.status(200).json({ok:true});
}
app.post("/webhooks/tamara",(req,res)=>recordWebhook("tamara",req,res));
app.post("/webhooks/tabby",(req,res)=>recordWebhook("tabby",req,res));

app.get("*",(req,res)=>res.sendFile(process.cwd()+"/public/index.html"));
app.listen(PORT,()=>console.log("BeeFitness payment gateway listening on "+PORT));
