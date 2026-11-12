// Catalog of selectable stylus types for Free Draw, grouped by category for the stylus picker
// overlay. This is the single place to register a new stylus for the UI -- actually drawing
// with it still needs matching logic in js/canvas-engine.js (either a TOOL_STYLES entry for a
// line-based stylus, or a special case in the pointer handlers for something like spray/bucket).
const STYLUS_CATALOG = [
  { id: 'paintbrush', emoji: '🖌️', label: 'Brush', category: 'Draw' },
  { id: 'pen', emoji: '✒️', label: 'Pen', category: 'Draw' },
  { id: 'marker', emoji: '🖊️', label: 'Marker', category: 'Draw' },
  { id: 'crayon', emoji: '🖍️', label: 'Crayon', category: 'Draw' },
  { id: 'spray', emoji: '💨', label: 'Spray', category: 'Effects' },
  { id: 'glitter', emoji: '✨', label: 'Glitter', category: 'Effects' },
  { id: 'bucket', emoji: '🪣', label: 'Bucket', category: 'Fill' },
  { id: 'eraser', emoji: '🧽', label: 'Erase', category: 'Erase' },
];

const STYLUS_CATEGORY_ORDER = ['Draw', 'Effects', 'Fill', 'Erase'];

function findStylus(id) {
  return STYLUS_CATALOG.find((s) => s.id === id);
}
