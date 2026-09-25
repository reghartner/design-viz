/* Embedded image panel. Shared raster validation lives in ../media.js. */
PanelRegistry.extend('image', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.src != null && p.src !== '' && !embeddedImageSource(p.src))
      errors.push(
        PP +
          '.src: use an embedded PNG, JPEG or WebP data URL up to 512 KiB; remote URLs and SVG are not supported'
      );
    if (p.src && (typeof p.alt !== 'string' || !p.alt.trim()))
      warnings.push(PP + '.alt: describe the image for readers who cannot see it');
    ['alt', 'caption'].forEach(function (key) {
      if (p[key] != null && typeof p[key] !== 'string')
        warnings.push(PP + '.' + key + ': expected text');
    });
    if (p.link != null && (typeof FlowCanon === 'undefined' || !FlowCanon.http(p.link)))
      warnings.push(PP + '.link: expected an HTTP(S) URL without credentials');
  },
});

/* image panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register('image', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var imageSrc = embeddedImageSource(panel.src);
  h = '<figure class="pimage">';
  if (imageSrc)
    h += '<img src="' + esc(imageSrc) + '" alt="' + esc(panel.alt || '') + '" decoding="async">';
  else h += '<div class="pimage-empty">Add an embedded PNG, JPEG or WebP image</div>';
  if (panel.caption) h += '<figcaption>' + esc(panel.caption) + '</figcaption>';
  var imageLink = typeof FlowCanon !== 'undefined' && FlowCanon.http(panel.link);
  if (imageLink)
    h +=
      '<a class="pimage-link" href="' +
      esc(imageLink) +
      '" target="_blank" rel="noopener noreferrer">Open reference ↗</a>';
  h += '</figure>';
  return { html: h };
});

PanelRegistry.extend('image', {
  order: 5,
  label: 'Embedded image',
  since: '0.1.0',
});

PanelRegistry.extend('image', {
  styles: [
    {
      order: 2466,
      css: String.raw`.docview .section-layout-tile>.pt-image{display:flex;flex-direction:column;}
.section-layout-tile>.pt-image>.ptitle{flex:none;}
.section-layout-tile>.pt-image>.pbody{display:flex;flex:1;min-height:0;}`,
    },
    {
      order: 2471,
      css: String.raw`@media print{
  .panelcol .pwidget.pt-image{display:block !important;break-inside:avoid;}
}`,
    },
  ],
});

/* image authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('image', {
  authoring: {
    template: { title: 'Reference image', alt: 'Embedded reference image' },
    setupFields: [
      ['src', 'image'],
      ['alt', 'text'],
      ['caption', 'text'],
      ['link', 'text'],
    ],
    patchFields: [],
    picker: {
      order: 27,
      name: 'Reference image',
      category: 'Reference',
      tagline: 'Bring your own visual',
      description:
        'Embed a screenshot, photo, or sketch beside the flow, with optional caption and source link.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.initial = builderClone(state);
      if (context.referenceImage) {
        panel.src = context.referenceImage;
        panel.caption = 'Your screenshot, photo, or sketch';
      }

      return { panel: panel, state: state, states: states, step: step };
    },
    editor: function (context) {
      return {
        setupField: function (field, panel) {
          if (field[1] !== 'image') return;
          var key = field[0],
            cur = panel[key];
          var wrap = document.createElement('div'),
            input = document.createElement('input'),
            note = document.createElement('p'),
            uploadVersion = 0;
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/webp';
          input.setAttribute('aria-label', 'Embedded image file');
          note.className = 'fnote';
          note.textContent =
            'PNG, JPEG or WebP, up to 512 KiB. Stored inside the spec; no external image request.';
          input.addEventListener('change', function () {
            var epoch = ++uploadVersion,
              file = input.files && input.files[0];
            if (!file) return;
            if (file.size > EMBEDDED_IMAGE_MAX_BYTES) {
              context.error('Image is larger than 512 KiB. Use a smaller capture.');
              input.value = '';
              return;
            }
            if (['image/png', 'image/jpeg', 'image/webp'].indexOf(file.type) < 0) {
              context.error('Choose a PNG, JPEG or WebP image.');
              input.value = '';
              return;
            }
            var original = context.source(),
              selection = JSON.stringify(context.target()),
              reader = new FileReader();
            function current() {
              return (
                epoch === uploadVersion &&
                wrap.isConnected &&
                context.source() === original &&
                JSON.stringify(context.target()) === selection
              );
            }
            reader.onerror = function () {
              if (current())
                context.error('Could not read the image. Existing content is unchanged.');
            };
            reader.onload = function () {
              if (!current()) return;
              var data = embeddedImageSource(reader.result);
              if (!data) {
                context.error('Invalid embedded image. Existing content is unchanged.');
                return;
              }
              var probe = new Image();
              probe.onload = function () {
                if (!current()) return;
                if (
                  !probe.naturalWidth ||
                  !probe.naturalHeight ||
                  probe.naturalWidth > 4096 ||
                  probe.naturalHeight > 4096
                ) {
                  context.error('Use an image no larger than 4096 × 4096 pixels.');
                  return;
                }
                if (context.commit(key, JSON.stringify(data))) context.refresh();
              };
              probe.onerror = function () {
                if (current())
                  context.error('The file is not a readable image. Existing content is unchanged.');
              };
              probe.src = data;
            };
            reader.readAsDataURL(file);
          });
          wrap.appendChild(input);
          wrap.appendChild(note);
          if (cur) {
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'bbtn';
            remove.textContent = 'Remove image';
            remove.addEventListener('click', function () {
              if (context.commit(key, null)) context.refresh();
            });
            wrap.appendChild(remove);
          }
          return context.controls.block('Image file', wrap);
        },
      };
    },
  },
});
