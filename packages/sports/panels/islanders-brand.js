/* Official artwork is substituted once at build time, never fetched at runtime.
   See ../assets/islanders/README.md for source, hashes and use restrictions. */
var IslandersBrand = Object.freeze({
  light: /* @islanders-primary-light */ "",
  dark: /* @islanders-primary-dark */ "",
  story: function (id) {
    return ['season-of-seats', 'sell-the-inventory', 'serve-game-night', 'build-next-season'].indexOf(id) >= 0;
  },
  image: function (variant, className) {
    var img = document.createElement('img');
    img.className = className; img.src = this[variant];
    img.alt = 'New York Islanders'; img.width = 48; img.height = 48;
    return img;
  },
});
