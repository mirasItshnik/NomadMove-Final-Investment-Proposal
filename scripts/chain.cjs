const hre = require('hardhat');
const {ethers} = require('ethers');
const {compile} = require('./compile.cjs');
async function deploy() {
  if (hre.network.name !== 'hardhat') throw new Error('Only the in-process local Hardhat network is supported.');
  const artifact = compile();
  const provider = new ethers.BrowserProvider(hre.network.provider, undefined, {cacheTimeout: -1});
  provider.pollingInterval = 100;
  if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('Unexpected chain ID');
  const signers = await Promise.all([0,1,2,3,4].map(n => provider.getSigner(n)));
  const [admin, passenger, driver, outsider, driver2] = signers;
  const contract = await new ethers.ContractFactory(artifact.abi,artifact.bytecode,admin).deploy();
  const receipt = await contract.deploymentTransaction().wait();
  await (await contract.setDriver(await driver.getAddress(),true)).wait();
  await (await contract.setDriver(await driver2.getAddress(),true)).wait();
  return {contract,provider,signers,admin,passenger,driver,outsider,driver2,receipt,artifact};
}
module.exports = {deploy,ethers};
