// Word lists and question banks for the party games.

// Common words (3+ letters) used by Word Scramble, Hangman and Word Chain.
const WORDS = `
able about above actor adult after again agent agree ahead alarm album alien alive allow alone along alpha amber angel anger angle angry ankle apple april arena argue armor arrow aside atlas audio aunt award awake badge baker balloon banana band bank barn basket batch beach beam bean bear beard beast beat bed bee begin bell belt bench berry bike bird birth black blade blank blast blaze blend blink block blood bloom blue board boat body bold bolt bone bonus book boost boot border boss bottle bounce bowl box brain brake branch brave bread break brick bridge brief bright bring broom brown brush bubble bucket buddy build bulb bunny burger burst butter button cabin cable cactus cake calm camel camera camp canal candle candy canoe canvas cape captain card cargo carpet carrot cart castle cat cave chain chair chalk champ charm chart chase cheese cherry chess chest chick chief child chili chimney chip choir circle city clam class claw clay clean clerk click cliff climb clock cloud clown club coach coast coat cobra cocoa code coin cold comet comic coral corn couch count court cousin cover cow crab craft crane crash crayon cream creek crew cricket crown crust cube cup curtain cycle daisy dance danger dart dash data dawn deer delta denim desert desk diamond diary dice dinner dino disco dish diver doctor dog doll dolphin donkey door dough dragon drama dream dress drift drink drum duck dune dust eagle earth easel echo edge eel egg elbow elf ember emerald empty energy engine enjoy equal error event exit extra fable face fairy falcon fancy farm feast feather fence ferry field film finger fire fish flag flame flash fleet flight flock flower flute foam fog folk food forest fork fort fossil fox frame frog frost fruit fudge galaxy game garden garlic gate gear gecko gem ghost giant gift ginger giraffe glass globe glove glow goat gold golf goose grape graph grass gravy green grid grill guitar gum habit hammer hand happy harbor harp hat hawk heart heat hedge helmet hero hill hippo hobby honey hook horse hotel house husky ice icon idea igloo image inch index ink input insect iron island ivory jacket jaguar jam jar jazz jeans jelly jewel job jockey joke judge juice jump jungle kayak kettle key kid king kite kitten kiwi knee knife knot koala label ladder lake lamp lantern laser lava lawn leaf lemon lens letter lever light lily lime lion lizard llama lobster lock logo loop lucky lunch magic magnet mango maple map marble market mask meadow medal melon metal meteor mint mirror mitten model monkey moon moose motor mouse movie mud mug muffin muscle music nail napkin needle nest net night ninja noodle north note novel nut oak oar ocean octopus office olive omelet onion opera orange orbit orchid otter oven owl ozone paddle page paint palace palm panda paper parade parrot party pasta path peach peanut pear pebble pencil penguin pepper piano pickle pie pig pillow pilot pine pirate pizza planet plant plate plum pocket poem polar pond pony popcorn potato pouch prism puddle pumpkin puppy puzzle pyramid queen quest quiet quilt quiz rabbit raccoon radar radio rain ramp raven razor recipe reef ribbon rice riddle river road robin robot rocket rodeo roof rope rose ruby rug ruler saddle safari sail salad salmon salt sand sandal scarf school scooter screen sea seal season seed shadow shark sheep shelf shell shield ship shirt shoe shovel silver singer siren skate skull sky sled sleep slide sloth smile snack snail snake snow soap soccer sock sofa solar soup space spark spider spoon sport spring squid stage stairs star statue steam stone storm story stove straw stream sugar summer sun surf swamp swan sweater swing sword table taco tail tank tea teapot temple tent thunder ticket tiger timber toast toe tomato tooth torch tower toy track tractor train treasure tree tribe trophy truck trumpet tulip tuna tunnel turtle twig umbrella unicorn universe valley vase velvet violin volcano wagon waffle wallet walrus wand water wave wax whale wheat wheel whistle window wing winter wizard wolf wood worm yacht yarn yeti yogurt yoyo zebra zero zigzag zipper zone
`.trim().split(/\s+/);

// Emoji riddles: [emojis, answer, ...other accepted answers]
const EMOJI = [
  ['🍎🥧', 'apple pie'], ['🌧️🎀', 'rainbow'], ['🔥🧑‍🚒', 'firefighter'], ['⭐🐟', 'starfish'], ['🌙🚶', 'moonwalk'], ['🐝🍯', 'honey', 'beehive'],
  ['☀️🌻', 'sunflower'], ['🍿🎬', 'movie', 'popcorn'], ['🐶🏠', 'doghouse', 'kennel'], ['❄️⛄', 'snowman'], ['🎂🎉', 'birthday', 'birthday party'], ['🕷️🧑', 'spiderman', 'spider man'],
  ['🦈🌊', 'shark'], ['🧊🏒', 'ice hockey', 'hockey'], ['🌽🍿', 'popcorn'], ['🐟🍟', 'fish and chips'], ['🏠🔑', 'house key', 'key'], ['⏰🛏️', 'alarm clock', 'wake up'],
  ['🎸⭐', 'rock star', 'rockstar'], ['🌊🏄', 'surfing', 'surf'], ['🍫🍪', 'chocolate chip cookie', 'cookie'], ['🚀🌕', 'moon landing', 'space'], ['👻🏠', 'haunted house'], ['🐍🪜', 'snakes and ladders'],
  ['🧈🪰', 'butterfly'], ['🔑🛹', 'keyboard'], ['☁️🏙️', 'skyscraper'], ['🌞👓', 'sunglasses'], ['💧🍉', 'watermelon'], ['🐞🏠', 'ladybug'],
  ['👑🦁', 'lion king', 'the lion king'], ['🍕⏰', 'pizza time'], ['🏀🏆', 'basketball', 'champion'], ['🎃🌙', 'halloween'], ['🎄🎅', 'christmas'], ['🐢⚡', 'slow and fast', 'turtle'],
  ['📚🐛', 'bookworm'], ['🌟🐠', 'starfish'], ['🥚🔨', 'eggshell', 'egg'], ['🍔👑', 'burger king'], ['🐻🧸', 'teddy bear'], ['🚂🚇', 'train'],
  ['🌈🦄', 'unicorn'], ['🧙‍♂️💍', 'lord of the rings'], ['🦖🏞️', 'jurassic park'], ['🧊❄️👸', 'frozen'], ['🐠🔍', 'finding nemo'], ['🕹️👾', 'video game', 'arcade'],
];

