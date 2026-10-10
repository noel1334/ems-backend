import crypto from "node:crypto";
import prisma from "../../config/database.js";
import AppError from "../../common/errors/AppError.js";
import { writeAudit } from "../../common/utils/audit.js";
import { verifyReference } from "../biometrics/biometric.service.js";

const publicItem = (x) => ({ ...x, availableQuantity: Math.max(0, x.quantity - x.reservedQuantity), status: !x.isActive ? "INACTIVE" : x.quantity <= 0 ? "OUT_OF_STOCK" : x.quantity <= x.minimumQuantity ? "LOW_STOCK" : "IN_STOCK", location: x.location ? { id:x.location.id, name:x.location.name, code:x.location.code } : null });
const getItem = async (companyId, itemId, tx=prisma) => tx.inventoryItem.findFirst({ where:{ id:itemId, companyId }, include:{ location:true } });
const lockItem = async (companyId,itemId,tx) => {
  const rows = await tx.$queryRaw`SELECT id, "companyId", "quantity", "reservedQuantity", "minimumQuantity", "isActive" FROM "inventory_items" WHERE id=${itemId} AND "companyId"=${companyId} FOR UPDATE`;
  if (!rows.length) throw new AppError("Inventory item not found",404,"INVENTORY_ITEM_NOT_FOUND");
  return rows[0];
};
const ensureEmployee = async (companyId, employeeId, tx=prisma) => {
  const employee=await tx.employee.findFirst({where:{id:employeeId,companyId,employmentStatus:{in:["ACTIVE","ON_LEAVE"]}}});
  if(!employee) throw new AppError("Employee not found or inactive",404,"EMPLOYEE_NOT_FOUND");
  return employee;
};

export const listItems = async (companyId, query={}) => {
  const where={companyId, ...(query.search?{OR:[{name:{contains:query.search,mode:"insensitive"}},{sku:{contains:query.search,mode:"insensitive"}},{barcode:{contains:query.search,mode:"insensitive"}}]}:{}), ...(query.locationId?{locationId:query.locationId}:{}), ...(query.activeOnly!==false?{isActive:true}:{})};
  const rows=await prisma.inventoryItem.findMany({where,include:{location:true},orderBy:{createdAt:"desc"},take:Math.min(Number(query.limit)||100,200)});
  return rows.map(publicItem);
};
export const getItemByBarcode=async(companyId,barcode)=>{const x=await prisma.inventoryItem.findFirst({where:{companyId,barcode,isActive:true},include:{location:true}});if(!x)throw new AppError("Inventory item not found for barcode",404,"BARCODE_NOT_FOUND");return publicItem(x);};
export const createItem=async(companyId,data,actorUserId)=>{if(data.locationId&&!(await prisma.inventoryLocation.findFirst({where:{id:data.locationId,companyId,isActive:true}})))throw new AppError("Inventory location not found",404);const x=await prisma.inventoryItem.create({data:{...data,companyId}});await writeAudit(prisma,{companyId,actorUserId,action:"CREATE",module:"inventory",resource:"item",resourceId:x.id,metadata:{sku:x.sku,barcode:x.barcode}});return publicItem(await getItem(companyId,x.id));};
export const updateItem=async(companyId,id,data,actorUserId)=>{await getItem(companyId,id);if(data.locationId&&!(await prisma.inventoryLocation.findFirst({where:{id:data.locationId,companyId,isActive:true}})))throw new AppError("Inventory location not found",404);const x=await prisma.inventoryItem.update({where:{id},data});await writeAudit(prisma,{companyId,actorUserId,action:"UPDATE",module:"inventory",resource:"item",resourceId:id,metadata:{changes:data}});return publicItem(await getItem(companyId,x.id));};

export const verifyEmployee = async(companyId,actorUserId,input,context={})=>{
  const employee=await ensureEmployee(companyId,input.employeeId);
  const type=input.method==="FINGERPRINT"?"FINGERPRINT":"FACE";
  const result=await verifyReference(companyId,{templateReference:input.templateReference,type,deviceReference:input.deviceReference||undefined});
  if(!result.verified||result.employee.id!==employee.id) throw new AppError("Biometric verification failed for the selected employee",401,"BIOMETRIC_VERIFICATION_FAILED");
  const reference=`inv-${crypto.randomUUID()}`;
  const expiresAt=new Date(Date.now()+2*60*1000);
  const verification=await prisma.inventoryVerification.create({data:{companyId,employeeId:employee.id,actorUserId,method:input.method,biometricId:result.biometricId,provider:result.provider||null,verificationReference:reference,expiresAt}});
  await writeAudit(prisma,{companyId,actorUserId,action:"APPROVE",module:"inventory",resource:"verification",resourceId:verification.id,ipAddress:context.ipAddress,userAgent:context.userAgent,metadata:{employeeId:employee.id,method:input.method,biometricId:result.biometricId}});
  return {verificationReference:reference,expiresAt,employee:{id:employee.id,employeeNumber:employee.employeeNumber,firstName:employee.firstName,lastName:employee.lastName},method:input.method};
};

