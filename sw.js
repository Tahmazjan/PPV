/* ППВ — офлайн-режим.
   Оболочка приложения кешируется при установке.
   Тайлы карты кешируются по мере просмотра: район, который вы открыли хотя бы раз,
   потом доступен без связи. Данные (data/sources.json) обновляются при наличии сети,
   при её отсутствии берутся из кеша. */

var SHELL = 'ppv-shell-v3';
var TILES = 'ppv-tiles-v1';
var DATA  = 'ppv-data-v2';
var TILE_LIMIT = 3000;

var ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(SHELL).then(function(c){
      return Promise.all(ASSETS.map(function(u){
        return c.add(new Request(u, {mode:'no-cors'})).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if([SHELL,TILES,DATA].indexOf(k) < 0) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function trim(cacheName, limit){
  caches.open(cacheName).then(function(c){
    c.keys().then(function(keys){
      if(keys.length > limit){
        for(var i = 0; i < keys.length - limit; i++) c.delete(keys[i]);
      }
    });
  });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = req.url;

  // тайлы карты — сначала кеш, потом сеть
  if(/tile\.openstreetmap\.org/.test(url)){
    e.respondWith(
      caches.open(TILES).then(function(c){
        return c.match(req).then(function(hit){
          if(hit) return hit;
          return fetch(req, {mode:'no-cors'}).then(function(res){
            c.put(req, res.clone()); trim(TILES, TILE_LIMIT); return res;
          }).catch(function(){ return new Response('', {status:504}); });
        });
      })
    );
    return;
  }

  // общая база — сначала сеть, при её отсутствии кеш
  if(/data\/sources\.json/.test(url)){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(DATA).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || new Response('[]', {headers:{'Content-Type':'application/json'}});
        });
      })
    );
    return;
  }

  // оболочка приложения — сначала сеть, кеш только как запасной вариант при её отсутствии
  e.respondWith(
    fetch(req).then(function(res){
      if(res && res.status === 200 && res.type !== 'opaque'){
        var copy = res.clone();
        caches.open(SHELL).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match('./index.html');
      });
    })
  );
});
