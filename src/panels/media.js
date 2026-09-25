/* Offline raster assets shared by image panels, app screens and company logos. */
var EMBEDDED_IMAGE_MAX_BYTES = 512 * 1024;
/* Raster data only: images travel with the spec and never fetch remote assets. */
function embeddedImageSource(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(EMBEDDED_IMAGE_MAX_BYTES / 3) * 4 + 32)
    return null;
  var match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  var bytes =
    (match[2].length * 3) / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  return bytes <= EMBEDDED_IMAGE_MAX_BYTES ? value : null;
}

