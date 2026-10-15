/**
 * Built-in 3D samples. Files, sources and licences: public/samples/README.md;
 * the credits are on the About page (ui/about.mjs). Names are in the locale
 * files (`sample.<key>.label`). `category` puts each sample in one section of
 * the sample library; within a section the order here is kept. The start page
 * shows only FEATURED. `thumb` is a picture of the brick version (made with
 * `tools/thumbs.sh`, see app/README.md).
 */
export const SAMPLES = {
  fox: { url: '/samples/fox.glb', category: 'animals' },
  chick: { url: '/samples/kenney-pets/animal-chick.glb', category: 'animals' },
  panda: { url: '/samples/kenney-pets/animal-panda.glb', category: 'animals' },
  penguin: { url: '/samples/kenney-pets/animal-penguin.glb', category: 'animals' },
  elephant: { url: '/samples/kenney-pets/animal-elephant.glb', category: 'animals' },
  lion: { url: '/samples/kenney-pets/animal-lion.glb', category: 'animals' },
  giraffe: { url: '/samples/kenney-pets/animal-giraffe.glb', category: 'animals' },
  bunny: { url: '/samples/kenney-pets/animal-bunny.glb', category: 'animals' },
  pig: { url: '/samples/kenney-pets/animal-pig.glb', category: 'animals' },
  coinblock: { url: '/samples/kenney-platformer/block-coin.glb', category: 'things' },
  cupcake: { url: '/samples/kenney-food/cupcake.glb', category: 'things' },
  donut: { url: '/samples/kenney-food/donut-sprinkles.glb', category: 'things' },
  icecream: { url: '/samples/kenney-food/ice-cream.glb', category: 'things' },
  pizza: { url: '/samples/kenney-food/pizza.glb', category: 'things' },
  mushroom: { url: '/samples/kenney-food/mushroom.glb', category: 'things' },
  banana: { url: '/samples/kenney-food/banana.glb', category: 'things' },
  cart: { url: '/samples/kenney-fantasy/cart.glb', category: 'things' },
  trees: { url: '/samples/kenney-city/grass-trees-tall.glb', category: 'scenery' },
  truck: { url: '/samples/kenney-racing/vehicle-truck-red.glb', category: 'vehicles' },
  firetruck: { url: '/samples/kenney-cars/firetruck.glb', category: 'vehicles' },
  police: { url: '/samples/kenney-cars/police.glb', category: 'vehicles' },
  taxi: { url: '/samples/kenney-cars/taxi.glb', category: 'vehicles' },
  van: { url: '/samples/kenney-cars/van.glb', category: 'vehicles' },
  sportscar: { url: '/samples/kenney-cars/sedan-sports.glb', category: 'vehicles' },
  fountain: { url: '/samples/kenney-city/pavement-fountain.glb', category: 'scenery' },
  cypress: { url: '/samples/kenney-suburban/tree-large.glb', category: 'scenery' },
  roundtree: { url: '/samples/kenney-fantasy/tree-high-round.glb', category: 'scenery' },
  planter: { url: '/samples/kenney-suburban/planter.glb', category: 'scenery' },
  shop: { url: '/samples/kenney-city/building-small-a.glb', category: 'buildings' },
  apartment: { url: '/samples/kenney-city/building-small-c.glb', category: 'buildings' },
  cafe: { url: '/samples/kenney-city/building-small-d.glb', category: 'buildings' },
  house: { url: '/samples/kenney-city/building-small-b.glb', category: 'buildings' },
  garage: { url: '/samples/kenney-city/building-garage.glb', category: 'buildings' },
  bungalow: { url: '/samples/kenney-suburban/building-type-a.glb', category: 'buildings' },
  twostorey: { url: '/samples/kenney-suburban/building-type-e.glb', category: 'buildings' },
  widehouse: { url: '/samples/kenney-suburban/building-type-f.glb', category: 'buildings' },
};

for (const [key, s] of Object.entries(SAMPLES)) s.thumb = `/previews/models/${key}.webp`;

/** Library sections, in order (names: `category.<id>` in the locale files). */
export const CATEGORIES = ['animals', 'things', 'vehicles', 'buildings', 'scenery'];

/**
 * The samples on the start page, in order: one animal, one
 * thing, the truck, one building, the trees and the chick, so every kind of
 * model shows. The rest are in the sample library behind "see all".
 */
export const FEATURED = ['fox', 'icecream', 'truck', 'shop', 'trees', 'chick'];

/** Sample keys of one library section, in SAMPLES order. */
export const inCategory = (category) => Object.keys(SAMPLES).filter((key) => SAMPLES[key].category === category);
