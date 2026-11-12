// Coloring Book catalog. Three animal categories, each backed by real line-art PNGs (not
// procedurally drawn) under assets/templates/<category>/. A category's "cover" names one of its
// own item ids, reused as the thumbnail on the category-picker card so there's only one place
// (ANIMAL_CATEGORIES itself) to add a new animal or swap a cover.
const ANIMAL_CATEGORIES = [
  {
    id: 'mammals', name: 'Mammals', emoji: '🐾', cover: 'giraffe',
    items: [
      { id: 'giraffe', name: 'Giraffe', src: 'assets/templates/mammals/giraffe.png?v=4' },
      { id: 'horse', name: 'Horse', src: 'assets/templates/mammals/horse.png?v=3' },
      { id: 'husky', name: 'Husky', src: 'assets/templates/mammals/husky.png?v=4' },
      { id: 'lion', name: 'Lion', src: 'assets/templates/mammals/lion.png?v=3' },
      { id: 'tiger', name: 'Tiger', src: 'assets/templates/mammals/tiger.png?v=1' },
    ],
  },
  {
    id: 'insects', name: 'Insects', emoji: '🐛', cover: 'caterpillar',
    items: [
      { id: 'caterpillar', name: 'Caterpillar', src: 'assets/templates/insects/caterpillar.png?v=3' },
      { id: 'butterfly', name: 'Butterfly', src: 'assets/templates/insects/butterfly.png?v=1' },
      { id: 'praying_mantis', name: 'Praying Mantis', src: 'assets/templates/insects/praying_mantis.png?v=1' },
      { id: 'cicada', name: 'Cicada', src: 'assets/templates/insects/cicada.png?v=1' },
      { id: 'stag_beetle', name: 'Stag Beetle', src: 'assets/templates/insects/stag_beetle.png?v=1' },
    ],
  },
  {
    id: 'reptiles', name: 'Reptiles', emoji: '🦎', cover: 'sea_turtle',
    items: [
      { id: 'alligator', name: 'Alligator', src: 'assets/templates/reptiles/alligator.png?v=1' },
      { id: 'sea_turtle', name: 'Sea Turtle', src: 'assets/templates/reptiles/sea_turtle.png?v=1' },
      { id: 'snake', name: 'Snake', src: 'assets/templates/reptiles/snake.png?v=1' },
      { id: 'chameleon', name: 'Chameleon', src: 'assets/templates/reptiles/chameleon.png?v=1' },
      { id: 'gecko', name: 'Gecko', src: 'assets/templates/reptiles/gecko.png?v=1' },
    ],
  },
  {
    id: 'seasonal', name: 'Seasonal', emoji: '🎃', cover: 'witch',
    items: [
      { id: 'ghost', name: 'Ghost', src: 'assets/templates/seasonal/ghost.png?v=1' },
      { id: 'spotted_ghost', name: 'Spotted Ghost', src: 'assets/templates/seasonal/spotted_ghost.png?v=1' },
      { id: 'witch', name: 'Witch', src: 'assets/templates/seasonal/witch.png?v=1' },
      { id: 'pikachu', name: 'Pikachu', src: 'assets/templates/seasonal/pikachu.png?v=1' },
      { id: 'reindeer', name: 'Reindeer', src: 'assets/templates/seasonal/reindeer.png?v=1' },
      { id: 'santa', name: 'Santa', src: 'assets/templates/seasonal/santa.png?v=1' },
      { id: 'jack_o_lantern', name: 'Jack o’ Lantern', src: 'assets/templates/seasonal/jack_o_lantern.png?v=1' },
    ],
  },
  {
    id: 'family', name: 'Family', emoji: '👪', cover: 'family_five',
    items: [
      { id: 'family_five', name: 'Family Five', src: 'assets/templates/family/family_five.png?v=1' },
      { id: 'husky_head', name: 'Husky Head', src: 'assets/templates/family/husky_head.png?v=1' },
    ],
  },
  {
    id: 'tv_movie', name: 'TV and Movie', emoji: '🎬', cover: 'robot',
    items: [
      { id: 'robot', name: 'Robot Hero', src: 'assets/templates/tv_movie/robot.png?v=1' },
      { id: 'wizard', name: 'Wizard', src: 'assets/templates/tv_movie/wizard.png?v=1' },
    ],
  },
  {
    id: 'birds', name: 'Birds', emoji: '🎨', cover: 'parrot',
    items: [
      { id: 'parrot', name: 'Parrot', src: 'assets/templates/birds/parrot.png?v=1' },
      { id: 'owl', name: 'Owl', src: 'assets/templates/birds/owl.png?v=1' },
      { id: 'peacock', name: 'Peacock', src: 'assets/templates/birds/peacock.png?v=1' },
      { id: 'toucan', name: 'Toucan', src: 'assets/templates/birds/toucan.png?v=1' },
    ],
  },

  {
    id: 'dinosaurs', name: 'Dinosaurs', emoji: '🎨', cover: 'stegosaurus',
    items: [
      { id: 'stegosaurus', name: 'Stegosaurus', src: 'assets/templates/dinosaurs/stegosaurus.png?v=1' },
      { id: 'brontosaurus', name: 'Brontosaurus', src: 'assets/templates/dinosaurs/brontosaurus.png?v=1' },
      { id: 'pterodactyl', name: 'Pterodactyl', src: 'assets/templates/dinosaurs/pterodactyl.png?v=1' },
      { id: 't_rex', name: 'T Rex', src: 'assets/templates/dinosaurs/t_rex.png?v=1' },
    ],
  },

];

function findCategory(id) {
  return ANIMAL_CATEGORIES.find((c) => c.id === id) || null;
}

function findTemplate(id) {
  for (const cat of ANIMAL_CATEGORIES) {
    const item = cat.items.find((t) => t.id === id);
    if (item) return item;
  }
  return null;
}
