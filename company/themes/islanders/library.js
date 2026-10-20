/* One decoration owner per library instance. No global listeners or observers. */
function createCompanyLibraryDecoration(home) {
  var mark = IslandersBrand.image('dark', 'islanders-site-mark');
  home.after(mark);
  return {
    home: function () { mark.classList.remove('islanders-mark-suppressed'); },
    reader: function (entry) { mark.classList.toggle('islanders-mark-suppressed', !entry || !IslandersBrand.story(entry.id)); },
    card: function (entry, title) {
      if (!IslandersBrand.story(entry.id)) return;
      var crest = IslandersBrand.image('light', 'islanders-card-mark');
      crest.alt = ''; crest.setAttribute('aria-hidden', 'true'); title.prepend(crest);
    }
  };
}
