// Hollow, editable geometric outlines for Free Draw -- unlike stickers (solid, pinch-resize/
// rotate only), every one of these starts as a regular polygon but each corner can be dragged
// independently: a Rectangle pulled into a trapezoid, a Triangle pulled from equilateral into
// scalene/acute/obtuse, and so on. They're stamped as a stroked outline only, never filled, so
// the bucket tool can color either the inside or the outside once placed.
//
// Vertices are normalized to a [-0.5, 0.5] unit box, in order around the polygon (so connecting
// them in sequence, then closing back to the first, draws the outline with no crossed edges);
// placement scales + positions them to real canvas coordinates.

function regularPolygonVertices(sides, pointUp) {
  const verts = [];
  const offset = pointUp ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / sides;
  for (let i = 0; i < sides; i++) {
    const angle = offset + (Math.PI * 2 * i) / sides;
    verts.push({ x: Math.cos(angle) * 0.5, y: Math.sin(angle) * 0.5 });
  }
  return verts;
}

// A true smooth curve, approximated with enough points that no facet is ever visible -- unlike
// the other shapes, the Circle isn't reshaped by dragging individual corners (see app.js), it's
// pinch-stretched into an oval, so it needs to stay perfectly round-looking at any width/height.
function ellipseVertices(cx, cy, rx, ry, count) {
  const verts = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    verts.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return verts;
}

const SHAPE_CATALOG = [
  // Only used for this entry's picker thumbnail -- live placement/stretching uses
  // ellipseVertices() directly (see startShapePlacement/currentShapeVertices in app.js).
  { id: 'shape_circle', name: 'Circle', vertices: ellipseVertices(0, 0, 0.5, 0.5, 32) },
  { id: 'shape_triangle', name: 'Triangle', vertices: regularPolygonVertices(3, true) },
  {
    id: 'shape_rectangle', name: 'Rectangle',
    vertices: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }],
  },
  { id: 'shape_pentagon', name: 'Pentagon', vertices: regularPolygonVertices(5, true) },
  { id: 'shape_hexagon', name: 'Hexagon', vertices: regularPolygonVertices(6, true) },
];

function findShapeTemplate(id) {
  return SHAPE_CATALOG.find((s) => s.id === id) || null;
}

// Draws a closed outline through a set of absolute-coordinate vertices -- shared by the live
// placement preview (app.js) and nothing else, since the final stamp (CanvasEngine.stampPolygon)
// builds its own path directly to also compute the undo-patch bounding box from the same points.
function strokePolygonPath(ctx, vertices) {
  if (!vertices.length) return;
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.closePath();
  ctx.stroke();
}
