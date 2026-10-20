/* Friends-owned offline artwork. No DOM work runs during registration. */
var IslandersBrand = Object.freeze({
  light: /* @theme-asset:light */ "",
  dark: /* @theme-asset:dark */ "",
  story: function (id) {
    return id === 'islanders-marketing';
  },
  image: function (variant, className) {
    var img = document.createElement('img');
    img.className = className; img.src = this[variant];
    img.alt = 'New York Islanders'; img.width = 48; img.height = 48;
    return img;
  }
});
/* The optional venue renderer invokes these callbacks only when present. */
var CompanyVenueDecoration = Object.freeze({
  field: function (panel, model) {
    if (panel.venue !== 'ubs-arena' || !model.fieldBox) return '';
    var b = model.fieldBox, size = spmRound(Math.min(b.width / 200, b.height / 85) * 25);
    return '<image class="seatmap-islanders-logo" x="' + spmRound(b.x + (b.width - size) / 2) + '" y="' + spmRound(b.y + (b.height - size) / 2) +
      '" width="' + size + '" height="' + size + '" preserveAspectRatio="xMidYMid meet" href="' + IslandersBrand.light + '" aria-hidden="true"/>';
  },
  landmarkClass: function (panel, mark) {
    return panel.venue === 'ubs-arena' && mark.label.toLowerCase() === 'ice' ? ' seatmap-islanders-ice-label' : '';
  }
});