export const createTransaction=async(companyId,storekeeperId,input,context={})=>{
  const result=await prisma.$transaction(async(tx)=>{
    const verification=await tx.inventoryVerification.findFirst({where:{companyId,verificationReference:input.verificationReference,status:"VERIFIED",expiresAt:{gt:new Date()},employeeId:input.employeeId}});
    if(!verification) throw new AppError("Biometric verification is missing, expired, or already used",401,"INVENTORY_VERIFICATION_INVALID");
    await ensureEmployee(companyId,input.employeeId,tx);
    const item=await lockItem(companyId,input.itemId,tx);
    if(!item.isActive) throw new AppError("Inventory item is inactive",409,"INVENTORY_ITEM_INACTIVE");
    if(input.type==="ISSUE" && Number(item.quantity)-Number(item.reservedQuantity)<input.quantity) throw new AppError("Insufficient available stock",409,"INSUFFICIENT_STOCK");
    if(input.locationId){const loc=await tx.inventoryLocation.findFirst({where:{id:input.locationId,companyId,isActive:true}});if(!loc)throw new AppError("Inventory location not found",404);}
    if(input.type==="ISSUE") await tx.inventoryItem.update({where:{id:input.itemId},data:{reservedQuantity:{increment:input.quantity}}});
    const txRow=await tx.inventoryTransaction.create({data:{companyId,itemId:input.itemId,employeeId:input.employeeId,storekeeperId,locationId:input.locationId||null,verificationId:verification.id,type:input.type,quantity:input.quantity,note:input.note||null}});
    await tx.inventoryVerification.update({where:{id:verification.id},data:{status:"USED",usedAt:new Date()}});
    return txRow;
  });
  await writeAudit(prisma,{companyId,actorUserId:storekeeperId,action:"CREATE",module:"inventory",resource:"transaction",resourceId:result.id,ipAddress:context.ipAddress,userAgent:context.userAgent,metadata:{type:result.type,quantity:result.quantity,itemId:result.itemId,employeeId:result.employeeId}});
  return result;
};

const finalizeTransaction=async(companyId,transactionId,employeeId,confirmed,note,context={})=>{
 return prisma.$transaction(async(tx)=>{
  const row=await tx.inventoryTransaction.findFirst({where:{id:transactionId,companyId,employeeId},include:{item:true}});
  if(!row)throw new AppError("Inventory transaction not found",404,"INVENTORY_TRANSACTION_NOT_FOUND");
  if(row.status!=="PENDING_EMPLOYEE_CONFIRMATION")throw new AppError("Inventory transaction has already been finalized",409,"TRANSACTION_ALREADY_FINALIZED");
  const item=await lockItem(companyId,row.itemId,tx);
  if(!confirmed){
    if(row.type==="ISSUE") await tx.inventoryItem.update({where:{id:row.itemId},data:{reservedQuantity:{decrement:row.quantity}}});
    const updated=await tx.inventoryTransaction.update({where:{id:row.id},data:{status:"DISPUTED",employeeNote:note||null,disputedAt:new Date()}});
    return {updated,ledger:null};
  }
  const before=Number(item.quantity);
  let after=before;
  let ledgerType=row.type==="ISSUE"?"ISSUE":"RETURN";
  if(row.type==="ISSUE"){if(before<row.quantity)throw new AppError("Stock changed and is no longer sufficient",409,"STOCK_CONFLICT");after=before-row.quantity;await tx.inventoryItem.update({where:{id:row.itemId},data:{quantity:after,reservedQuantity:{decrement:row.quantity}}});}
  else {after=before+row.quantity;await tx.inventoryItem.update({where:{id:row.itemId},data:{quantity:after}});}
  const ledger=await tx.inventoryLedgerEntry.create({data:{companyId,itemId:row.itemId,transactionId:row.id,actorUserId:row.storekeeperId,type:ledgerType,quantity:row.quantity,balanceBefore:before,balanceAfter:after,reference:`${row.type}-${row.id}`,note:note||row.note||null}});
  const updated=await tx.inventoryTransaction.update({where:{id:row.id},data:{status:"CONFIRMED",employeeNote:note||null,confirmedAt:new Date()}});
  return {updated,ledger};
 });
};
export const confirmTransaction=(companyId,employeeId,id,note,context)=>finalizeTransaction(companyId,id,employeeId,true,note,context);
export const disputeTransaction=(companyId,employeeId,id,note,context)=>finalizeTransaction(companyId,id,employeeId,false,note,context);

