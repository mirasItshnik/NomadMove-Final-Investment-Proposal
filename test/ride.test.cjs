const {test,before} = require('node:test');
const assert = require('node:assert/strict');
const {deploy,ethers} = require('../scripts/chain.cjs');
let x,c;
const route = ethers.id('synthetic-route-reference');
before(async()=>{x=await deploy();c=x.contract;});
const send=async p=>(await p).wait();
test('create, accept, start, complete; exact 5% commission and emitted receipt',async()=>{
  await send(c.connect(x.passenger).createRide(route,1800));
  assert.equal((await c.rides(1)).status,1n);
  await send(c.connect(x.driver).acceptRide(1));
  await send(c.connect(x.driver).startRide(1));
  const receipt=await send(c.connect(x.driver).completeRide(1));
  const r=await c.rides(1);
  assert.equal(r.status,4n);assert.equal(r.commission,90n);assert.equal(r.driverNet,1710n);
  assert.equal(await c.totalGross(),1800n);assert.equal(await c.totalCommission(),90n);
  assert.equal(await c.netEarnings(x.driver.address),1710n);
  assert.equal(await c.activePassengerRide(x.passenger.address),0n);
  assert.equal(await c.activeDriverRide(x.driver.address),0n);
  assert(receipt.logs.some(l=>c.interface.parseLog(l)?.name==='RideCompleted'));
});
test('cannot complete twice or count earnings twice',async()=>{
  await assert.rejects(c.connect(x.driver).completeRide(1),/Not in progress/);
  assert.equal(await c.completedCount(),1n);assert.equal(await c.totalCommission(),90n);
});
test('invalid fare, missing route hash and nonexistent ride are rejected',async()=>{
  for(const fare of [0,1000001])await assert.rejects(c.connect(x.passenger).createRide(route,fare),/Invalid fare/);
  await assert.rejects(c.connect(x.passenger).createRide(ethers.ZeroHash,1800),/Empty route hash/);
  await assert.rejects(c.connect(x.driver).acceptRide(9999),/Not requested/);
});
test('only admin can grant drivers or pause',async()=>{
  await assert.rejects(c.connect(x.outsider).setDriver(x.outsider.address,true),/Admin only/);
  await assert.rejects(c.connect(x.passenger).setPaused(true),/Admin only/);
  await assert.rejects(c.setDriver(ethers.ZeroAddress,true),/Zero address/);
});
test('unauthorized acceptance and skipped transitions fail',async()=>{
  await send(c.connect(x.passenger).createRide(route,1801));
  await assert.rejects(c.connect(x.outsider).acceptRide(2),/Driver only/);
  await assert.rejects(c.connect(x.driver).startRide(2),/Not accepted/);
  await assert.rejects(c.connect(x.driver).completeRide(2),/Not in progress/);
});
test('passenger can have only one active request',async()=>{
  await assert.rejects(c.connect(x.passenger).createRide(route,1800),/Passenger has active ride/);
});
test('assigned driver exclusively progresses ride; second acceptance fails',async()=>{
  await send(c.connect(x.driver).acceptRide(2));
  await assert.rejects(c.connect(x.driver2).acceptRide(2),/Not requested/);
  await assert.rejects(c.connect(x.driver2).startRide(2),/Assigned driver only/);
  await assert.rejects(c.connect(x.passenger).cancelRide(2),/Not requested/);
  await assert.rejects(c.setDriver(x.driver.address,false),/Driver has active ride/);
});
test('driver cannot accept second active ride',async()=>{
  await send(c.connect(x.outsider).createRide(route,2500));
  await assert.rejects(c.connect(x.driver).acceptRide(3),/Driver has active ride/);
});
test('only passenger cancels; cancellation accrues no commission',async()=>{
  await assert.rejects(c.connect(x.passenger).cancelRide(3),/Passenger only/);
  await send(c.connect(x.outsider).cancelRide(3));
  assert.equal((await c.rides(3)).status,5n);assert.equal(await c.totalCommission(),90n);
  await assert.rejects(c.connect(x.driver).acceptRide(3),/Not requested/);
});
test('pause blocks workflow, but allows cancellation and admin unpause',async()=>{
  await send(c.connect(x.outsider).createRide(route,2000));
  await send(c.setPaused(true));
  await assert.rejects(c.connect(x.driver).startRide(2),/Paused/);
  await assert.rejects(c.connect(x.driver2).acceptRide(4),/Paused/);
  await assert.rejects(c.connect(x.driver2).createRide(route,2000),/Paused/);
  await send(c.connect(x.outsider).cancelRide(4));
  await send(c.setPaused(false));
});
test('rounding conserves integer KZT; start/complete cannot be replayed',async()=>{
  await send(c.connect(x.driver).startRide(2));
  await assert.rejects(c.connect(x.driver).startRide(2),/Not accepted/);
  await assert.rejects(c.connect(x.driver2).completeRide(2),/Assigned driver only/);
  await send(c.setPaused(true));
  await assert.rejects(c.connect(x.driver).completeRide(2),/Paused/);
  await send(c.setPaused(false));
  await send(c.connect(x.driver).completeRide(2));
  const r=await c.rides(2);assert.equal(r.commission,90n);assert.equal(r.driverNet,1711n);
  assert.equal(r.commission+r.driverNet,r.fare);
});
test('driver cannot accept own ride; revoked driver cannot accept',async()=>{
  await send(c.connect(x.driver2).createRide(route,2000));
  await assert.rejects(c.connect(x.driver2).acceptRide(5),/Cannot accept own ride/);
  await send(c.connect(x.driver2).cancelRide(5));
  await send(c.setDriver(x.driver2.address,false));
  await send(c.connect(x.passenger).createRide(route,2000));
  await assert.rejects(c.connect(x.driver2).acceptRide(6),/Driver only/);
});
test('contract does not accept Ether',async()=>{
  await assert.rejects(x.passenger.sendTransaction({to:await c.getAddress(),value:1n}));
});
