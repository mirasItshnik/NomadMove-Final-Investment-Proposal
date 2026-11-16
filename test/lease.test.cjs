const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const {deployLease, ethers} = require('../scripts/chain_lease.cjs');

let context;
let contract;
let firstDue;
const vehicleHash = ethers.id('synthetic-hyundai-accent-ls-2081');
const paymentOne = ethers.id('synthetic-fiat-payment-lp-3101');
const paymentTwo = ethers.id('synthetic-fiat-payment-lp-3102');
const send = async (promise) => (await promise).wait();

before(async () => {
  context = await deployLease();
  contract = context.contract;
  const block = await context.provider.getBlock('latest');
  firstDue = Number(block.timestamp) + 3600;
});

test('authorized lessor creates a lease with a future payment schedule', async () => {
  const receipt = await send(contract.connect(context.lessor).createLease(
    context.driver.address,
    vehicleHash,
    45000,
    firstDue,
    14
  ));
  const lease = await contract.leases(1);
  assert.equal(lease.driver, context.driver.address);
  assert.equal(lease.installmentKzt, 45000n);
  assert.equal(lease.nextDue, BigInt(firstDue));
  assert.equal(lease.status, 1n);
  assert(receipt.logs.some((log) => contract.interface.parseLog(log)?.name === 'LeaseCreated'));
});

test('unauthorized lessor and invalid lease inputs are rejected', async () => {
  await assert.rejects(contract.connect(context.outsider).createLease(
    context.driver.address, vehicleHash, 45000, firstDue + 100, 14
  ), /Lessor only/);
  await assert.rejects(contract.connect(context.lessor).createLease(
    ethers.ZeroAddress, vehicleHash, 45000, firstDue + 100, 14
  ), /Zero driver/);
  await assert.rejects(contract.connect(context.lessor).createLease(
    context.driver.address, vehicleHash, 0, firstDue + 100, 14
  ), /Invalid installment/);
});

test('assigned lessor confirms one synthetic fiat payment and advances the due date', async () => {
  const receipt = await send(contract.connect(context.lessor).confirmPayment(1, paymentOne, 45000));
  const lease = await contract.leases(1);
  assert.equal(lease.paidCount, 1n);
  assert.equal(lease.nextDue, BigInt(firstDue + 14 * 24 * 60 * 60));
  assert.equal(await contract.paymentReferenceUsed(paymentOne), true);
  assert(receipt.logs.some((log) => contract.interface.parseLog(log)?.name === 'LeasePaymentConfirmed'));
});

test('duplicate reference, wrong amount and unrelated account are rejected', async () => {
  await assert.rejects(contract.connect(context.lessor).confirmPayment(1, paymentOne, 45000), /Payment reference used/);
  await assert.rejects(contract.connect(context.lessor).confirmPayment(1, paymentTwo, 44000), /Incorrect amount/);
  await assert.rejects(contract.connect(context.outsider).confirmPayment(1, paymentTwo, 45000), /Lessor only/);
});

test('overdue status is time-gated and a confirmed payment clears it', async () => {
  await assert.rejects(contract.connect(context.lessor).markOverdue(1), /Payment not overdue/);
  const leaseBefore = await contract.leases(1);
  await context.provider.send('evm_setNextBlockTimestamp', [Number(leaseBefore.nextDue) + 1]);
  await context.provider.send('evm_mine', []);
  await send(contract.connect(context.lessor).markOverdue(1));
  assert.equal((await contract.leases(1)).overdue, true);
  await send(contract.connect(context.lessor).confirmPayment(1, paymentTwo, 45000));
  assert.equal((await contract.leases(1)).overdue, false);
});

test('emergency pause blocks lease writes until the administrator unpauses', async () => {
  await send(contract.setPaused(true));
  await assert.rejects(contract.connect(context.lessor).confirmPayment(1, ethers.id('p3'), 45000), /Paused/);
  await assert.rejects(contract.connect(context.lessor).markOverdue(1), /Paused/);
  await assert.rejects(contract.connect(context.outsider).setPaused(false), /Admin only/);
  await send(contract.setPaused(false));
});

test('only the assigned lessor closes a lease and closed leases reject payments', async () => {
  await assert.rejects(contract.connect(context.outsider).closeLease(1), /Lessor only/);
  await send(contract.connect(context.lessor).closeLease(1));
  assert.equal((await contract.leases(1)).status, 2n);
  await assert.rejects(contract.connect(context.lessor).confirmPayment(1, ethers.id('p4'), 45000), /Lease not active/);
});

test('lease registry rejects Ether transfers', async () => {
  await assert.rejects(context.driver.sendTransaction({to: await contract.getAddress(), value: 1n}));
});