export const receiveStock=async(companyId,actorUserId,input)=>prisma.$transaction(async(tx)=>{const item=await lockItem(companyId,input.itemId,tx);if(input.supplierId&&!await tx.inventorySupplier.findFirst({where:{id:input.supplierId,companyId,isActive:true}}))throw new AppError("Supplier not found",404);const before=Number(item.quantity),after=before+input.quantity;await tx.inventoryItem.update({where:{id:input.itemId},data:{quantity:after}});const entry=await tx.inventoryLedgerEntry.create({data:{companyId,itemId:input.itemId,supplierId:input.supplierId||null,actorUserId,type:"RECEIPT",quantity:input.quantity,balanceBefore:before,balanceAfter:after,reference:input.reference,note:input.note||null}});await writeAudit(tx,{companyId,actorUserId,action:"CREATE",module:"inventory",resource:"receipt",resourceId:entry.id,metadata:{itemId:input.itemId,quantity:input.quantity,reference:input.reference}});return entry;});
export const adjustStock=async(companyId,actorUserId,input)=>prisma.$transaction(async(tx)=>{const item=await lockItem(companyId,input.itemId,tx);const before=Number(item.quantity),after=before-input.quantity;if(after<0)throw new AppError("Adjustment would make stock negative",409,"NEGATIVE_STOCK");await tx.inventoryItem.update({where:{id:input.itemId},data:{quantity:after}});const entry=await tx.inventoryLedgerEntry.create({data:{companyId,itemId:input.itemId,actorUserId,type:input.type,quantity:-input.quantity,balanceBefore:before,balanceAfter:after,reference:input.reference,note:input.note}});await writeAudit(tx,{companyId,actorUserId,action:"UPDATE",module:"inventory",resource:"adjustment",resourceId:entry.id,metadata:{itemId:input.itemId,type:input.type,quantity:input.quantity,reference:input.reference}});return entry;});
export const listLedger=async(companyId,query={})=>prisma.inventoryLedgerEntry.findMany({where:{companyId,...(query.itemId?{itemId:query.itemId}:{}),...(query.type?{type:query.type}: {})},orderBy:{createdAt:"desc"},take:Math.min(Number(query.limit)||100,200),include:{item:{select:{id:true,name:true,sku:true,unit:true}}}});
export const listTransactions=async(companyId,query={})=>prisma.inventoryTransaction.findMany({where:{companyId,...(query.employeeId?{employeeId:query.employeeId}:{}),...(query.status?{status:query.status}: {})},orderBy:{createdAt:"desc"},take:Math.min(Number(query.limit)||100,200),include:{item:{select:{id:true,name:true,sku:true,barcode:true}},employee:{select:{id:true,employeeNumber:true,firstName:true,lastName:true}},verification:{select:{method:true,provider:true,createdAt:true}}}});
export const listLocations=async(companyId)=>prisma.inventoryLocation.findMany({where:{companyId},orderBy:{name:"asc"}});
export const createLocation=async(companyId,data,actorUserId)=>{const x=await prisma.inventoryLocation.create({data:{...data,companyId}});await writeAudit(prisma,{companyId,actorUserId,action:"CREATE",module:"inventory",resource:"location",resourceId:x.id});return x;};
export const listSuppliers=async(companyId)=>prisma.inventorySupplier.findMany({where:{companyId},orderBy:{name:"asc"}});
export const createSupplier=async(companyId,data,actorUserId)=>{const x=await prisma.inventorySupplier.create({data:{...data,companyId}});await writeAudit(prisma,{companyId,actorUserId,action:"CREATE",module:"inventory",resource:"supplier",resourceId:x.id});return x;};
export const listEmployeeTransactions=async(companyId,employeeId)=>prisma.inventoryTransaction.findMany({where:{companyId,employeeId},orderBy:{createdAt:"desc"},include:{item:{select:{id:true,name:true,sku:true,unit:true}},verification:{select:{method:true,provider:true,createdAt:true}}}});
