'use strict';
let mapInstance=null,mapLayer=null,mapTimer=null,mapTarget='pickup',markerGroup=null;
const examplePoints={pickup:{lat:43.2381,lng:76.9451},destination:{lat:43.2186,lng:76.9582}};
function clearMap(){clearTimeout(mapTimer);if(mapInstance){mapInstance.stop();mapInstance.remove();mapInstance=null;}markerGroup=null;}
function mapPanel(editable=true){return `<section class="card mb"><div class="card-head"><h2>${editable?'Карта Алматы':'Маршрут на карте'}</h2><span class="pill">OpenStreetMap</span></div>${editable?`<div class="map-controls"><button type="button" class="btn small ${mapTarget==='pickup'?'':'secondary'}" data-map-action="pickup" aria-pressed="${mapTarget==='pickup'}">Выбрать отправление A</button><button type="button" class="btn small ${mapTarget==='destination'?'':'secondary'}" data-map-action="destination" aria-pressed="${mapTarget==='destination'}">Выбрать назначение B</button><button type="button" class="btn small secondary" data-map-action="example">Пример по Алматы</button></div><p class="tiny">Нажмите на карту, чтобы выбрать точку, или перетащите маркер.</p>`:''}<div id="ride-map" aria-label="Карта Алматы"></div><div id="map-status" class="tiny muted" role="status">Карта загружается…</div><div class="map-coordinates"><span id="point-a"></span><span id="point-b"></span><button type="button" class="text-link" data-map-action="fit">Показать точки</button></div><p class="tiny" style="margin:10px 0 0">Карта улиц © OpenStreetMap. Пунктир соединяет точки напрямую; это не автомобильный маршрут.</p><p class="tiny" style="margin:8px 0 0">Карта требует интернет. Стоимость задаётся отдельно и не рассчитывается по расстоянию.</p></section>`;}
function currentPoints(){if(page==='passenger')return draft.points;const ride=state?.rides.find(r=>['Accepted','In Progress'].includes(r.status))||state?.rides.at(-1);return ride?.points||{};}
function redrawPoints(fit=false){
 if(!mapInstance||!markerGroup)return;markerGroup.clearLayers();const points=currentPoints(),locations=[];
 for(const [key,letter,caption] of [['pickup','A','Пункт отправления A'],['destination','B','Пункт назначения B']]){
  const pt=points[key];const box=document.getElementById(key==='pickup'?'point-a':'point-b');
  if(box)box.textContent=letter+': '+(pt?`${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`:tr('Координаты не выбраны'));
  if(!pt)continue;locations.push([pt.lat,pt.lng]);
  const marker=L.marker([pt.lat,pt.lng],{draggable:page==='passenger'&&!busy,title:tr(caption),alt:tr(caption),icon:L.divIcon({className:'route-pin '+key,html:`<span>${letter}</span>`,iconSize:[34,42],iconAnchor:[17,40]})}).addTo(markerGroup);
  marker.bindTooltip(tr(caption),{direction:'top',offset:[0,-32]});
  marker.on('dragend',()=>setPoint(key,marker.getLatLng()));
 }
 if(locations.length===2)L.polyline(locations,{color:'#087f71',weight:3,dashArray:'7 9',interactive:false}).addTo(markerGroup);
 if(fit&&locations.length)mapInstance.fitBounds(L.latLngBounds(locations),{padding:[50,50],maxZoom:14});
}
function setPoint(key,latlng){
 if(busy||page!=='passenger')return;
 const pt={lat:Number(latlng.lat.toFixed(6)),lng:Number(latlng.lng.toFixed(6))};draft.points[key]=pt;
 draft[key]=`${key==='pickup'?'A':'B'} · ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`;
 const input=document.getElementById(key);if(input)input.value=draft[key];
 if(key==='pickup')mapTarget='destination';updateMapControls();redrawPoints();
}
function updateMapControls(){for(const b of document.querySelectorAll('[data-map-action="pickup"],[data-map-action="destination"]')){const active=b.dataset.mapAction===mapTarget;b.classList.toggle('secondary',!active);b.setAttribute('aria-pressed',String(active));}}
function mountMap(){
 if(!document.getElementById('ride-map'))return;
 const status=document.getElementById('map-status');
 if(!window.L){status.textContent=tr('Карта недоступна. Проверьте интернет; поездку можно создать по названиям.');return;}
 mapInstance=L.map('ride-map',{zoomControl:false,scrollWheelZoom:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([43.234,76.951],13);
 L.control.zoom({zoomInTitle:language==='en'?'Zoom in':'Приблизить',zoomOutTitle:language==='en'?'Zoom out':'Отдалить'}).addTo(mapInstance);
 mapInstance.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
 let loaded=0,failed=0,pending=true;
 const report=()=>{if(!status.isConnected)return;status.textContent=tr(failed?(loaded?'Карта загружена частично. Проверьте интернет.':'Карта недоступна. Проверьте интернет; поездку можно создать по названиям.'):(loaded&&!pending?'Карта загружена':'Карта загружается…'));};
 mapLayer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,minZoom:2,noWrap:true,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'});
 mapLayer.on('loading',()=>{pending=true;report();});mapLayer.on('load',()=>{pending=false;report();});mapLayer.on('tileload',()=>{loaded++;report();});mapLayer.on('tileerror',()=>{failed++;report();});mapLayer.addTo(mapInstance);
 markerGroup=L.layerGroup().addTo(mapInstance);redrawPoints(true);
 mapInstance.on('click',e=>{if(page==='passenger')setPoint(mapTarget,e.latlng);});
 mapTimer=setTimeout(()=>{if(!loaded){failed++;report();}},10000);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-map-action]');if(!b||busy)return;const action=b.dataset.mapAction;
 if(action==='fit')return redrawPoints(true);
 if(page!=='passenger')return;
 if(action==='example'){draft.points=structuredClone(examplePoints);draft.pickup='Abay Avenue';draft.destination='Dostyk Plaza';document.getElementById('pickup').value=draft.pickup;document.getElementById('destination').value=draft.destination;redrawPoints(true);return;}
 mapTarget=action;updateMapControls();
});