// Capitals quiz: [country, capital]
const CAPITALS = [
  ['France', 'Paris'], ['Japan', 'Tokyo'], ['Italy', 'Rome'], ['Spain', 'Madrid'], ['Germany', 'Berlin'], ['Canada', 'Ottawa'], ['Australia', 'Canberra'], ['Brazil', 'Brasília'],
  ['Mexico', 'Mexico City'], ['Egypt', 'Cairo'], ['India', 'New Delhi'], ['China', 'Beijing'], ['Russia', 'Moscow'], ['United Kingdom', 'London'], ['Ireland', 'Dublin'], ['Portugal', 'Lisbon'],
  ['Greece', 'Athens'], ['Turkey', 'Ankara'], ['Norway', 'Oslo'], ['Sweden', 'Stockholm'], ['Finland', 'Helsinki'], ['Denmark', 'Copenhagen'], ['Poland', 'Warsaw'], ['Austria', 'Vienna'],
  ['Switzerland', 'Bern'], ['Netherlands', 'Amsterdam'], ['Belgium', 'Brussels'], ['Argentina', 'Buenos Aires'], ['Chile', 'Santiago'], ['Peru', 'Lima'], ['Colombia', 'Bogotá'], ['Kenya', 'Nairobi'],
  ['Nigeria', 'Abuja'], ['South Korea', 'Seoul'], ['Thailand', 'Bangkok'], ['Vietnam', 'Hanoi'], ['Indonesia', 'Jakarta'], ['Philippines', 'Manila'], ['New Zealand', 'Wellington'], ['Cuba', 'Havana'],
  ['Jamaica', 'Kingston'], ['Morocco', 'Rabat'], ['Saudi Arabia', 'Riyadh'], ['Iran', 'Tehran'], ['Iceland', 'Reykjavík'], ['Hungary', 'Budapest'], ['Czechia', 'Prague'], ['Ukraine', 'Kyiv'],
];

// True or false: [statement, true/false]
const TRUE_FALSE = [
  ['Octopuses have three hearts.', true], ['The Great Wall of China is visible from the Moon with the naked eye.', false], ['Bananas are berries.', true], ['Strawberries are berries.', false],
  ['A group of crows is called a murder.', true], ['Lightning never strikes the same place twice.', false], ['Honey never spoils.', true], ['Goldfish have a 3-second memory.', false],
  ['Venus is the hottest planet in our solar system.', true], ['Humans only use 10% of their brains.', false], ['Sharks are older than trees.', true], ['Bats are blind.', false],
  ['A day on Venus is longer than its year.', true], ['Mount Everest is the tallest mountain from base to peak.', false], ['Sloths can hold their breath longer than dolphins.', true], ['Bulls get angry at the colour red.', false],
  ['Cows have best friends.', true], ['Ostriches bury their heads in the sand.', false], ['There are more stars in the universe than grains of sand on Earth.', true], ['Glass is a slow-moving liquid.', false],
  ['Wombat poop is cube-shaped.', true], ['The tongue has separate zones for each taste.', false], ['Some turtles can breathe through their butts.', true], ['Chameleons change colour mainly to blend in.', false],
  ['A jiffy is an actual unit of time.', true], ['Napoleon was very short for his time.', false], ['Peanuts are not nuts.', true], ['You lose most of your body heat through your head.', false],
  ['Koalas have fingerprints.', true], ['The Sahara is the largest desert on Earth.', false], ['Water can boil and freeze at the same time.', true], ['Dogs see only in black and white.', false],
  ['The Eiffel Tower grows taller in summer.', true], ['Camels store water in their humps.', false], ['An ostrich egg is the largest of any living bird.', true], ['Diamonds are made from coal.', false],
];

// Typing race sentences.
const SENTENCES = [
  'the quick brown fox jumps over the lazy dog',
  'pixel bot loves playing games with friends',
  'a rainbow appears after the summer rain',
  'pack my box with five dozen liquor jugs',
  'bright stars shine over the quiet ocean',
  'the robot danced while the music played',
  'never stop learning new and exciting things',
  'cozy blankets and warm cocoa on a cold night',
  'the dragon guarded a mountain of shiny gold',
  'every great journey starts with a single step',
  'the clever cat chased a red laser dot',
  'pizza tastes better when shared with friends',
];

module.exports = { WORDS, EMOJI, CAPITALS, TRUE_FALSE, SENTENCES };
