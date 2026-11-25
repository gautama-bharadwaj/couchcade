// Dragon Hoard word list. Each line is a theme followed by words that fit it. A word may sit under
// several themes. The board draws from every word here; bots use the themes as clues ("ocean 3")
// and as their guess list, so a theme name is a one-word clue that really does point at its words.
// Keep words family friendly, one word each, and ideally 10 letters or fewer so they fit a phone tile.

const THEMES = `
ocean: whale shark wave ship anchor pirate coral island sailor shell crab tide octopus dolphin submarine lighthouse surf seal jellyfish harbor reef pearl squid starfish beach
space: rocket moon star planet comet alien orbit astronaut galaxy meteor satellite telescope crater eclipse saturn nebula launch
kitchen: oven spoon fork knife kettle pan pot toaster fridge apron whisk ladle plate bowl cup recipe sink freezer
fruit: apple banana cherry grape lemon mango orange peach pear plum melon berry coconut kiwi lime pineapple fig apricot
farm: cow pig sheep goat horse barn tractor chicken hay farmer field fence duck egg rooster pumpkin corn milk scarecrow
castle: king queen knight tower crown throne dragon moat wizard prince princess sword shield armor gate dungeon banner jester
music: drum guitar piano violin trumpet song band concert note choir flute harp rhythm melody banjo whistle radio microphone
sports: ball goal net team coach referee stadium medal trophy race bat glove helmet whistle racket skate puck marathon
weather: rain snow storm cloud thunder lightning wind fog rainbow hail tornado sun frost breeze hurricane umbrella puddle
forest: tree bear wolf owl fox deer moss mushroom pine log acorn squirrel trail cabin campfire leaf hedgehog woodpecker
school: teacher desk pencil book chalk lesson exam ruler eraser library lunch locker backpack homework recess bus crayon
circus: clown juggler tent acrobat lion elephant ringmaster trapeze popcorn unicycle cannon tightrope magician balloon
winter: snow ice sled scarf mitten snowman igloo skate frost penguin cocoa blanket fireplace icicle chimney
summer: beach sun pool picnic sunscreen ice-cream lemonade sandal vacation camping barbecue sandcastle fan
city: taxi bridge tower subway traffic street skyscraper park museum mall bus siren crosswalk elevator alley
travel: suitcase passport map ticket train airport hotel compass postcard luggage cruise tourist camera globe
desert: camel sand cactus oasis pyramid dune scorpion mirage sun lizard canyon
jungle: monkey tiger parrot vine snake jaguar river gorilla waterfall banana frog toucan
pets: dog cat hamster goldfish parrot rabbit turtle puppy kitten collar leash bone
bugs: ant bee spider beetle butterfly ladybug moth grasshopper firefly worm caterpillar web honey
garden: flower rose tulip seed shovel hose weed sunflower worm soil fence gnome daisy
party: cake balloon candle present confetti music dance costume pinata mask invitation crown cupcake
movies: popcorn ticket screen camera actor hero villain script director premiere trailer sequel cartoon
fantasy: dragon wizard unicorn elf fairy giant troll potion spell wand goblin mermaid castle phoenix treasure
pirate: ship parrot treasure map hook plank island cannon flag sword captain anchor chest compass
treasure: gold gem diamond ruby pearl coin crown chest emerald jewel silver ring map
spooky: ghost bat skeleton vampire witch zombie mummy pumpkin spider cobweb haunted cauldron broom moon owl
science: atom lab magnet robot rocket microscope battery laser fossil volcano experiment gravity crystal
dinosaur: fossil bone egg volcano claw tail roar jungle meteor museum
body: hand foot nose ear eye heart brain tooth knee elbow finger shoulder bone skin hair
clothes: hat coat shoe sock scarf glove boot belt dress shirt jacket pocket button zipper tie crown cape
house: door window roof chair table bed lamp clock carpet stairs attic garage mirror pillow couch key bath
tools: hammer saw drill nail screw ladder wrench tape rope bucket shovel glue
food: pizza burger pasta bread cheese soup taco salad sandwich pancake waffle cookie pie noodle egg rice butter honey
dessert: cake cookie pie ice-cream candy chocolate cupcake donut pudding jelly caramel waffle
vehicles: car truck bike plane boat train helicopter scooter van tractor rocket submarine wagon canoe
royal: crown throne king queen palace castle jewel prince princess carriage robe scepter
mountain: peak cliff cave snow avalanche climber eagle goat summit valley yeti glacier
water: river lake rain fountain bath ice wave puddle bottle splash waterfall well bubble swim
light: lamp candle sun star lightning flashlight lantern fire torch rainbow mirror laser moon firefly
fire: flame candle campfire dragon volcano fireplace match torch smoke spark chimney lantern
birds: owl eagle parrot penguin duck swan crow robin flamingo peacock chicken feather nest egg toucan
games: dice card chess puzzle board token marble kite yo-yo domino maze toy
toys: doll robot kite ball teddy blocks yo-yo puppet marble train balloon top
night: moon star owl bat dream pillow lantern shadow midnight candle pajamas
time: clock watch calendar hour minute alarm hourglass century birthday morning midnight
money: coin bank wallet gold piggy cash price shop treasure diamond
shop: cart price receipt shelf basket bag mall bakery market coin
jobs: doctor nurse chef farmer pilot teacher firefighter astronaut judge baker plumber detective artist
hospital: doctor nurse bandage ambulance needle heart bone medicine
art: paint brush canvas crayon sculpture museum statue artist pencil chalk frame palette
mystery: detective clue key lock shadow secret mask spy code footprint magnifier
magic: wizard wand spell potion hat rabbit card trick witch cauldron crystal
round: ball wheel coin moon sun pizza ring clock planet orange globe donut bubble plate button
cold: ice snow penguin igloo freezer glacier frost icicle fridge winter
hot: sun fire desert oven volcano pepper soup lava sauna toaster
sweet: candy cake honey sugar cookie chocolate jam lemonade cupcake donut
sticky: honey glue tape jam gum syrup web caramel
loud: drum thunder siren trumpet alarm roar fireworks whistle lion
small: ant mouse seed pebble button atom crumb pea bee marble
tall: giraffe skyscraper ladder tower tree giant mountain lighthouse
fast: rocket cheetah race jet lightning car arrow comet
wings: bird bat bee butterfly plane angel dragon fairy eagle owl
tail: dog cat fox monkey kite comet mermaid dinosaur lizard peacock
paper: book letter map ticket kite envelope newspaper postcard receipt calendar
green: frog grass leaf lime emerald cactus pickle broccoli dinosaur moss
wheel: car bike bus wagon train skate truck unicycle scooter
sky: cloud kite plane bird rainbow star moon balloon helicopter sun
`;

/** theme -> words */
export const THEME_WORDS = new Map(
  THEMES.trim()
    .split('\n')
    .map((line) => {
      const [theme, rest] = line.split(':');
      return [theme.trim(), [...new Set(rest.trim().split(/\s+/))]];
    }),
);

/** Every word, once. */
export const WORDS = [...new Set([...THEME_WORDS.values()].flat())];

/** word -> themes it sits under */
export const WORD_THEMES = new Map(WORDS.map((w) => [w, []]));
for (const [theme, words] of THEME_WORDS) for (const w of words) WORD_THEMES.get(w).push(theme);
