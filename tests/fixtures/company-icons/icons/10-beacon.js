// Deliberately distinctive geometry: tests assert the paths, not just the ID.
defineIcon({id:'acme-beacon', label:'Acme beacon', category:'Acme equipment', tone:'teal',
  svg:shapes.path('M3 20 12 2 21 20 12 15Z', 'wash') + shapes.detail(shapes.path('M12 7v5M8 20h8'))});
