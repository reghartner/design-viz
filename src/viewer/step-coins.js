/* Numbered step coins on the board. Hovering or keyboard-focusing a coin shows
   its step after a short delay; a reader can click, tap or press Enter on it to
   go to that step. The card belongs to one stepper and survives board
   re-renders because it listens on the board's stable container. */
var STEP_COIN_CARD_DELAY_MS = 400;

function wireStepCoins(host, prefix, describe, activate){
  var card = document.createElement('div');
  card.className = 'nbackpop step-coin-card'; card.id = prefix + '-coin-card';
  card.setAttribute('role', 'tooltip'); card.setAttribute('popover', 'manual'); card.hidden = true;
  host.appendChild(card);
  var timer = 0, shown = null, pending = null, listeners = [];
  function listen(target, type, fn, capture){
    target.addEventListener(type, fn, capture); listeners.push(function(){ target.removeEventListener(type, fn, capture); });
  }
  function coinOf(target){
    var coin = target && target.closest ? target.closest('g.coin[data-dv-step]') : null;
    return coin && host.contains(coin) && !coin.classList.contains('view-step-hidden') ? coin : null;
  }
  function cancel(){ if (timer) clearTimeout(timer); timer = 0; pending = null; }
  function hide(){
    cancel();
    if (!shown) return;
    shown.removeAttribute('aria-describedby'); shown = null;
    if (card.hidePopover && card.matches(':popover-open')) card.hidePopover();
    card.hidden = true;
  }
  function show(coin){
    timer = 0; pending = null;
    if (!coin.isConnected || coin.classList.contains('view-step-hidden')) return;
    var info = describe(coin);
    if (!info) return;
    card.replaceChildren();
    var eyebrow = document.createElement('span'); eyebrow.className = 'step-coin-card-label';
    eyebrow.textContent = ['Step ' + info.number].concat(info.lane ? [info.lane] : [], info.route ? [info.route] : []).join(' · ');
    card.appendChild(eyebrow);
    if (info.text){
      var text = document.createElement('div'); text.className = 'step-coin-card-text';
      text.innerHTML = proseMarkup(info.text); card.appendChild(text);
    }
    if (info.hint){
      var hint = document.createElement('span'); hint.className = 'step-coin-card-hint';
      hint.textContent = info.hint; card.appendChild(hint);
    }
    card.hidden = false;
    if (card.showPopover) card.showPopover();
    var rect = coin.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    card.style.left = Math.max(8, Math.min(vw - card.offsetWidth - 8, rect.left + rect.width / 2 - card.offsetWidth / 2)) + 'px';
    var top = rect.top - card.offsetHeight - 8;
    if (top < 8) top = rect.bottom + 8;
    card.style.top = Math.max(8, Math.min(vh - card.offsetHeight - 8, top)) + 'px';
    shown = coin; coin.setAttribute('aria-describedby', card.id);
  }
  function schedule(coin){
    if (shown === coin || pending === coin) return;
    hide(); pending = coin;
    timer = setTimeout(function(){ show(coin); }, STEP_COIN_CARD_DELAY_MS);
  }
  function leave(coin, related){
    if (related && coin.contains(related)) return;
    if (pending === coin) cancel();
    if (shown === coin) hide();
  }
  // Touch has no hover: a tap goes straight to the step without a card.
  listen(host, 'pointerover', function(ev){
    var coin = coinOf(ev.target);
    if (coin && ev.pointerType !== 'touch') schedule(coin);
  });
  listen(host, 'pointerout', function(ev){
    var coin = coinOf(ev.target);
    if (coin) leave(coin, ev.relatedTarget);
  });
  listen(host, 'focusin', function(ev){
    var coin = coinOf(ev.target);
    if (coin && coin.matches(':focus-visible')) schedule(coin);
  });
  listen(host, 'focusout', function(ev){
    var coin = coinOf(ev.target);
    if (coin) leave(coin, ev.relatedTarget);
  });
  if (activate){
    listen(host, 'click', function(ev){
      var coin = coinOf(ev.target);
      if (!coin || ev.target.closest('.dvdelta')) return;
      hide(); activate(coin);
    });
    listen(host, 'keydown', function(ev){
      var coin = coinOf(ev.target);
      if (!coin || ev.target !== coin || (ev.key !== 'Enter' && ev.key !== ' ')) return;
      ev.preventDefault(); hide(); activate(coin);
    });
  }
  listen(document, 'keydown', function(ev){ if (ev.key === 'Escape' && (shown || pending)) hide(); }, true);
  listen(document, 'scroll', hide, true);
  listen(window, 'resize', hide);
  return {hide:hide, destroy:function(){ hide(); listeners.forEach(function(off){ off(); }); card.remove(); }};
}
