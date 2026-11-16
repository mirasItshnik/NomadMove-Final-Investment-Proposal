const hre = require('hardhat');
const {ethers} = require('ethers');
const {compileLease} = require('./compile_lease.cjs');

async function deployLease() {
  if (hre.network.name !== 'hardhat') throw new Error('Only the local Hardhat network is supported.');
  const artifact = compileLease();
  const provider = new ethers.BrowserProvider(hre.network.provider, undefined, {cacheTimeout: -1});
  provider.pollingInterval = 100;
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('Unexpected chain ID');
  const signers = await Promise.all([0, 1, 2, 3].map((index) => provider.getSigner(index)));
  const [admin, lessor, driver, outsider] = signers;
  const contract = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin).deploy();
  const receipt = await contract.deploymentTransaction().wait();
  await (await contract.setLessor(await lessor.getAddress(), true)).wait();
  return {contract, provider, signers, admin, lessor, driver, outsider, receipt, artifact, ethers};
}

module.exports = {deployLease, ethers};
