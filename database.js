import crypto from "node:crypto";
import pg from "pg";
const { Pool } = pg;

const productFromRow = r => ({
  id:r.id, sku:r.sku || "", name:r.name, description:r.description || "",
  category:r.category_name || "", categoryId:r.category_id,
  priceHalalas:Number(r.price_halalas), compareAtHalalas:r.compare_at_halalas==null?null:Number(r.compare_at_halalas),
  stock:Number(r.stock), imageUrl:r.image_url || null, active:Boolean(r.active),
  createdAt:r.created_at, updatedAt:r.updated_at
});
const orderFromRow = r => ({
  id:r.id, referenceId:r.reference_id, provider:r.provider || null,
  amount:Number(r.total_halalas)/100, amountHalalas:Number(r.total_halalas), currency:r.currency,
  status:r.status, customer:{name:r.customer_name,email:r.customer_email,phone:r.customer_phone},
  createdAt:r.created_at, updatedAt:r.updated_at
});

export function createStoreRepository({connectionString=process.env.DATABASE_URL,pool:providedPool=null}={}) {
  // PostgreSQL is opt-in; DATABASE_URL alone never triggers a connection.
  if (process.env.STORE_PERSISTENCE !== "postgres" || (!connectionString && !providedPool)) {
    const products=new Map(),categories=new Set(),orders=new Map(),idempotency=new Map(),webhookEvents=new Set();
    return {
      mode:"memory",products,categories,orders,
      async listProducts({admin=false,q="",category=""}={}) {
        const needle=q.toLocaleLowerCase("ar");
        return [...products.values()].filter(p=>(admin || (p.active&&p.stock>0)))
          .filter(p=>!category||p.category===category)
          .filter(p=>!needle||(p.name+" "+p.description+" "+p.sku).toLocaleLowerCase("ar").includes(needle));
      },
      async getCategories(){return [...categories].sort();},
      async createProduct(data){
        const now=new Date().toISOString(),p={id:crypto.randomUUID(),...data,createdAt:now,updatedAt:now};
        products.set(p.id,p);categories.add(p.category);return p;
      },
      async updateProduct(productId,patch){
        const old=products.get(productId);if(!old)return null;
        const p={...old,...patch,updatedAt:new Date().toISOString()};products.set(p.id,p);categories.add(p.category);return p;
      },
      async getProduct(productId){return products.get(productId)||null;},
      async createOrder({provider,items,customer,idempotencyKey}){
        if(idempotencyKey && idempotency.has(idempotencyKey))return orders.get(idempotency.get(idempotencyKey));
        const lines=[];
        for(const item of items){const p=products.get(item.productId);if(!p||!p.active)throw Object.assign(new Error("PRODUCT_UNAVAILABLE"),{code:"PRODUCT_UNAVAILABLE",productId:item.productId});if(item.quantity>p.stock)throw Object.assign(new Error("INSUFFICIENT_STOCK"),{code:"INSUFFICIENT_STOCK",productId:item.productId});lines.push({productId:p.id,name:p.name,sku:p.sku,quantity:item.quantity,unitPriceHalalas:p.priceHalalas,lineTotalHalalas:p.priceHalalas*item.quantity});}
        const totalHalalas=lines.reduce((s,x)=>s+x.lineTotalHalalas,0),orderId=crypto.randomUUID(),referenceId="BF-"+crypto.randomBytes(6).toString("hex").toUpperCase(),now=new Date().toISOString();
        const order={id:orderId,referenceId,provider,amount:totalHalalas/100,amountHalalas:totalHalalas,currency:"SAR",items:lines,customer,status:"preview_only",createdAt:now,updatedAt:now,providerOrderId:null};
        orders.set(orderId,order);if(idempotencyKey)idempotency.set(idempotencyKey,orderId);return order;
      },
      async listOrders(limit=100){return [...orders.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,limit);},
      async stats(){
        const all=[...orders.values()],paid=all.filter(o=>["captured","closed"].includes(o.status));
        return {totalOrders:all.length,paidOrders:paid.length,pending:all.filter(o=>["pending","preview_only"].includes(o.status)).length,failed:all.filter(o=>o.status==="failed").length,revenue:paid.reduce((s,o)=>s+o.amount,0),providers:{tabby:all.filter(o=>o.provider==="tabby").length,tamara:all.filter(o=>o.provider==="tamara").length}};
      },
      async recordWebhook({provider,eventId,eventType,payload,referenceId,status}){
        const key=provider+":"+eventId;if(webhookEvents.has(key))return {duplicate:true,found:true};
        const order=[...orders.values()].find(o=>o.referenceId===referenceId);
        if(!order)return {duplicate:false,found:false};
        webhookEvents.add(key);
        const rank={preview_only:-1,pending:0,approved:1,authorised:2,captured:3,closed:4,failed:-2};
        if(order.status!=="failed" && status==="failed"){if(rank[order.status]<2)order.status="failed";}
        else if(order.status!=="failed" && rank[status]>rank[order.status])order.status=status;
        order.updatedAt=new Date().toISOString();orders.set(order.id,order);
        return {duplicate:false,found:true,status:order.status};
      },
      async close(){}
    };
  }

  const pool=providedPool||new Pool({connectionString,ssl:process.env.DATABASE_SSL==="disable"?false:{rejectUnauthorized:true},max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
  const productSelect=`SELECT p.*,c.name AS category_name FROM bf_products p LEFT JOIN bf_categories c ON c.id=p.category_id`;
  return {
    mode:"postgres",pool,orders:null,
    async listProducts({admin=false,q="",category=""}={}){
      const values=[],where=[];
      if(!admin)where.push("p.active=TRUE AND p.stock>0");
      if(category){values.push(category);where.push("c.name=$"+values.length);}
      if(q){values.push("%"+q.replace(/[\\%_]/g,"\\$&")+"%");where.push("(p.name ILIKE $"+values.length+" OR p.description ILIKE $"+values.length+" OR COALESCE(p.sku,'') ILIKE $"+values.length+")");}
      const sql=productSelect+(where.length?" WHERE "+where.join(" AND "):"")+" ORDER BY p.created_at DESC";
      const result=await pool.query(sql,values);return result.rows.map(productFromRow);
    },
    async getCategories(){const r=await pool.query("SELECT name FROM bf_categories WHERE active=TRUE ORDER BY name");return r.rows.map(x=>x.name);},
    async createProduct(data){
      const client=await pool.connect();try{await client.query("BEGIN");
        const slug=data.category.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100)||"category-"+crypto.randomBytes(3).toString("hex");
        const cat=await client.query("INSERT INTO bf_categories(name,slug) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name",[data.category,slug]);
        const r=await client.query("INSERT INTO bf_products(sku,name,description,category_id,price_halalas,compare_at_halalas,stock,image_url,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[data.sku||null,data.name,data.description,cat.rows[0].id,data.priceHalalas,data.compareAtHalalas??null,data.stock,data.imageUrl??null,data.active]);
        await client.query("COMMIT");return productFromRow({...r.rows[0],category_name:cat.rows[0].name});
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    },
    async updateProduct(productId,patch){
      const client=await pool.connect();try{await client.query("BEGIN");
        const old=await client.query(productSelect+" WHERE p.id=$1 FOR UPDATE",[productId]);if(!old.rowCount){await client.query("ROLLBACK");return null;}
        const current=productFromRow(old.rows[0]),next={...current,...patch};
        let categoryId=current.categoryId;
        if(patch.category){const slug=patch.category.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,100)||"category-"+crypto.randomBytes(3).toString("hex");const c=await client.query("INSERT INTO bf_categories(name,slug) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",[patch.category,slug]);categoryId=c.rows[0].id;}
        const r=await client.query("UPDATE bf_products SET sku=$2,name=$3,description=$4,category_id=$5,price_halalas=$6,compare_at_halalas=$7,stock=$8,image_url=$9,active=$10,updated_at=NOW() WHERE id=$1 RETURNING *",[productId,next.sku||null,next.name,next.description,categoryId,next.priceHalalas,next.compareAtHalalas??null,next.stock,next.imageUrl??null,next.active]);
        await client.query("COMMIT");return productFromRow({...r.rows[0],category_name:next.category});
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    },
    async getProduct(productId){const r=await pool.query(productSelect+" WHERE p.id=$1",[productId]);return r.rowCount?productFromRow(r.rows[0]):null;},
    async createOrder({provider,items,customer,idempotencyKey}){
      const client=await pool.connect();try{await client.query("BEGIN");
        const existing=await client.query("SELECT o.*,pa.provider FROM bf_payment_attempts pa JOIN bf_orders o ON o.id=pa.order_id WHERE pa.idempotency_key=$1 FOR UPDATE",[idempotencyKey]);
        if(existing.rowCount){await client.query("COMMIT");return orderFromRow(existing.rows[0]);}
        const lines=[];
        for(const item of items){
          const r=await client.query("SELECT id,sku,name,price_halalas,stock,active FROM bf_products WHERE id=$1 FOR UPDATE",[item.productId]);
          const p=r.rows[0];if(!p||!p.active)throw Object.assign(new Error("PRODUCT_UNAVAILABLE"),{code:"PRODUCT_UNAVAILABLE",productId:item.productId});
          if(item.quantity>Number(p.stock))throw Object.assign(new Error("INSUFFICIENT_STOCK"),{code:"INSUFFICIENT_STOCK",productId:item.productId});
          lines.push({productId:p.id,name:p.name,sku:p.sku,quantity:item.quantity,unitPriceHalalas:Number(p.price_halalas),lineTotalHalalas:Number(p.price_halalas)*item.quantity});
        }
        const total=lines.reduce((s,x)=>s+x.lineTotalHalalas,0),referenceId="BF-"+crypto.randomBytes(6).toString("hex").toUpperCase();
        const inserted=await client.query("INSERT INTO bf_orders(reference_id,customer_name,customer_email,customer_phone,subtotal_halalas,shipping_halalas,total_halalas,status) VALUES($1,$2,$3,$4,$5,0,$5,'preview_only') RETURNING *",[referenceId,customer.name,customer.email,customer.phone,total]);
        const order=orderFromRow({...inserted.rows[0],provider});
        for(const line of lines)await client.query("INSERT INTO bf_order_items(order_id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_price_halalas,line_total_halalas) VALUES($1,$2,$3,$4,$5,$6,$7)",[order.id,line.productId,line.name,line.sku,line.quantity,line.unitPriceHalalas,line.lineTotalHalalas]);
        await client.query("INSERT INTO bf_payment_attempts(order_id,provider,status,idempotency_key) VALUES($1,$2,'preview_only',$3)",[order.id,provider,"preview:"+order.id]);
        await client.query("COMMIT");return {...order,provider,items:lines};
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    },
    async listOrders(limit=100){
      const r=await pool.query("SELECT o.*,pa.provider FROM bf_orders o LEFT JOIN LATERAL (SELECT provider FROM bf_payment_attempts WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) pa ON TRUE ORDER BY o.created_at DESC LIMIT $1",[limit]);return r.rows.map(orderFromRow);
    },
    async stats(){
      const r=await pool.query("SELECT COUNT(*)::int total_orders,COUNT(*) FILTER(WHERE status IN ('captured','closed'))::int paid_orders,COUNT(*) FILTER(WHERE status IN ('pending','preview_only'))::int pending,COUNT(*) FILTER(WHERE status='failed')::int failed,COALESCE(SUM(total_halalas) FILTER(WHERE status IN ('captured','closed')),0)::bigint revenue FROM bf_orders");
      const p=await pool.query("SELECT provider,COUNT(*)::int count FROM bf_payment_attempts GROUP BY provider");
      const providers={tabby:0,tamara:0};for(const row of p.rows)providers[row.provider]=row.count;
      const x=r.rows[0];return {totalOrders:x.total_orders,paidOrders:x.paid_orders,pending:x.pending,failed:x.failed,revenue:Number(x.revenue)/100,providers};
    },
    async recordWebhook({provider,eventId,eventType,payload,referenceId,status,providerOrderId}){
      const client=await pool.connect();try{await client.query("BEGIN");
        const found=await client.query("SELECT o.id,o.status,pa.id AS attempt_id FROM bf_orders o JOIN bf_payment_attempts pa ON pa.order_id=o.id WHERE o.reference_id=$1 AND pa.provider=$2 FOR UPDATE",[referenceId,provider]);
        if(!found.rowCount){await client.query("ROLLBACK");return {duplicate:false,found:false};}
        const inserted=await client.query("INSERT INTO bf_webhook_events(provider,provider_event_id,event_type,signature_verified,payload) VALUES($1,$2,$3,TRUE,$4::jsonb) ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id",[provider,eventId,eventType,JSON.stringify(payload)]);
        if(!inserted.rowCount){await client.query("COMMIT");return {duplicate:true,found:true,status:found.rows[0].status};}
        const rank={pending:0,approved:1,authorised:2,captured:3,closed:4,failed:-2,preview_only:-1};
        const current=found.rows[0].status,mayAdvance=current!=="failed"&&(status==="failed"?rank[current]<2:rank[status]>rank[current]);
        if(mayAdvance){
          await client.query("UPDATE bf_orders SET status=$1,updated_at=NOW() WHERE id=$2",[status,found.rows[0].id]);
          await client.query("UPDATE bf_payment_attempts SET status=$1,provider_order_id=COALESCE($2,provider_order_id),updated_at=NOW() WHERE id=$3",[status,providerOrderId||null,found.rows[0].attempt_id]);
        }
        await client.query("UPDATE bf_webhook_events SET processing_status='processed',processed_at=NOW() WHERE id=$1",[inserted.rows[0].id]);
        await client.query("COMMIT");return {duplicate:false,found:true,status:mayAdvance?status:current};
      }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
    },
    async close(){await pool.end();}
  };
}
