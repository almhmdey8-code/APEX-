import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
initializeApp({ projectId: "apex-3c12f-ci" });
const db = getFirestore();
const base = "http://127.0.0.1:5001/apex-3c12f-ci/us-central1";

async function tokenFor(email) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email,password:"TestPassword123!",returnSecureToken:true})
  });
  const data=await response.json();
  assert.equal(response.ok,true,"Auth emulator signup failed: "+JSON.stringify(data));
  return {uid:data.localId,idToken:data.idToken};
}

async function callable(name,payload,idToken) {
  const response = await fetch(base+"/"+name,{
    method:"POST",
    headers:{"Content-Type":"application/json",...(idToken?{Authorization:"Bearer "+idToken}:{})},
    body:JSON.stringify({data:payload||{}})
  });
  const body=await response.json();
  if(!response.ok||body.error) {
    const error=new Error(body.error?.message||"Callable "+name+" failed");
    error.code=body.error?.status||response.status;
    throw error;
  }
  return body.result;
}

test("Firebase order, wallet, idempotency, public payment projection and admin permissions",async()=>{
  const customer=await tokenFor("ci-customer@apex.invalid");
  const customerUid=customer.uid,customerToken=customer.idToken;
  await db.doc("customers/"+customerUid).set({uid:customerUid,fullName:"CI Customer",marketingOptIn:false});
  await db.doc("products/123456789").set({legacyId:123456789,name:"APEX CI Product",price:25,active:true,stock:50});
  await db.doc("paymentMethods/987654321").set({
    legacyId:987654321,name:"تحويل يدوي للاختبار",instructions:"تعليمات دفع تجريبية",
    methodType:"manual",enabled:true,ordersEnabled:true,walletTopupEnabled:true,sortOrder:1,
    secretKeyNames:["DO_NOT_RETURN"],gatewaySecret:"never-public"
  });
  await db.doc("wallets/"+customerUid).set({userId:customerUid,balanceSar:100});

  const publicMethods=await callable("apexGetPublicPaymentMethods",{});
  assert.equal(publicMethods.paymentMethods.length,1);
  assert.equal(publicMethods.paymentMethods[0].name,"تحويل يدوي للاختبار");
  assert.equal("gatewaySecret" in publicMethods.paymentMethods[0],false);
  assert.equal("secretKeyNames" in publicMethods.paymentMethods[0],false);

  const orderRequest="11111111-1111-4111-8111-111111111111";
  const order=await callable("apexCreateOrder",{
    customer_name:"CI Customer",phone:"0500000000",address:"Test address",notes:"",
    shipping_method:"استلام",payment_method_id:987654321,
    request_id:orderRequest,items:[{id:123456789,quantity:2,price:0.01}]
  },customerToken);
  assert.equal(order.success,true);
  const orderDoc=await db.doc("orders/"+order.order_id).get();
  assert.equal(orderDoc.get("totalSar"),50,"Server must ignore client-supplied prices");
  assert.equal(orderDoc.get("paymentStatus"),"pending");

  const walletRequest="22222222-2222-4222-8222-222222222222";
  const walletPayload={customer_name:"CI Customer",phone:"0500000000",address:"Test address",notes:"",shipping_method:"استلام",request_id:walletRequest,items:[{id:123456789,quantity:2}]};
  const first=await callable("apexWalletCheckout",walletPayload,customerToken);
  const second=await callable("apexWalletCheckout",walletPayload,customerToken);
  assert.equal(first.order_id,second.order_id,"Idempotent retry must return the same order");
  const wallet=await db.doc("wallets/"+customerUid).get();
  assert.equal(wallet.get("balanceSar"),50,"Wallet must be debited exactly once");
  const ledger=await db.collection("walletTransactions").get();
  assert.equal(ledger.docs.filter(x=>x.get("userId")===customerUid&&x.get("referenceType")==="order").length,1);

  await assert.rejects(
    callable("apexWalletCheckout",{...walletPayload,request_id:"33333333-3333-4333-8333-333333333333",items:[{id:123456789,quantity:10}]},customerToken),
    /رصيد محفظة APEX غير كافٍ/
  );
  const afterFailure=await db.doc("wallets/"+customerUid).get();
  assert.equal(afterFailure.get("balanceSar"),50,"Failed checkout must not change the wallet");

  await assert.rejects(callable("apexAdminCustomers",{},customerToken));

  const admin=await tokenFor("apex.1.shopping@gmail.com");
  const adminUid=admin.uid,adminToken=admin.idToken;
  await db.doc("admins/"+adminUid).set({active:true,role:"admin"});
  const adminResult=await callable("apexAdminCustomers",{},adminToken);
  assert.ok(Array.isArray(adminResult.customers));
  assert.ok(adminResult.customers.some(x=>x.id===customerUid));

  const topup=await callable("apexRequestWalletTopup",{p_amount_sar:25,p_payment_method_id:987654321,p_customer_reference:"CI transfer"},customerToken);
  assert.equal(topup.success,true);
  const beforeApproval=await db.doc("wallets/"+customerUid).get();
  assert.equal(beforeApproval.get("balanceSar"),50,"Pending top-up must not credit the wallet");
  await callable("apexAdminReviewWalletTopup",{p_topup_id:topup.topup_id,p_decision:"approved",p_admin_note:"CI approved"},adminToken);
  const afterApproval=await db.doc("wallets/"+customerUid).get();
  assert.equal(afterApproval.get("balanceSar"),75,"Approved manual top-up must credit once");

  await db.doc("orders/"+order.order_id).update({paymentStatus:"paid"});
  const refund=await callable("apexAdminRefundOrderToWallet",{p_order_id:order.order_id,p_reason:"CI refund"},adminToken);
  assert.equal(refund.wallet_credited,true);
  const afterRefund=await db.doc("wallets/"+customerUid).get();
  assert.equal(afterRefund.get("balanceSar"),125,"Refund must credit the wallet atomically");
  await assert.rejects(callable("apexAdminRefundOrderToWallet",{p_order_id:order.order_id,p_reason:"duplicate"},adminToken));
  const refundedOrder=await db.doc("orders/"+order.order_id).get();
  assert.equal(refundedOrder.get("paymentStatus"),"refunded");
});
