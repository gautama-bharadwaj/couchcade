// Dragon Hoard word list. Each line is a theme followed by words that fit it. A word may sit under
// several themes. The board draws from every word here; bots use the themes as clues ("ocean 3")
// and as their guess list, so a theme name is a one-word clue that really does point at its words.
// Boards are dealt from a shuffled pile (drawWords in hoard.js), so more words means fewer repeats.
// Keep words family friendly, one word each, and ideally 10 letters or fewer so they fit a phone tile.

const THEMES = `
ocean: whale shark wave ship anchor pirate coral island sailor shell crab tide octopus dolphin submarine lighthouse surf seal jellyfish harbor reef pearl squid starfish beach walrus lobster seaweed kelp oyster clam stingray tuna mussel otter barnacle buoy diver snorkel flipper narwhal seahorse eel manatee wetsuit
space: rocket moon star planet comet alien orbit astronaut galaxy meteor satellite telescope crater eclipse saturn nebula launch spaceship asteroid cosmos mars jupiter venus mercury pluto meteorite capsule shuttle sunspot universe spacesuit lunar
kitchen: oven spoon fork knife kettle pan pot toaster fridge apron whisk ladle plate bowl cup recipe sink freezer blender grater colander skillet mixer napkin tray jar lid funnel peeler microwave dishwasher cupboard pantry spatula tongs sieve teapot mug
fruit: apple banana cherry grape lemon mango orange peach pear plum melon berry coconut kiwi lime pineapple fig apricot papaya guava raspberry blueberry strawberry watermelon tangerine grapefruit nectarine cranberry date raisin prune olive avocado lychee
farm: cow pig sheep goat horse barn tractor chicken hay farmer field fence duck egg rooster pumpkin corn milk scarecrow pitchfork silo stable mule donkey lamb calf piglet trough plow harvest wheat orchard windmill haystack bale hen goose turkey
castle: king queen knight tower crown throne dragon moat wizard prince princess sword shield armor gate dungeon banner jester drawbridge turret catapult squire lance archer arrow bow fortress chalice goblet feast tapestry
music: drum guitar piano violin trumpet song band concert note choir flute harp rhythm melody banjo whistle radio microphone cello saxophone tuba clarinet harmonica accordion xylophone tambourine cymbal ukulele orchestra conductor lyrics chorus opera ballad lullaby headphones speaker record
sports: ball goal net team coach referee stadium medal trophy race bat glove helmet whistle racket skate puck marathon soccer tennis golf hockey rugby baseball basketball cricket boxing wrestling archery surfing skiing rowing sprint dribble tackle umpire jersey hurdle javelin
weather: rain snow storm cloud thunder lightning wind fog rainbow hail tornado sun frost breeze hurricane umbrella puddle drizzle sleet blizzard monsoon gust drought heatwave forecast thermometer mist dew sunny cyclone
forest: tree bear wolf owl fox deer moss mushroom pine log acorn squirrel trail cabin campfire leaf hedgehog woodpecker badger raccoon beaver moose elk chipmunk fern bark twig branch stump antler ranger hiker pinecone oak maple birch willow
school: teacher desk pencil book chalk lesson exam ruler eraser library lunch locker backpack homework recess bus crayon student principal classroom quiz grade notebook scissors stapler globe diploma spelling math chalkboard textbook
circus: clown juggler tent acrobat lion elephant ringmaster trapeze popcorn unicycle cannon tightrope magician balloon stilts tamer strongman cartwheel somersault spotlight peanut parade drumroll candyfloss
winter: snow ice sled scarf mitten snowman igloo skate frost penguin cocoa blanket fireplace icicle chimney snowflake snowball sleigh earmuffs toboggan ski snowboard parka reindeer
summer: beach sun pool picnic sunscreen ice-cream lemonade sandal vacation camping barbecue sandcastle fan sunglasses swimsuit flipflop hammock popsicle watermelon sunburn sprinkler lifeguard kayak
city: taxi bridge tower subway traffic street skyscraper park museum mall bus siren crosswalk elevator alley apartment neighbor tram pigeon billboard fountain statue plaza cafe sidewalk lamppost hydrant downtown
travel: suitcase passport map ticket train airport hotel compass postcard luggage cruise tourist camera globe souvenir guidebook visa border jetlag hostel tour backpack
desert: camel sand cactus oasis pyramid dune scorpion mirage sun lizard canyon nomad tumbleweed vulture coyote sphinx caravan dust heat sunset
jungle: monkey tiger parrot vine snake jaguar river gorilla waterfall banana frog toucan sloth panther leopard python orangutan chameleon anaconda canopy macaw lemur tarantula rainforest explorer
pets: dog cat hamster goldfish parrot rabbit turtle puppy kitten collar leash bone ferret budgie gerbil pony kennel vet fetch treat
bugs: ant bee spider beetle butterfly ladybug moth grasshopper firefly worm caterpillar web honey cricket mosquito flea wasp hornet dragonfly termite snail slug centipede cocoon larva antenna stinger
garden: flower rose tulip seed shovel hose weed sunflower worm soil fence gnome daisy lily orchid daffodil violet ivy hedge rake wheelbarrow greenhouse sprinkler compost bulb petal stem thorn lawn mower
party: cake balloon candle present confetti music dance costume pinata mask invitation crown cupcake streamer disco karaoke sleepover guest ribbon bow
movies: popcorn ticket screen camera actor hero villain script director premiere trailer sequel cartoon cinema usher poster stunt comedy award animation
fantasy: dragon wizard unicorn elf fairy giant troll potion spell wand goblin mermaid castle phoenix treasure centaur griffin ogre gnome dwarf pixie sprite kraken hydra cyclops wish genie lamp quest
pirate: ship parrot treasure map hook plank island cannon flag sword captain anchor chest compass buccaneer eyepatch skull galleon deck mast sail plunder mutiny telescope
treasure: gold gem diamond ruby pearl coin crown chest emerald jewel silver ring map sapphire amethyst topaz opal crystal bracelet necklace locket tiara medallion
spooky: ghost bat skeleton vampire witch zombie mummy pumpkin spider cobweb haunted cauldron broom moon owl werewolf goblin tombstone graveyard coffin scream phantom spirit raven lantern
science: atom lab magnet robot rocket microscope battery laser fossil volcano experiment gravity crystal beaker molecule cell gene chemistry physics biology telescope thermometer electron formula
dinosaur: fossil bone egg volcano claw tail roar jungle meteor museum raptor extinct pterosaur tooth nest
body: hand foot nose ear eye heart brain tooth knee elbow finger shoulder bone skin hair lung stomach thumb toe ankle wrist chin cheek lip tongue eyebrow neck spine rib muscle belly hip
clothes: hat coat shoe sock scarf glove boot belt dress shirt jacket pocket button zipper tie crown cape skirt sweater hoodie vest shorts jeans pajamas slipper sandal mitten apron bonnet beret kimono tuxedo gown uniform sneaker
house: door window roof chair table bed lamp clock carpet stairs attic garage mirror pillow couch key bath hallway bedroom basement porch chimney doorbell mailbox curtain closet shelf drawer faucet shower rug
tools: hammer saw drill nail screw ladder wrench tape rope bucket shovel glue pliers screwdriver chisel level clamp axe toolbox file sandpaper crowbar mallet bolt
food: pizza burger pasta bread cheese soup taco salad sandwich pancake waffle cookie pie noodle egg rice butter honey sushi curry burrito dumpling omelet bagel pretzel sausage bacon steak meatball chili fries nachos hotdog stew porridge cereal toast
dessert: cake cookie pie ice-cream candy chocolate cupcake donut pudding jelly caramel waffle brownie muffin cheesecake sundae tart custard fudge marshmallow lollipop sorbet cobbler macaron gelato
vehicles: car truck bike plane boat train helicopter scooter van tractor rocket submarine wagon canoe jeep limo ambulance firetruck motorbike sailboat yacht ferry blimp glider tank bulldozer forklift skateboard taxi
royal: crown throne king queen palace castle jewel prince princess carriage robe scepter
mountain: peak cliff cave snow avalanche climber eagle goat summit valley yeti glacier ridge slope altitude boulder rock hiker trail
water: river lake rain fountain bath ice wave puddle bottle splash waterfall well bubble swim stream pond canal dam ripple drip faucet hose sprinkler tap shower
light: lamp candle sun star lightning flashlight lantern fire torch rainbow mirror laser moon firefly bulb neon glow spotlight beacon flare dawn sparkle glitter
fire: flame candle campfire dragon volcano fireplace match torch smoke spark chimney lantern blaze ash bonfire furnace kindling sparkler grill barbecue firefighter
birds: owl eagle parrot penguin duck swan crow robin flamingo peacock chicken feather nest egg toucan hawk falcon pigeon sparrow seagull pelican stork heron vulture ostrich emu kiwi parakeet canary beak wing
games: dice card chess puzzle board token marble kite yo-yo domino maze toy checkers bingo charades tag hopscotch jigsaw trivia riddle spinner score pawn rook bishop
toys: doll robot kite ball teddy blocks yo-yo puppet marble train balloon top rattle pinwheel dollhouse rocker crayon jigsaw
night: moon star owl bat dream pillow lantern shadow midnight candle pajamas bedtime nightlight sleep snore yawn moonlight firefly
time: clock watch calendar hour minute alarm hourglass century birthday morning midnight second week month year decade noon dusk dawn sundial stopwatch timer schedule weekend
money: coin bank wallet gold piggy cash price shop treasure diamond dollar penny dime purse budget loan tax vault safe allowance tip
shop: cart price receipt shelf basket bag mall bakery market coin cashier checkout coupon sale discount bargain store florist butcher grocer
jobs: doctor nurse chef farmer pilot teacher firefighter astronaut judge baker plumber detective artist dentist lawyer mechanic carpenter painter soldier officer waiter janitor librarian vet postman scientist engineer architect barber tailor
hospital: doctor nurse bandage ambulance needle heart bone medicine stretcher patient surgeon pill cast crutch wheelchair thermometer clinic
art: paint brush canvas crayon sculpture museum statue artist pencil chalk frame palette easel sketch portrait mosaic pottery clay ink gallery doodle stencil collage mural
mystery: detective clue key lock shadow secret mask spy code footprint magnifier suspect alibi witness riddle puzzle trail disguise
magic: wizard wand spell potion hat rabbit card trick witch cauldron crystal vanish illusion amulet charm cape curtain broom
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
vegetable: carrot potato onion garlic pea bean cabbage lettuce spinach cucumber tomato pepper broccoli celery radish beet turnip zucchini eggplant leek mushroom pumpkin corn
colors: red blue yellow purple pink brown black white gray gold silver orange violet turquoise maroon navy beige
shapes: circle square triangle star heart diamond oval cube cone pyramid sphere arrow spiral cross hexagon
numbers: zero one two three ten hundred thousand million dozen half double triple pair
land: continent peninsula swamp marsh meadow prairie tundra delta bay coast cliff lagoon plateau island valley
safari: zebra giraffe hippo rhino cheetah hyena antelope buffalo ostrich warthog meerkat lion elephant jeep
arctic: walrus seal husky narwhal iceberg aurora caribou tundra igloo penguin polar
outback: kangaroo koala wombat platypus dingo emu boomerang
reptiles: crocodile alligator iguana gecko turtle tortoise cobra viper python chameleon lizard snake
camping: tent flashlight marshmallow canoe compass hike lantern cooler firewood campfire cabin
beach: towel bucket kite shell umbrella wave sand seagull crab lifeguard surfboard
breakfast: cereal toast pancake waffle bacon egg juice coffee tea jam yogurt muffin granola croissant
drinks: juice coffee tea milk soda smoothie milkshake lemonade cocoa punch
tech: computer laptop phone tablet keyboard mouse screen robot internet email website password battery charger printer camera cable pixel app video
office: paperclip folder printer desk meeting boss calendar memo copier envelope stapler
books: author poem novel story chapter page bookmark fairytale dictionary comic library
writing: pen pencil ink letter diary journal poem word sentence alphabet typewriter
feelings: happy sad angry scared brave shy proud jealous calm grumpy excited lonely silly bored
family: mother father sister brother baby grandma grandpa uncle aunt cousin twin nephew niece
wedding: bride groom ring cake veil bouquet dance vow tuxedo
hobbies: knitting fishing gardening painting cooking baking reading hiking dancing chess
superhero: hero villain cape mask power laser shield sidekick gadget lair
myth: titan oracle labyrinth minotaur medusa pegasus cyclops hydra griffin centaur
future: cyborg android hologram jetpack hoverboard teleport robot laser
cowboy: sheriff saloon lasso rodeo cactus horse ranch stagecoach horseshoe bandana spur
ninja: samurai dojo karate belt sword
viking: longship helmet axe rune horn shield
egypt: pharaoh pyramid mummy sphinx scarab tomb hieroglyph papyrus camel
dance: ballet tango waltz salsa disco twirl spin
bakery: bread baker dough flour oven bun roll crust loaf croissant baguette muffin
spices: salt pepper sugar cinnamon ginger vanilla mint garlic herb basil chili
nuts: peanut almond walnut cashew pistachio acorn chestnut hazelnut coconut squirrel
trees: oak maple birch willow cedar palm elm redwood bamboo spruce pine
flowers: lily orchid daffodil violet lavender poppy iris lotus dandelion rose tulip daisy sunflower
metal: iron copper bronze steel tin aluminum lead nickel platinum gold silver
building: brick cement crane scaffold bulldozer blueprint ladder hammer
bathroom: soap towel sponge bubble shampoo toothbrush toothpaste tub mirror comb
bedroom: bed pillow blanket quilt mattress dresser wardrobe alarm
furniture: sofa armchair stool bench cabinet bookcase desk crib chair table couch
playground: slide swing seesaw sandbox ladder tag monkey
fairground: carousel bumper arcade prize ticket candyfloss
zoo: zookeeper cage enclosure penguin lion monkey
olympics: medal torch podium relay sprint gymnast diver
math: plus minus equal fraction decimal angle graph calculator
seasons: spring autumn fall summer winter
directions: north south east west left right
mail: stamp envelope mailbox parcel package postman courier postcard
fairytale: beanstalk giant wolf pumpkin frog tower witch spindle mirror apple dwarf slipper
smelly: perfume skunk onion garlic sock cheese
sharp: knife needle thorn sword pin claw arrow scissors cactus tooth
soft: pillow feather cloud kitten cotton wool velvet silk fur fleece
hard: rock diamond brick bone iron shell nut anvil
heavy: anvil elephant boulder truck piano whale
wood: log plank barrel crate pencil desk
glass: window mirror bottle vase lens marble
containers: box crate barrel jar basket bucket bag sack trunk chest tin bin carton tube
spring: chick bunny tulip bloom nest rainbow
autumn: leaf pumpkin harvest rake apple acorn scarecrow sweater
celebration: wedding parade festival carnival fireworks feast
hair: wig braid ponytail bun curl comb brush beard mustache
face: nose freckle dimple smile wink frown eyebrow
cleaning: mop broom vacuum duster sponge bucket soap dustpan laundry
laundry: washer dryer iron hanger basket sock
sewing: needle thread button thimble pin yarn fabric quilt
fishing: rod hook bait net reel worm boat
mine: miner pickaxe tunnel coal diamond cave cart lantern
train: station platform engine caboose rail track whistle conductor tunnel
road: highway bridge lane exit sign map traffic
car: tire engine horn wheel seatbelt trunk mirror bumper
theater: stage curtain audience actor play script costume spotlight applause encore
news: headline reporter crossword comic newspaper
tv: remote channel antenna cartoon
photo: camera album selfie frame
monster: yeti bigfoot kraken ogre troll vampire zombie werewolf
snacks: chips cracker popcorn pretzel nachos peanut
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
