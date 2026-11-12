const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
function compile() {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'contracts/NomadMove.sol'), 'utf8');
  const output = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'NomadMove.sol':{content:source}},settings:{evmVersion:'paris',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
  const errors = (output.errors || []).filter(e => e.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  const c = output.contracts['NomadMove.sol'].NomadMove;
  const artifact = {contractName:'NomadMove',compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object};
  fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
  fs.writeFileSync(path.join(root,'artifacts/NomadMove.json'),JSON.stringify(artifact,null,2));
  return artifact;
}
module.exports = {compile};
if (require.main === module) {compile(); console.log('NomadMove compiled successfully with local solc.');}
