/* image panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'image',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var imageSrc = embeddedImageSource(panel.src);
    h = '<figure class="pimage">';
    if (imageSrc)
      h +=
        '<img src="' +
        esc(imageSrc) +
        '" alt="' +
        esc(panel.alt || '') +
        '" decoding="async">';
    else
      h +=
        '<div class="pimage-empty">Add an embedded PNG, JPEG or WebP image</div>';
    if (panel.caption)
      h += '<figcaption>' + esc(panel.caption) + '</figcaption>';
    var imageLink =
      typeof FlowCanon !== 'undefined' && FlowCanon.http(panel.link);
    if (imageLink)
      h +=
        '<a class="pimage-link" href="' +
        esc(imageLink) +
        '" target="_blank" rel="noopener noreferrer">Open reference ↗</a>';
    h += '</figure>';
    return { html: h };
  }
);
