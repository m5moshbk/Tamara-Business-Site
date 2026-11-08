import { z } from "zod";
const productInput=z.object({
 name:z.string().trim().min(2).max(140),description:z.string().trim().max(1200).default(""),
 category:z.string().trim().min(2).max(80),priceHalalas:z.number().int().positive().max(100000000),
 compareAtHalalas:z.number().int().positive().optional(),sku:z.string().trim().max(80).default(""),
 stock:z.number().int().min(0).max(100000).default(0),imageUrl:z.string().url().max(1000).optional(),active:z.boolean().default(true)
});
const itemsSchema=z.array(z.object({productId:z.string().min(1).max(80),quantity:z.number().int().min(1).max(20)})).min(1).max(30);
const checkoutSchema=z.object({
 provider:z.enum(["tabby","tamara"]),items:itemsSchema,
 customer:z.object({name:z.string().trim().min(2).max(120),email:z.string().email().max(200),phone:z.string().trim().min(8).max(30)}),
 returnPath:z.string().max(200).default("/")
});
const publicProduct=p=>({id:p.id,name:p.name,description:p.description,category:p.category,priceHalalas:p.priceHalalas,compareAtHalalas:p.compareAtHalalas??null,sku:p.sku,stock:p.stock,imageUrl:p.imageUrl??null});
export function attachStoreRoutes(app,{requireAdmin,repository}) {
 app.get("/api/categories",async(_req,res,next)=>{try{res.json(await repository.getCategories());}catch(e){next(e);}});
 app.get("/api/products",async(req,res,next)=>{try{
  const q=String(req.query.q||"").trim().slice(0,100),category=String(req.query.category||"").slice(0,80);
  res.setHeader("Cache-Control","no-store");res.json((await repository.listProducts({q,category})).map(publicProduct));
 }catch(e){next(e);}});
 app.get("/api/admin/products",requireAdmin,async(_req,res,next)=>{try{res.json((await repository.listProducts({admin:true})).map(publicProduct));}catch(e){next(e);}});
 app.post("/api/admin/products",requireAdmin,async(req,res,next)=>{try{
  const parsed=productInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_PRODUCT",issues:parsed.error.issues});
  const product=await repository.createProduct(parsed.data);res.status(201).json(publicProduct(product));
 }catch(e){if(e.code==="23505")return res.status(409).json({error:"SKU_ALREADY_EXISTS"});next(e);}});
 app.patch("/api/admin/products/:id",requireAdmin,async(req,res,next)=>{try{
  const parsed=productInput.partial().safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_PRODUCT",issues:parsed.error.issues});
  const product=await repository.updateProduct(req.params.id,parsed.data);if(!product)return res.status(404).json({error:"PRODUCT_NOT_FOUND"});res.json(publicProduct(product));
 }catch(e){if(e.code==="23505")return res.status(409).json({error:"SKU_ALREADY_EXISTS"});next(e);}});
 app.post("/api/cart/quote",async(req,res,next)=>{try{
  const parsed=z.object({items:itemsSchema}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_CART"});
  const lines=[];for(const item of parsed.data.items){const p=await repository.getProduct(item.productId);if(!p||!p.active)return res.status(400).json({error:"PRODUCT_UNAVAILABLE",productId:item.productId});if(item.quantity>p.stock)return res.status(409).json({error:"INSUFFICIENT_STOCK",productId:item.productId});lines.push({productId:p.id,name:p.name,quantity:item.quantity,unitPriceHalalas:p.priceHalalas,lineTotalHalalas:p.priceHalalas*item.quantity});}
  const subtotalHalalas=lines.reduce((s,x)=>s+x.lineTotalHalalas,0);res.json({currency:"SAR",lines,subtotalHalalas,shippingHalalas:0,totalHalalas:subtotalHalalas,note:"الشحن غير محسوب حتى اعتماد سياسة الشحن."});
 }catch(e){next(e);}});
 app.post("/api/checkout",async(req,res,next)=>{try{
  const parsed=checkoutSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"INVALID_CHECKOUT",issues:parsed.error.issues});
  const idempotencyKey=String(req.get("Idempotency-Key")||"");
  if(!/^[A-Za-z0-9._:-]{16,160}$/.test(idempotencyKey))return res.status(400).json({error:"IDEMPOTENCY_KEY_REQUIRED"});
  const order=await repository.createOrder({...parsed.data,idempotencyKey});
  const path=parsed.data.returnPath.startsWith("/")&&!parsed.data.returnPath.startsWith("//")?parsed.data.returnPath:"/";
  const checkoutUrl=path+(path.includes("?")?"&":"?")+"payment=preview&order="+encodeURIComponent(order.id);
  res.status(201).json({orderId:order.id,referenceId:order.referenceId,checkoutUrl,status:"preview_only",currency:"SAR",totalHalalas:order.amountHalalas,preview:true,message:"معاينة فقط؛ لم يتم إنشاء جلسة لدى مزود الدفع ولم يتم تحصيل أي مبلغ."});
 }catch(e){if(e.code==="IDEMPOTENCY_KEY_REUSED")return res.status(409).json({error:e.code});if(["PRODUCT_UNAVAILABLE","INSUFFICIENT_STOCK"].includes(e.code))return res.status(e.code==="INSUFFICIENT_STOCK"?409:400).json({error:e.code,productId:e.productId});next(e);}});
}
