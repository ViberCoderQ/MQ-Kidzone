// Spot the Difference level catalog: 24 castle scenes, each a 900x670 original/modified PNG pair
// plus tap-detectable differences (radius circles, marked on both pictures when tapped). Most
// levels have exactly five, but a level can have any number (at least two) -- the game reads the
// count off each level rather than assuming five. Ported from the Cursor handoff -- two levels
// were dropped: the older JPG "castle-quest-01" (superseded by the PNG remake
// castle-royal-dragon-01) and "castle-royal-treasure-courtyard-11" (two of its five tap circles
// overlap). Several "change-N" differences still have placeholder labels pending a real
// description -- see spot-diff-align-tool.html to fill those in.
const SPOT_DIFF_LEVELS = [
  {
    "id": "castle-royal-dragon-01",
    "title": "Royal Dragon Castle",
    "original": "assets/spot-the-difference/levels/castle-royal-dragon-01/original.png",
    "modified": "assets/spot-the-difference/levels/castle-royal-dragon-01/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "potion",
        "label": "Potion bottle",
        "x": 41.6,
        "y": 144.1,
        "radius": 47
      },
      {
        "id": "cloud",
        "label": "Cloud in window",
        "x": 443.3,
        "y": 79.2,
        "radius": 52
      },
      {
        "id": "banner-star",
        "label": "Star on red banner",
        "x": 810.8,
        "y": 161.3,
        "radius": 33
      },
      {
        "id": "dragon-crown",
        "label": "Green dragon crown",
        "x": 825.5,
        "y": 263.5,
        "radius": 52
      },
      {
        "id": "present",
        "label": "Wrapped present",
        "x": 473.5,
        "y": 623.5,
        "radius": 51
      },
      {
        "id": "book-spine",
        "label": "Book spine color change",
        "x": 20,
        "y": 250.1,
        "radius": 48
      }
    ]
  },
  {
    "id": "castle-knights-reading-02",
    "title": "Knights and Dragon Storytime",
    "original": "assets/spot-the-difference/levels/castle-knights-reading-02/original.png",
    "modified": "assets/spot-the-difference/levels/castle-knights-reading-02/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "orb",
        "label": "Crystal orb",
        "x": 104.1,
        "y": 132.7,
        "radius": 37.9
      },
      {
        "id": "crown",
        "label": "Knight crown",
        "x": 202.9,
        "y": 198.5,
        "radius": 67.9
      },
      {
        "id": "cloud",
        "label": "Cloud outside window",
        "x": 462.5,
        "y": 84.9,
        "radius": 49
      },
      {
        "id": "ankle-cuff",
        "label": "Dragon ankle cuff",
        "x": 694.7,
        "y": 469.8,
        "radius": 42
      },
      {
        "id": "book",
        "label": "Green book",
        "x": 84,
        "y": 553.8,
        "radius": 70
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 735.9,
        "y": 619.7,
        "radius": 39
      }
    ]
  },
  {
    "id": "castle-knight-stables-03",
    "title": "Royal Stables Adventure",
    "original": "assets/spot-the-difference/levels/castle-knight-stables-03/original.png",
    "modified": "assets/spot-the-difference/levels/castle-knight-stables-03/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "banner",
        "label": "Royal banner emblem",
        "x": 182.1,
        "y": 81.1,
        "radius": 59
      },
      {
        "id": "plume",
        "label": "Knight helmet feather",
        "x": 275.3,
        "y": 187.1,
        "radius": 58
      },
      {
        "id": "flag",
        "label": "Castle tower flag",
        "x": 628.2,
        "y": 82,
        "radius": 72
      },
      {
        "id": "bandana",
        "label": "Dog bandana",
        "x": 477.1,
        "y": 530.9,
        "radius": 53
      },
      {
        "id": "mushrooms",
        "label": "Mushrooms in garden",
        "x": 836.4,
        "y": 574.8,
        "radius": 64
      }
    ]
  },
  {
    "id": "castle-wizard-potion-room-04",
    "title": "Royal Wizard's Potion Room",
    "original": "assets/spot-the-difference/levels/castle-wizard-potion-room-04/original.png",
    "modified": "assets/spot-the-difference/levels/castle-wizard-potion-room-04/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "wizard-hat",
        "label": "Wizard hat moon",
        "x": 225.7,
        "y": 248.2,
        "radius": 69
      },
      {
        "id": "crystal-orb",
        "label": "Crystal orb color",
        "x": 87.7,
        "y": 249.2,
        "radius": 51
      },
      {
        "id": "castle-flags",
        "label": "Castle flags",
        "x": 581.4,
        "y": 107.8,
        "radius": 66
      },
      {
        "id": "dragon-wing",
        "label": "Dragon wing",
        "x": 820,
        "y": 226.2,
        "radius": 61
      },
      {
        "id": "owl-crown",
        "label": "Owl crown",
        "x": 531.2,
        "y": 241.5,
        "radius": 47
      }
    ]
  },
  {
    "id": "castle-moonlight-lookout-05",
    "title": "Moonlight Castle Lookout",
    "original": "assets/spot-the-difference/levels/castle-moonlight-lookout-05/original.png",
    "modified": "assets/spot-the-difference/levels/castle-moonlight-lookout-05/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "banner",
        "label": "Royal banner color",
        "x": 180.9,
        "y": 102.1,
        "radius": 67.4
      },
      {
        "id": "shooting-star",
        "label": "Shooting star",
        "x": 541.1,
        "y": 94.5,
        "radius": 66
      },
      {
        "id": "telescope",
        "label": "Telescope moon emblem",
        "x": 425.3,
        "y": 253,
        "radius": 52
      },
      {
        "id": "dog-collar",
        "label": "Dog collar",
        "x": 489,
        "y": 484.1,
        "radius": 58
      },
      {
        "id": "flowers",
        "label": "Flower colors",
        "x": 826.4,
        "y": 533.7,
        "radius": 73
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 485.4,
        "y": 601.6,
        "radius": 43
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 713.9,
        "y": 154.6,
        "radius": 71
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 198.5,
        "y": 484.1,
        "radius": 80
      },
      {
        "id": "change-9",
        "label": "Change 9",
        "x": 702,
        "y": 322.7,
        "radius": 57
      },
      {
        "id": "change-10",
        "label": "Change 10",
        "x": 222.3,
        "y": 236.7,
        "radius": 60.4
      }
    ]
  },
  {
    "id": "castle-market-morning-06",
    "title": "Castle Market Morning",
    "original": "assets/spot-the-difference/levels/castle-market-morning-06/original.png",
    "modified": "assets/spot-the-difference/levels/castle-market-morning-06/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "awning",
        "label": "Market awning stripes",
        "x": 82.2,
        "y": 141.2,
        "radius": 76
      },
      {
        "id": "crown",
        "label": "Knight crown",
        "x": 231.2,
        "y": 211,
        "radius": 69
      },
      {
        "id": "grapes",
        "label": "Grapes on apple stand",
        "x": 97.7,
        "y": 311.2,
        "radius": 48
      },
      {
        "id": "horse-emblem",
        "label": "Horse chest emblem",
        "x": 362.9,
        "y": 338.9,
        "radius": 44
      },
      {
        "id": "dog-collar",
        "label": "Puppy collar and tag",
        "x": 538.6,
        "y": 553.8,
        "radius": 79
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 508.2,
        "y": 103,
        "radius": 48
      }
    ]
  },
  {
    "id": "castle-enchanted-campsite-07",
    "title": "Enchanted Castle Campsite",
    "original": "assets/spot-the-difference/levels/castle-enchanted-campsite-07/original.png",
    "modified": "assets/spot-the-difference/levels/castle-enchanted-campsite-07/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "owl",
        "label": "Owl on the branch",
        "x": 118.1,
        "y": 115.5,
        "radius": 76.4
      },
      {
        "id": "crown",
        "label": "Knight crown",
        "x": 242.2,
        "y": 199.5,
        "radius": 60.4
      },
      {
        "id": "marshmallow",
        "label": "Extra marshmallow",
        "x": 435.1,
        "y": 319.8,
        "radius": 46
      },
      {
        "id": "wing",
        "label": "Dragon wing color",
        "x": 693.2,
        "y": 350.4,
        "radius": 67
      },
      {
        "id": "collar",
        "label": "Husky bandana",
        "x": 662.7,
        "y": 535.7,
        "radius": 60
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 443.3,
        "y": 60.1,
        "radius": 66
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 330.9,
        "y": 622.6,
        "radius": 46
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 72.1,
        "y": 580.5,
        "radius": 60
      },
      {
        "id": "change-9",
        "label": "Change 9",
        "x": 841.9,
        "y": 510.8,
        "radius": 79
      }
    ]
  },
  {
    "id": "castle-griffin-treasure-08",
    "title": "Griffin Treasure Courtyard",
    "original": "assets/spot-the-difference/levels/castle-griffin-treasure-08/original.png",
    "modified": "assets/spot-the-difference/levels/castle-griffin-treasure-08/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "orb",
        "label": "Wizard staff crystal",
        "x": 55.7,
        "y": 260.6,
        "radius": 44
      },
      {
        "id": "hat",
        "label": "Witch hat buckle and band",
        "x": 439.7,
        "y": 225.3,
        "radius": 52
      },
      {
        "id": "griffin",
        "label": "Griffin scarf",
        "x": 596.9,
        "y": 402.9,
        "radius": 66
      },
      {
        "id": "gem",
        "label": "Treasure chest gemstone",
        "x": 368.3,
        "y": 481.2,
        "radius": 46
      },
      {
        "id": "scroll",
        "label": "Scroll wax seal",
        "x": 719.4,
        "y": 603.5,
        "radius": 43.9
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 833.7,
        "y": 571,
        "radius": 61.9
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 846.5,
        "y": 343.7,
        "radius": 48
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 669.1,
        "y": 74.4,
        "radius": 68
      }
    ]
  },
  {
    "id": "castle-royal-sunset-study-09",
    "title": "Royal Sunset Study",
    "original": "assets/spot-the-difference/levels/castle-royal-sunset-study-09/original.png",
    "modified": "assets/spot-the-difference/levels/castle-royal-sunset-study-09/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "crown-gems",
        "label": "Crown gemstones change red to blue",
        "x": 356,
        "y": 185,
        "radius": 80
      },
      {
        "id": "quill",
        "label": "Writing feather changes from cream to blue",
        "x": 325.6,
        "y": 399.1,
        "radius": 56.4
      },
      {
        "id": "globe",
        "label": "Telescope is replaced by a globe",
        "x": 121.5,
        "y": 313.1,
        "radius": 80
      },
      {
        "id": "goblet",
        "label": "Goblet gemstone changes blue to red",
        "x": 565.8,
        "y": 502.2,
        "radius": 48
      },
      {
        "id": "fox-collar",
        "label": "Fox wears a blue collar with a medallion",
        "x": 674.6,
        "y": 584.4,
        "radius": 53
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 436.3,
        "y": 621.6,
        "radius": 47
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 433.3,
        "y": 420.1,
        "radius": 40.4
      }
    ]
  },
  {
    "id": "castle-archery-courtyard-10",
    "title": "Royal Archery Courtyard",
    "original": "assets/spot-the-difference/levels/castle-archery-courtyard-10/original.png",
    "modified": "assets/spot-the-difference/levels/castle-archery-courtyard-10/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "owl-hat",
        "label": "Owl wears a blue cap",
        "x": 69.4,
        "y": 183.3,
        "radius": 48
      },
      {
        "id": "crown",
        "label": "Young knight wears a crown",
        "x": 223.9,
        "y": 190.9,
        "radius": 69
      },
      {
        "id": "target",
        "label": "Gold crown appears on archery target",
        "x": 737.7,
        "y": 311.2,
        "radius": 52
      },
      {
        "id": "shield",
        "label": "Shield emblem changes to fleur-de-lis",
        "x": 745.9,
        "y": 529,
        "radius": 59
      },
      {
        "id": "dog-bandana",
        "label": "Dog bandana changes to red paw print",
        "x": 533.8,
        "y": 540.4,
        "radius": 56
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 660,
        "y": 77.3,
        "radius": 66
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 78.5,
        "y": 408.6,
        "radius": 70
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 351,
        "y": 299.8,
        "radius": 42
      }
    ]
  },
  {
    "id": "castle-enchanted-library-12",
    "title": "Enchanted Castle Library",
    "original": "assets/spot-the-difference/levels/castle-enchanted-library-12/original.png",
    "modified": "assets/spot-the-difference/levels/castle-enchanted-library-12/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "princess-gem",
        "label": "Princess tiara gemstone",
        "x": 191.9,
        "y": 215.7,
        "radius": 47
      },
      {
        "id": "wizard-hat",
        "label": "Wizard hat band and buckle",
        "x": 373.8,
        "y": 168,
        "radius": 62
      },
      {
        "id": "owl-scarf",
        "label": "Owl gains a blue scarf",
        "x": 807.2,
        "y": 158.4,
        "radius": 52
      },
      {
        "id": "potion",
        "label": "Large potion changes blue to green",
        "x": 803.8,
        "y": 433.5,
        "radius": 53.4
      },
      {
        "id": "map-mark",
        "label": "Red X appears on the parchment map",
        "x": 537.7,
        "y": 617.8,
        "radius": 49
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 323.5,
        "y": 529,
        "radius": 55
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 773.4,
        "y": 545.2,
        "radius": 49.4
      }
    ]
  },
  {
    "id": "castle-royal-map-council-13",
    "title": "Royal Map Council",
    "original": "assets/spot-the-difference/levels/castle-royal-map-council-13/original.png",
    "modified": "assets/spot-the-difference/levels/castle-royal-map-council-13/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "prince-crown",
        "label": "Prince crown jewel changes blue to red",
        "x": 254.1,
        "y": 201.4,
        "radius": 54
      },
      {
        "id": "princess-tiara",
        "label": "Princess tiara jewel changes blue to red",
        "x": 478,
        "y": 200.5,
        "radius": 61
      },
      {
        "id": "dragon-wing",
        "label": "Dragon wing membrane changes from gold to red",
        "x": 837.6,
        "y": 231,
        "radius": 68
      },
      {
        "id": "puppy-collar",
        "label": "Puppy collar changes blue to red",
        "x": 675.5,
        "y": 452.6,
        "radius": 44.4
      },
      {
        "id": "map-mark",
        "label": "Red X appears on the map",
        "x": 660.2,
        "y": 599.6,
        "radius": 48
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 815.4,
        "y": 567.2,
        "radius": 62
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 515.5,
        "y": 553.8,
        "radius": 41
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 587.8,
        "y": 493.6,
        "radius": 39.4
      },
      {
        "id": "change-9",
        "label": "Change 9",
        "x": 283.3,
        "y": 607.3,
        "radius": 48
      }
    ]
  },
  {
    "id": "castle-midnight-stargazing-14",
    "title": "Midnight Castle Stargazing",
    "original": "assets/spot-the-difference/levels/castle-midnight-stargazing-14/original.png",
    "modified": "assets/spot-the-difference/levels/castle-midnight-stargazing-14/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "owl-scarf",
        "label": "Owl wears a blue royal scarf",
        "x": 181,
        "y": 218,
        "radius": 46
      },
      {
        "id": "wizard-hat",
        "label": "Wizard hat band changes from blue to red",
        "x": 385.7,
        "y": 190.9,
        "radius": 59
      },
      {
        "id": "telescope-gem",
        "label": "Red gemstone appears on telescope",
        "x": 716.7,
        "y": 240.6,
        "radius": 41
      },
      {
        "id": "storybook-moon",
        "label": "Crescent moon appears in the spellbook",
        "x": 401.5,
        "y": 551.9,
        "radius": 75
      },
      {
        "id": "scroll-ribbon",
        "label": "Scroll ribbon changes from red to blue",
        "x": 544.8,
        "y": 605.4,
        "radius": 52
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 310.7,
        "y": 296,
        "radius": 46
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 653.6,
        "y": 458.3,
        "radius": 58
      }
    ]
  },
  {
    "id": "castle-unicorn-garden-15",
    "title": "Unicorn Garden at Sunset",
    "original": "assets/spot-the-difference/levels/castle-unicorn-garden-15/original.png",
    "modified": "assets/spot-the-difference/levels/castle-unicorn-garden-15/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "songbird",
        "label": "Blue songbird becomes red",
        "x": 108.9,
        "y": 204.3,
        "radius": 58
      },
      {
        "id": "princess-gem",
        "label": "Princess tiara gem turns red",
        "x": 535,
        "y": 264,
        "radius": 42
      },
      {
        "id": "shield",
        "label": "Shield lion becomes fleur-de-lis",
        "x": 785.5,
        "y": 306.5,
        "radius": 65
      },
      {
        "id": "fox-collar",
        "label": "Fox collar and medallion change",
        "x": 426.2,
        "y": 520.4,
        "radius": 47
      },
      {
        "id": "scroll-ribbon",
        "label": "Scroll ribbon changes blue to red",
        "x": 589.8,
        "y": 599.6,
        "radius": 56
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 256.1,
        "y": 427.7,
        "radius": 46
      }
    ]
  },
  {
    "id": "castle-royal-bakery-16",
    "title": "Royal Castle Bakery",
    "original": "assets/spot-the-difference/levels/castle-royal-bakery-16/original.png",
    "modified": "assets/spot-the-difference/levels/castle-royal-bakery-16/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "banner",
        "label": "Royal banner symbol",
        "x": 175,
        "y": 105,
        "radius": 72
      },
      {
        "id": "chef-band",
        "label": "Chef hat band changes color",
        "x": 289.7,
        "y": 210,
        "radius": 71
      },
      {
        "id": "dragon-apron",
        "label": "Dragon apron symbol",
        "x": 638,
        "y": 363.8,
        "radius": 43
      },
      {
        "id": "berries",
        "label": "Strawberries become blueberries",
        "x": 81.3,
        "y": 571.9,
        "radius": 70
      },
      {
        "id": "duck-bow",
        "label": "Duckling bow tie",
        "x": 670,
        "y": 551.9,
        "radius": 47
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 550.3,
        "y": 242.5,
        "radius": 42
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 788,
        "y": 334.2,
        "radius": 46
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 472.6,
        "y": 408.6,
        "radius": 80
      }
    ]
  },
  {
    "id": "castle-enchanted-archery-garden-17",
    "title": "Enchanted Archery Garden",
    "original": "assets/spot-the-difference/levels/castle-enchanted-archery-garden-17/original.png",
    "modified": "assets/spot-the-difference/levels/castle-enchanted-archery-garden-17/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "owl-scarf",
        "label": "Owl wears a blue scarf",
        "x": 193.7,
        "y": 106.9,
        "radius": 60
      },
      {
        "id": "arrow-feathers",
        "label": "Quiver feathers change red to blue",
        "x": 133.4,
        "y": 280.7,
        "radius": 37
      },
      {
        "id": "shield-emblem",
        "label": "Shield lion changes to fleur-de-lis",
        "x": 159.9,
        "y": 555.7,
        "radius": 67.6
      },
      {
        "id": "deer-collar",
        "label": "Deer gains a blue royal collar",
        "x": 437.8,
        "y": 432.5,
        "radius": 51
      },
      {
        "id": "rabbit-bow",
        "label": "Rabbit gains a blue bow",
        "x": 606,
        "y": 554.8,
        "radius": 47
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 784.3,
        "y": 142.2,
        "radius": 51
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 216.6,
        "y": 365.7,
        "radius": 69
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 293.4,
        "y": 501.3,
        "radius": 63.6
      }
    ]
  },
  {
    "id": "castle-outdoor-festival-camp-18",
    "title": "Castle Festival Campout",
    "original": "assets/spot-the-difference/levels/castle-outdoor-festival-camp-18/original.png",
    "modified": "assets/spot-the-difference/levels/castle-outdoor-festival-camp-18/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "tiara-gem",
        "label": "Princess tiara gemstone",
        "x": 475.6,
        "y": 184.2,
        "radius": 53
      },
      {
        "id": "dog-medallion",
        "label": "Husky medallion",
        "x": 363.8,
        "y": 390.5,
        "radius": 43
      },
      {
        "id": "treasure-chest",
        "label": "Treasure chest changes color",
        "x": 126.3,
        "y": 562.4,
        "radius": 72.9
      },
      {
        "id": "raccoon-item",
        "label": "Raccoon holds an apple instead of a nut",
        "x": 706.9,
        "y": 532.8,
        "radius": 58
      },
      {
        "id": "mushroom",
        "label": "Mushroom changes color",
        "x": 255.2,
        "y": 608.2,
        "radius": 50.9
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 125.4,
        "y": 388.6,
        "radius": 80
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 756.9,
        "y": 362.8,
        "radius": 78
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 520.1,
        "y": 440.2,
        "radius": 80
      }
    ]
  },
  {
    "id": "castle-forest-training-camp-19",
    "title": "Royal Forest Training Camp",
    "original": "assets/spot-the-difference/levels/castle-forest-training-camp-19/original.png",
    "modified": "assets/spot-the-difference/levels/castle-forest-training-camp-19/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "banner-emblem",
        "label": "Banner lion becomes a fleur-de-lis",
        "x": 91,
        "y": 106,
        "radius": 70
      },
      {
        "id": "owl-scarf",
        "label": "Owl gains a blue scarf",
        "x": 613,
        "y": 123,
        "radius": 35
      },
      {
        "id": "arrow-fletching",
        "label": "Arrow feathers change color",
        "x": 720.6,
        "y": 211,
        "radius": 35
      },
      {
        "id": "flower-color",
        "label": "Flower in the girl’s hair changes color",
        "x": 434.4,
        "y": 313.1,
        "radius": 47
      },
      {
        "id": "puppy-medallion",
        "label": "Puppy medallion changes emblem",
        "x": 354.9,
        "y": 489.8,
        "radius": 50
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 665.5,
        "y": 557.6,
        "radius": 73
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 385.7,
        "y": 47.7,
        "radius": 53
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 212.9,
        "y": 147.9,
        "radius": 41
      },
      {
        "id": "change-9",
        "label": "Change 9",
        "x": 143.7,
        "y": 414.4,
        "radius": 80
      }
    ]
  },
  {
    "id": "castle-royal-forest-picnic-20",
    "title": "Royal Forest Picnic",
    "original": "assets/spot-the-difference/levels/castle-royal-forest-picnic-20/original.png",
    "modified": "assets/spot-the-difference/levels/castle-royal-forest-picnic-20/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "crown-gem",
        "label": "Tiara gemstone changes blue to red",
        "x": 407.9,
        "y": 212.9,
        "radius": 48
      },
      {
        "id": "tent-flag",
        "label": "Tent flag changes gold to red",
        "x": 767.2,
        "y": 64.8,
        "radius": 47.9
      },
      {
        "id": "fruit",
        "label": "Apple in fruit bowl changes red to yellow",
        "x": 342.1,
        "y": 494.6,
        "radius": 53
      },
      {
        "id": "pie",
        "label": "Pie gains three cherries",
        "x": 475.6,
        "y": 477.4,
        "radius": 32
      },
      {
        "id": "potion",
        "label": "Potion changes blue to purple",
        "x": 608.1,
        "y": 557.6,
        "radius": 49
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 175.4,
        "y": 559.5,
        "radius": 77
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 782.5,
        "y": 194.7,
        "radius": 69.9
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 206.5,
        "y": 124.1,
        "radius": 44
      }
    ]
  },
  {
    "id": "castle-enchanted-unicorn-story-grove-21",
    "title": "Enchanted Unicorn Story Grove",
    "original": "assets/spot-the-difference/levels/castle-enchanted-unicorn-story-grove-21/original.png",
    "modified": "assets/spot-the-difference/levels/castle-enchanted-unicorn-story-grove-21/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "owl-eyes",
        "label": "Owl closes its eyes",
        "x": 106.2,
        "y": 48.8,
        "radius": 28
      },
      {
        "id": "pennant",
        "label": "A blue pennant becomes red",
        "x": 405.2,
        "y": 105,
        "radius": 37
      },
      {
        "id": "sleeve-flower",
        "label": "A flower appears on the girl’s sleeve",
        "x": 587.8,
        "y": 387.6,
        "radius": 54
      },
      {
        "id": "map-mark",
        "label": "A red mark appears on the map",
        "x": 516.4,
        "y": 545.2,
        "radius": 37.4
      },
      {
        "id": "hedgehog-apple",
        "label": "Hedgehog holds a green apple instead of red",
        "x": 713.9,
        "y": 576.7,
        "radius": 39.9
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 550.3,
        "y": 204.3,
        "radius": 59
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 327.2,
        "y": 264.4,
        "radius": 80
      },
      {
        "id": "change-8",
        "label": "Change 8",
        "x": 619.8,
        "y": 536.6,
        "radius": 49.3
      },
      {
        "id": "change-9",
        "label": "Change 9",
        "x": 846.5,
        "y": 612.1,
        "radius": 58
      }
    ]
  },
  {
    "id": "castle-sunlit-royal-stable-22",
    "title": "Sunlit Royal Stable",
    "original": "assets/spot-the-difference/levels/castle-sunlit-royal-stable-22/original.png",
    "modified": "assets/spot-the-difference/levels/castle-sunlit-royal-stable-22/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "horseshoe",
        "label": "Horseshoe changes from gold to silver",
        "x": 610,
        "y": 67,
        "radius": 47
      },
      {
        "id": "stable-pennant",
        "label": "Stable pennant changes from blue to red",
        "x": 781.8,
        "y": 116.4,
        "radius": 56
      },
      {
        "id": "flower-crown",
        "label": "Flowers in the girl’s hair change from white to pink",
        "x": 641,
        "y": 234.8,
        "radius": 66
      },
      {
        "id": "cat-eyes",
        "label": "Cat opens its green eyes",
        "x": 129.1,
        "y": 507,
        "radius": 35
      },
      {
        "id": "apple",
        "label": "Apple changes from red to green",
        "x": 227,
        "y": 602,
        "radius": 43
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 450.6,
        "y": 516.6,
        "radius": 56
      },
      {
        "id": "change-7",
        "label": "Change 7",
        "x": 379.3,
        "y": 165.1,
        "radius": 80
      }
    ]
  },
  {
    "id": "castle-donkey-stable-23",
    "title": "The Donkey Grooming Stable",
    "original": "assets/spot-the-difference/levels/castle-donkey-stable-23/original.png",
    "modified": "assets/spot-the-difference/levels/castle-donkey-stable-23/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "hair-flower",
        "label": "Flower in the stable helper’s hair changes from white to purple",
        "x": 632.6,
        "y": 211,
        "radius": 52
      },
      {
        "id": "pitchfork",
        "label": "Pitchfork tines change from golden to silver",
        "x": 825.5,
        "y": 163.2,
        "radius": 68
      },
      {
        "id": "goat-eyes",
        "label": "Resting goat opens its eyes",
        "x": 723.1,
        "y": 453.5,
        "radius": 28
      },
      {
        "id": "apple",
        "label": "One apple in the basket changes from red to green",
        "x": 577.7,
        "y": 541.4,
        "radius": 29
      },
      {
        "id": "bucket-foam",
        "label": "Soap bubbles in the washing bucket change shape",
        "x": 69.6,
        "y": 512.7,
        "radius": 80
      }
    ]
  },
  {
    "id": "castle-horse-grooming-stable-24",
    "title": "The Royal Horse Grooming Stable",
    "original": "assets/spot-the-difference/levels/castle-horse-grooming-stable-24/original.png",
    "modified": "assets/spot-the-difference/levels/castle-horse-grooming-stable-24/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "flower",
        "label": "Flower in girl’s hair changes from white to purple",
        "x": 653.6,
        "y": 264.4,
        "radius": 38.3
      },
      {
        "id": "books",
        "label": "One book on upper shelf changes from red to green",
        "x": 802.6,
        "y": 72.5,
        "radius": 44
      },
      {
        "id": "apple",
        "label": "One apple in the basket changes from red to green",
        "x": 743,
        "y": 483,
        "radius": 27
      },
      {
        "id": "water",
        "label": "Water in the wooden bucket has a different bubble pattern",
        "x": 374.7,
        "y": 539.5,
        "radius": 69
      },
      {
        "id": "rooster",
        "label": "Small details of the rooster’s feathers change",
        "x": 732.2,
        "y": 203.3,
        "radius": 48.3
      }
    ]
  },
  {
    "id": "castle-llama-harvest-stable-25",
    "title": "The Llama Harvest Stable",
    "original": "assets/spot-the-difference/levels/castle-llama-harvest-stable-25/original.png",
    "modified": "assets/spot-the-difference/levels/castle-llama-harvest-stable-25/modified.png",
    "imageWidth": 900,
    "imageHeight": 670,
    "differences": [
      {
        "id": "jug",
        "label": "Ceramic jug changes from green to blue",
        "x": 754,
        "y": 76,
        "radius": 63
      },
      {
        "id": "llama-smile",
        "label": "Llama changes from open-mouthed to closed-mouth smile",
        "x": 470,
        "y": 246,
        "radius": 30
      },
      {
        "id": "feed",
        "label": "Golden hay bundle changes to green grass",
        "x": 379,
        "y": 355,
        "radius": 64
      },
      {
        "id": "duck-wing",
        "label": "Duckling raises one wing",
        "x": 366.5,
        "y": 536.6,
        "radius": 47
      },
      {
        "id": "ladybug",
        "label": "A tiny ladybug appears in the straw",
        "x": 489,
        "y": 615.9,
        "radius": 41
      },
      {
        "id": "change-6",
        "label": "Change 6",
        "x": 557.6,
        "y": 490.8,
        "radius": 59
      }
    ]
  }
];
