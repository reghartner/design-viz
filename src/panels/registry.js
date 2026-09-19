/* Trusted, build-discovered panel definitions. Registration is DOM-free so the
   same contracts can validate specs in a packaged backend. */
var PanelRegistry = (function () {
  var definitions = Object.create(null),
    typeIds = [];
  function extend(type, facets) {
    if (
      !/^[a-z][a-z0-9-]*$/.test(type) ||
      !facets ||
      typeof facets !== 'object' ||
      Array.isArray(facets)
    )
      throw new Error('Invalid panel definition: ' + type);
    var definition = definitions[type];
    if (!definition) {
      definition = definitions[type] = Object.create(null);
      typeIds.push(type);
    }
    Object.keys(facets).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(definition, key))
        throw new Error('Duplicate panel definition: ' + type + '.' + key);
    });
    Object.keys(facets).forEach(function (key) {
      definition[key] = facets[key];
    });
    typeIds.sort(function (a, b) {
      var left = definitions[a].order,
        right = definitions[b].order;
      return (
        (left == null ? 10000 : left) - (right == null ? 10000 : right) ||
        (a < b ? -1 : a > b ? 1 : 0)
      );
    });
    return definition;
  }
  return {
    extend: extend,
    define: extend,
    get: function (type) {
      return definitions[type];
    },
    types: function () {
      return typeIds.slice();
    },
    typeIds: typeIds,
  };
})();
// Compatibility alias; populated by module discovery, never a handwritten list.
var PANEL_TYPES = PanelRegistry.typeIds;

function panelCapability(type, key, fallback) {
  var definition = PanelRegistry.get(type),
    layout = definition && definition.layout;
  return layout && Object.prototype.hasOwnProperty.call(layout, key) ? layout[key] : fallback;
}

/* Mutates the caller's clone, never the source spec. '*' visits array elements
   or own object values. A mapped null removes the reference; absent mappings
   preserve it. The same metadata serves rename, delete and cross-spec paste. */
function panelRemapReferences(panel, kind, mapping, exists) {
  var definition = panel && PanelRegistry.get(panel.type);
  var paths = (definition && definition.references && definition.references[kind]) || [];
  paths.forEach(function (path) {
    var parts = path.split('.');
    function visit(object, index) {
      if (!object || typeof object !== 'object') return;
      var part = parts[index];
      var keys = part === '*' ? Object.keys(object) : [part];
      keys.forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(object, key)) return;
        if (index < parts.length - 1) {
          visit(object[key], index + 1);
          return;
        }
        var value = object[key];
        if (typeof value !== 'string') {
          if (exists) delete object[key];
          return;
        }
        if (mapping && Object.prototype.hasOwnProperty.call(mapping, value)) {
          if (mapping[value] == null) delete object[key];
          else object[key] = mapping[value];
        } else if (exists && !exists(value)) delete object[key];
      });
    }
    visit(panel, 0);
  });
  return panel;
}
