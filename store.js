import crypto from "node:crypto";
import { z } from "zod";

const productInput = z.object({
  name:z.string().trim().min(2).max(140), description:z.string().trim().max(1200).default(""),
  category:z.string().trim().min(2).max(80), priceHalalas:z.number().int().positive().max(100000000),
  compareAtHalalas:z.number().int().positive().optional(), sku:z.string().trim().max(80).default(""),
  stock:z.number().int().min(0).max(100000).default(0), imageUrl:z.string().url().max(1000).optional(),
  active:z.boolean().default(true)
});
const itemsSchema=z.array(z.object({productId:z.string().min(1).max(80),quantity:z.number().int().min(1).max(20)})).min(1).max(30);
const checkoutSchema=z.object({
  provider:z.enum(["tabby","tamara"]),items:itemsSchema,
  customer:z.object({name:z.string().trim().min(2).max(120),email:z.string().email().max(200),phone:z.string().trim().min(8).max(30)}),
  returnPath:z.string().max(200).default("/")
});
const products=new Map(), categories=new Set();
const publicProduct=p=>({id:p.id,name:p.name,description:p.description,category:p.category,priceHalalas:p.priceHalalas,compareAtHalalas:p.compareAtHalalas??null,sku:p.sku,stock:p.stock,imageUrl:p.imageUrl??null});
export function attachStoreRoutes(app,{requireAdmin,orders}) {
  app.get("/api/categories",(_req,res)=>res.json([...categories].sort()));
  app.get("/api/products",(req,res)=>{
    const q=String(req.query.q||"").trim().toLocaleLowerCase("ar").slice(0,100),cat=String(req.query.category||"").slice(0,80);
    res.setHeader("Cache-Control","no-store");
    res.json([...products.values()].filter(p=>p.active&&p.stock>0).filter(p=>!cat||p.category===cat)
      .filter(p=>!q||(p.name+" "+p.description+" "+p.sku).toLocaleLowerCase("ar").includes(q)).map(publicProduct));
  });
  app.get("/api/admin/products",requireAdmin,(_req,res)=>res.json([...products.values()].map(publicProduct)));
  app.post("/api/admin/products",requireAdmin,(req,res)=>{
    const parsed=productInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_PRODUCT",issues:parsed.error.issues});
    const p={id:"prd_"+crypto.randomBytes(9).toString("hex"),...parsed.data,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    products.set(p.id,p);categories.add(p.category);res.status(201).json(publicProduct(p));
  });
  app.patch("/api/admin/products/:id",requireAdmin,(req,res)=>{
    const old=products.get(req.params.id);if(!old)return res.status(404).json({error:"PRODUCT_NOT_FOUND"});
    const parsed=productInput.partial().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_PRODUCT",issues:parsed.error.issues});
    const p={...old,...parsed.data,updatedAt:new Date().toISOString()};products.set(p.id,p);categories.add(p.category);res.json(publicProduct(p));
  });
  app.post("/api/cart/quote",(req,res)=>{
    const parsed=z.object({items:itemsSchema}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_CART"});
    const lines=[];for(const item of parsed.data.items){const p=products.get(item.productId);if(!p||!p.active)return res.status(400).json({error:"PRODUCT_UNAVAILABLE",productId:item.productId});if(item.quantity>p.stock)return res.status(409).json({error:"INSUFFICIENT_STOCK",productId:item.productId});lines.push({productId:p.id,name:p.name,quantity:item.quantity,unitPriceHalalas:p.priceHalalas,lineTotalHalalas:p.priceHalalas*item.quantity});}
    const subtotalHalalas=lines.reduce((s,x)=>s+x.lineTotalHalalas,0);res.json({currency:"SAR",lines,subtotalHalalas,shippingHalalas:0,totalHalalas:subtotalHalalas,note:"الشحن غير محسوب حتى اعتماد سياسة الشحن."});
  });
  app.post("/api/checkout",(req,res)=>{
    const parsed=checkoutSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_CHECKOUT",issues:parsed.error.issues});
    const lines=[];for(const item of parsed.data.items){const p=products.get(item.productId);if(!p||!p.active)return res.status(400).json({error:"PRODUCT_UNAVAILABLE",productId:item.productId});if(item.quantity>p.stock)return res.status(409).json({error:"INSUFFICIENT_STOCK",productId:item.productId});lines.push({productId:p.id,name:p.name,quantity:item.quantity,unitPriceHalalas:p.priceHalalas,lineTotalHalalas:p.priceHalalas*item.quantity});}
    const totalHalalas=lines.reduce((s,x)=>s+x.lineTotalHalalas,0),orderId="ord_"+crypto.randomBytes(10).toString("hex"),referenceId="BF-"+crypto.randomBytes(6).toString("hex").toUpperCase();
    orders.set(orderId,{id:orderId,referenceId,provider:parsed.data.provider,amount:totalHalalas/100,amountHalalas:totalHalalas,currency:"SAR",items:lines,customer:parsed.data.customer,status:"preview_only",createdAt:new Date().toISOString(),providerOrderId:null});
    const path=parsed.data.returnPath.startsWith("/")&&!parsed.data.returnPath.startsWith("//")?parsed.data.returnPath:"/";
    res.status(201).json({orderId,referenceId,checkoutUrl:path+(path.includes("?")?"&":"?")+"payment=preview&order="+encodeURIComponent(orderId),status:"preview_only",currency:"SAR",totalHalalas,preview:true,message:"معاينة فقط؛ لم يتم إنشاء جلسة لدى مزود الدفع ولم يتم تحصيل أي مبلغ."});
  });
}
