const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {deploy,ethers}=require('./scripts/chain.cjs');
const PORT=Number(process.env.PORT||4173);
if(!Number.isInteger(PORT)||PORT<1024||PORT>65535)throw new Error('Invalid local port');
const origin=`http://127.0.0.1:${PORT}`;
const token=crypto.randomBytes(32).toString('hex');
const routes=new Map();
let chain,queue=Promise.resolve();
const status=['None','Requested','Accepted','In Progress','Completed','Cancelled'];
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v));};
const shortError=e=>e.reason||e.shortMessage||e.message||'Transaction failed';
async function receiptOf(p){const tx=await p;const r=await tx.wait();return {transactionHash:r.hash,blockNumber:r.blockNumber,gasUsed:r.gasUsed,status:r.status};}
async function snapshot(){
 const c=chain.contract;const rides=[];
 for(let id=1;id<=Number(await c.rideCount());id++){
  const r=await c.rides(id),local=routes.get(id);
  rides.push({id,passenger:r.passenger,driver:r.driver,routeHash:r.routeHash,fare:r.fare,commission:r.commission,driverNet:r.driverNet,status:status[Number(r.status)],pickup:local?.pickup||'Off-chain route unavailable',destination:local?.destination||'Off-chain route unavailable',points:local?.points||{}});
 }
 const address=await c.getAddress();
 const logs=await chain.provider.getLogs({address,fromBlock:chain.receipt.blockNumber,toBlock:'latest'});
 const events=await Promise.all(logs.map(async l=>{const e=c.interface.parseLog(l);const block=await chain.provider.getBlock(l.blockNumber);return {event:e.name,rideId:e.args.rideId?.toString()||null,transactionHash:l.transactionHash,blockHash:l.blockHash,block:l.blockNumber,index:l.index,timestamp:block.timestamp};}));
 return {contract:address,chainId:31337,deployment:chain.receipt.hash,session:token,paused:await c.paused(),accounts:{admin:chain.admin.address,passenger:chain.passenger.address,driver:chain.driver.address},rides,events:events.reverse(),gross:await c.totalGross(),commission:await c.totalCommission(),net:await c.netEarnings(chain.driver.address),completed:await c.completedCount()};
}
async function action(b){
 const c=chain.contract;
 if(b.action==='create'){
  const pickup=typeof b.pickup==='string'?b.pickup.trim():'',destination=typeof b.destination==='string'?b.destination.trim():'';
  if(pickup.length<3||destination.length<3||pickup.length>80||destination.length>80||pickup.toLowerCase()===destination.toLowerCase())throw new Error('Укажите разные пункты отправления и назначения (3–80 символов).');
  const fare=Number(b.fare);
  if(!Number.isInteger(fare)||fare<1||fare>1000000)throw new Error('Стоимость должна быть целым числом от 1 до 1 000 000 ₸.');
  const points={};
  for(const key of ['pickup','destination']){const pt=b.points?.[key];if(pt!==undefined){if(!pt||typeof pt.lat!=='number'||typeof pt.lng!=='number'||!Number.isFinite(pt.lat)||!Number.isFinite(pt.lng)||Math.abs(pt.lat)>90||Math.abs(pt.lng)>180)throw new Error('Формат координат неверен.');points[key]={lat:pt.lat,lng:pt.lng};}}
  if(points.pickup&&points.destination&&points.pickup.lat===points.destination.lat&&points.pickup.lng===points.destination.lng)throw new Error('Точки отправления и назначения должны отличаться.');
  const canonical=JSON.stringify({pickup,destination,points,salt:crypto.randomBytes(32).toString('hex')});
  const routeHash=ethers.keccak256(ethers.toUtf8Bytes(canonical));
  const tx=await receiptOf(c.connect(chain.passenger).createRide(routeHash,fare));
  const id=Number(await c.rideCount());routes.set(id,{pickup,destination,points,canonical});return tx;
 }
 if(b.action==='pause'){if(typeof b.value!=='boolean')throw new Error('Invalid pause value');return receiptOf(c.setPaused(b.value));}
 const id=Number(b.id);if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid ride ID');
 const actions={accept:()=>c.connect(chain.driver).acceptRide(id),start:()=>c.connect(chain.driver).startRide(id),complete:()=>c.connect(chain.driver).completeRide(id),cancel:()=>c.connect(chain.passenger).cancelRide(id)};
 if(!actions[b.action])throw new Error('Unknown action');return receiptOf(actions[b.action]());
}
async function handle(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'none'");
 if(req.headers.host!==`127.0.0.1:${PORT}`&&req.headers.host!==`localhost:${PORT}`)return json(res,403,{error:'Local access only'});
 const url=new URL(req.url,origin);
 try{
  if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,await snapshot());
  if(url.pathname==='/api/action'&&req.method==='POST'){
   const allowedOrigin=[origin,`http://localhost:${PORT}`];
   if(!allowedOrigin.includes(req.headers.origin)||req.headers['x-demo-session']!==token||req.headers['content-type']!=='application/json')return json(res,403,{error:'Invalid local session'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{error:'Request too large'});}
   const parsed=JSON.parse(body);const task=queue.then(()=>action(parsed));queue=task.catch(()=>{});
   return json(res,200,{receipt:await task});
  }
  if(url.pathname==='/api/verify'&&req.method==='GET'){
   const id=Number(url.searchParams.get('id'));if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid ride ID');
   const local=routes.get(id);if(!local)throw new Error('Off-chain route not available for this ride');
   const r=await chain.contract.rides(id);const tampered=url.searchParams.get('tampered')==='1';
   const expected=ethers.keccak256(ethers.toUtf8Bytes(local.canonical+(tampered?'modified-copy':'')));
   return json(res,200,{ok:expected===r.routeHash,stored:r.routeHash,calculated:expected,tampered});
  }
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  const files={'/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js','/i18n.js':'i18n.js','/map.js':'map.js','/vendor/leaflet/leaflet.js':'vendor/leaflet/leaflet.js','/vendor/leaflet/leaflet.css':'vendor/leaflet/leaflet.css','/vendor/leaflet/images/layers.png':'vendor/leaflet/images/layers.png','/vendor/leaflet/images/layers-2x.png':'vendor/leaflet/images/layers-2x.png'};
  const file=files[url.pathname];if(!file)return json(res,404,{error:'Not found'});
  const type=file.endsWith('.png')?'image/png':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(path.join(__dirname,'public',file)));
 }catch(e){json(res,400,{error:shortError(e)});}
}
(async()=>{
 chain=await deploy();
 const server=http.createServer((req,res)=>handle(req,res).catch(()=>json(res,500,{error:'Local server error'})));
 server.listen(PORT,'127.0.0.1',()=>{
  console.log('NomadMove deployed on local Hardhat EVM (chain 31337).');
  console.log('Contract:',chain.contract.target);console.log('Deployment transaction:',chain.receipt.hash);
  console.log('Local URL:',origin);console.log('No private keys are printed. Ctrl+C stops this ephemeral network.');
 });
 server.on('error',e=>{console.error('Could not start:',e.message);process.exit(1);});
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));
})().catch(e=>{console.error(shortError(e));process.exit(1);});
