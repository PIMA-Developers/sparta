/* Proteção do carrinho dos kimonos personalizados da Tap.
   Cada kimono montado na ferramenta entra no carrinho como um grupo de linhas com a mesma propriedade "_grupo":
   o kimono (ou a personalização no kimono do cliente) e as linhas de cobrança (costas, adicionais, prazo).
   O kimono guarda em "_tap_plano" quantas unidades de cada variante o grupo deve ter.
   Se alguém mexer nas linhas (tirar o kimono, mudar quantidades) ou colocar um item da Tap sem a ferramenta,
   este script tira o grupo inteiro do carrinho e avisa o cliente para montar de novo (o rascunho fica salvo). */
(function(){
  var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
  var FLAG = "tap-cart-guard-aviso";
  var running = false, again = false;

  // Produtos da ferramenta (handles), definidos em snippets/tap-cart-guard.liquid
  var HANDLES = window.TAP_CART_GUARD_HANDLES || [];
  function isTap(item){ return HANDLES.indexOf(item.handle) >= 0; }
  function props(item){ return item.properties || {}; }

  async function check(){
    if(running){ again = true; return; }
    running = true;
    try{
      var cart = await (await fetch(root + "cart.js", {headers:{Accept:"application/json"}, cache:"no-store"})).json();
      var groups = {}, remove = [];
      cart.items.forEach(function(item){
        var p = props(item);
        if(!p._tap){ if(isTap(item)) remove.push(item.key); return; }   // item da Tap sem a ferramenta
        if(!p._grupo){ remove.push(item.key); return; }
        var g = groups[p._grupo] || (groups[p._grupo] = {lines:[], plan:null});
        g.lines.push(item);
        if(p._tap === "kimono" && p._tap_plano) g.plan = p._tap_plano;
      });
      Object.keys(groups).forEach(function(id){
        var g = groups[id], ok = !!g.plan;
        if(ok){
          try{
            var plan = JSON.parse(g.plan), real = {};
            g.lines.forEach(function(l){ real[l.variant_id] = (real[l.variant_id] || 0) + l.quantity; });
            Object.keys(plan).concat(Object.keys(real)).forEach(function(k){ if((plan[k] || 0) !== (real[k] || 0)) ok = false; });
          }catch(e){ ok = false; }
        }
        if(!ok) g.lines.forEach(function(l){ remove.push(l.key); });
      });
      if(remove.length){
        var updates = {}; remove.forEach(function(k){ updates[k] = 0; });
        await fetch(root + "cart/update.js", {method:"POST", headers:{"Content-Type":"application/json", Accept:"application/json"}, body:JSON.stringify({updates:updates})});
        try{ sessionStorage.setItem(FLAG, "1"); }catch(e){}
        location.reload();
        return;
      }
    }catch(e){}
    finally{ running = false; }
    if(again){ again = false; check(); }
  }

  function aviso(){
    var v = null; try{ v = sessionStorage.getItem(FLAG); sessionStorage.removeItem(FLAG); }catch(e){}
    if(!v) return;
    var el = document.createElement("div");
    el.className = "tap-cart-aviso"; el.setAttribute("role", "status");
    el.textContent = "Um kimono personalizado saiu do carrinho porque as linhas dele foram alteradas. Para manter o valor certo, monte de novo na página do kimono (o seu rascunho está salvo).";
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 9000);
  }

  var t = 0;
  function soon(){ clearTimeout(t); t = setTimeout(check, 250); }
  document.addEventListener("cart:update", soon);
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", function(){ aviso(); check(); });
  else { aviso(); check(); }
})();
