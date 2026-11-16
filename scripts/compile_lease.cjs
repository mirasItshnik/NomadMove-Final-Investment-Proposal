const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');

function compileLease() {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'contracts/LeasePaymentRegistry.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: {'LeasePaymentRegistry.sol': {content: source}},
    settings: {
      evmVersion: 'paris',
      optimizer: {enabled: true, runs: 200},
      outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object']}}
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter((entry) => entry.severity === 'error');
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join('\n'));
  const contract = output.contracts['LeasePaymentRegistry.sol'].LeasePaymentRegistry;
  const artifact = {
    contractName: 'LeasePaymentRegistry',
    compiler: solc.version(),
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`
  };
  fs.mkdirSync(path.join(root, 'artifacts'), {recursive: true});
  fs.writeFileSync(path.join(root, 'artifacts/LeasePaymentRegistry.json'), JSON.stringify(artifact, null, 2));
  return artifact;
}

module.exports = {compileLease};
if (require.main === module) {
  compileLease();
  console.log('LeasePaymentRegistry compiled successfully with local solc.');
}
