// PlayGioco — Word Banks
// 200-250 words per category, all real-world nouns that are easy to describe or illustrate

export type Category = "Random" | "Food" | "Movies" | "Countries" | "Celebrities" | "Sports" | "Technology" | "Animals" | "Objects"

export const GAME1_CATEGORIES: Category[] = ["Random","Food","Movies","Countries","Celebrities","Sports","Technology","Animals","Objects"]

export const WORD_BANKS: Record<Exclude<Category, "Random">, string[]> = {

  // ── FOOD ─────────────────────────────────────────────────────────────────────
  Food: [
    // Classic dishes
    "Pizza","Sushi","Burger","Pasta","Tacos","Ramen","Curry","Steak","Croissant",
    "Paella","Biryani","Pho","Falafel","Tiramisu","Gyoza","Shakshuka","Waffles",
    "Dim Sum","Lasagna","Baklava","Churros","Nachos","Dumplings","Risotto","Fondue",
    "Crepe","Bao","Kebab","Empanada","Moussaka","Souvlaki","Rendang","Jerk Chicken",
    "Gumbo","Jambalaya","Chowder","Bouillabaisse","Tagine","Couscous","Hummus",
    "Borscht","Pierogi","Schnitzel","Bratwurst","Pretzel","Spätzle","Raclette",
    "Croque Monsieur","Ratatouille","Boef Bourguignon","Cassoulet","Escargot",
    "Tempura","Teriyaki","Miso Soup","Edamame","Onigiri","Takoyaki","Okonomiyaki",
    "Katsu Curry","Bulgogi","Bibimbap","Tteokbokki","Kimchi","Japchae","Samgyeopsal",
    "Tom Yum","Pad Thai","Som Tum","Massaman","Green Curry","Satay","Nasi Goreng",
    "Laksa","Hainanese Chicken","Char Kway Teow","Prata","Adobo","Sinigang","Kare-kare",
    "Banh Mi","Goi Cuon","Bun Bo Hue","Che Ba Mau","Khao Pad","Larb","Momos",
    "Dal","Dosa","Idli","Vada","Chaat","Pav Bhaji","Butter Chicken",
    // Sandwiches & street food
    "Hotdog","Sandwich","Club Sandwich","Grilled Cheese","BLT","Reuben","Po Boy",
    "Bánh mì","Shawarma","Döner","Gyro","Torta","Arepa","Pupusa","Tamale",
    // Desserts
    "Ice Cream","Gelato","Sorbet","Mochi","Cheesecake","Brownie","Cookie","Donut",
    "Muffin","Cake","Macaron","Cannoli","Éclair","Profiterole","Crème Brûlée",
    "Mousse","Trifle","Pavlova","Meringue","Pavlova","Pudding","Flan","Tarte Tatin",
    "Strudel","Sachertorte","Baklava","Halva","Gulab Jamun","Rasgulla","Kheer",
    "Panna Cotta","Sfogliatella","Zeppola","Churro","Sopapilla","Tres Leches",
    "Banoffee","Eton Mess","Syllabub","Blancmange","Rice Pudding","Semolina Cake",
    // Drinks
    "Coffee","Espresso","Cappuccino","Latte","Matcha","Bubble Tea","Smoothie",
    "Lemonade","Kombucha","Cold Brew","Chai","Masala Tea","Horchata","Lassi",
    // Ingredients
    "Avocado","Truffle","Saffron","Wasabi","Miso","Tahini","Za'atar","Harissa",
    "Chimichurri","Guacamole","Pesto","Tzatziki","Aioli","Hollandaise","Béarnaise",
    // Breads
    "Sourdough","Baguette","Focaccia","Naan","Pita","Ciabatta","Brioche","Croissant",
    "Roti","Injera","Lavash","Matzo","Pretzel","Bagel","English Muffin",
  ],

  // ── MOVIES ────────────────────────────────────────────────────────────────────
  Movies: [
    // All-time classics
    "Titanic","The Godfather","Casablanca","Citizen Kane","Schindler's List",
    "The Shawshank Redemption","Forrest Gump","Goodfellas","Apocalypse Now",
    "2001: A Space Odyssey","Psycho","Rear Window","Vertigo","North by Northwest",
    "Sunset Boulevard","Chinatown","Taxi Driver","Raging Bull","Pulp Fiction",
    "Fight Club","American Beauty","The Silence of the Lambs","Blade Runner",
    "The Shining","A Clockwork Orange","Full Metal Jacket","Barry Lyndon",
    // Modern blockbusters
    "Avatar","Inception","Interstellar","Oppenheimer","Tenet","Dunkirk",
    "The Dark Knight","Batman Begins","Man of Steel","Joker","Barbie","Dune",
    "Top Gun","Mission Impossible","John Wick","Mad Max","Fast and Furious",
    "Die Hard","The Rock","Con Air","Speed","Face/Off","Air Force One",
    // Marvel/DC
    "Iron Man","Spider-Man","Black Panther","Thor","Captain America","Avengers",
    "Guardians of the Galaxy","Doctor Strange","Ant-Man","Black Widow",
    "Wonder Woman","Aquaman","Deadpool","Logan","Wolverine","X-Men",
    // Animation
    "The Lion King","Toy Story","Finding Nemo","Up","Inside Out","WALL-E",
    "Spirited Away","Princess Mononoke","Howl's Moving Castle","My Neighbor Totoro",
    "The Incredibles","Ratatouille","Coco","Moana","Encanto","Frozen","Brave",
    "Zootopia","Shrek","Kung Fu Panda","How to Train Your Dragon","Megamind",
    // Horror
    "Hereditary","Midsommar","Get Out","Us","The Witch","It","The Conjuring",
    "Halloween","Alien","The Thing","Rosemary's Baby","The Exorcist",
    // Romance/Drama
    "La La Land","The Notebook","Pride and Prejudice","Sense and Sensibility",
    "Atonement","The Grand Budapest Hotel","Moonlight","Call Me By Your Name",
    "Parasite","Roma","Portrait of a Lady on Fire","Amélie","Cinema Paradiso",
    // Sci-Fi
    "The Matrix","Interstellar","Arrival","Ex Machina","Annihilation","Dune",
    "Star Wars","Back to the Future","E.T.","Jurassic Park","Close Encounters",
    // Action Adventure
    "Indiana Jones","Gladiator","Braveheart","Saving Private Ryan","1917",
    "Dunkirk","Letters from Iwo Jima","Hacksaw Ridge","Fury","Patton",
  ],

  // ── COUNTRIES ─────────────────────────────────────────────────────────────────
  Countries: [
    // Europe
    "France","Germany","Italy","Spain","Portugal","United Kingdom","Ireland",
    "Netherlands","Belgium","Switzerland","Austria","Sweden","Norway","Denmark",
    "Finland","Iceland","Greece","Poland","Czech Republic","Hungary","Romania",
    "Bulgaria","Croatia","Serbia","Slovenia","Slovakia","Ukraine","Russia",
    "Turkey","Luxembourg","Malta","Cyprus","Monaco","Andorra","San Marino",
    "Liechtenstein","Estonia","Latvia","Lithuania","Moldova","Belarus","Albania",
    "North Macedonia","Montenegro","Bosnia","Kosovo","Kosovo",
    // Americas
    "United States","Canada","Mexico","Brazil","Argentina","Chile","Colombia",
    "Peru","Venezuela","Ecuador","Bolivia","Paraguay","Uruguay","Guyana",
    "Suriname","Cuba","Jamaica","Haiti","Dominican Republic","Puerto Rico",
    "Costa Rica","Panama","Honduras","Guatemala","El Salvador","Nicaragua",
    "Belize","Trinidad and Tobago","Barbados","Bahamas","Antigua","Grenada",
    // Asia
    "Japan","China","South Korea","North Korea","Vietnam","Thailand","Indonesia",
    "Philippines","Malaysia","Singapore","Cambodia","Myanmar","Laos","Bangladesh",
    "Pakistan","India","Sri Lanka","Nepal","Bhutan","Maldives","Mongolia",
    "Kazakhstan","Uzbekistan","Kyrgyzstan","Tajikistan","Turkmenistan",
    "Azerbaijan","Armenia","Georgia","Afghanistan","Iran","Iraq","Syria",
    "Lebanon","Israel","Jordan","Saudi Arabia","UAE","Kuwait","Qatar",
    "Bahrain","Oman","Yemen","Taiwan","Hong Kong","Macau",
    // Africa
    "Egypt","Morocco","Tunisia","Algeria","Libya","Sudan","Ethiopia","Kenya",
    "Tanzania","Uganda","Rwanda","Cameroon","Nigeria","Ghana","Senegal","Mali",
    "Niger","Chad","Ivory Coast","Burkina Faso","Togo","Benin","Guinea",
    "Sierra Leone","Liberia","Angola","Congo","Zambia","Zimbabwe","Mozambique",
    "Madagascar","Mauritius","Seychelles","South Africa","Namibia","Botswana",
    // Oceania/Pacific
    "Australia","New Zealand","Fiji","Papua New Guinea","Samoa","Tonga","Vanuatu",
  ],

  // ── CELEBRITIES ───────────────────────────────────────────────────────────────
  Celebrities: [
    // Music
    "Beyoncé","Taylor Swift","Rihanna","Adele","Lady Gaga","Billie Eilish",
    "Ariana Grande","Dua Lipa","Olivia Rodrigo","SZA","Doja Cat","Lizzo",
    "Nicki Minaj","Cardi B","Megan Thee Stallion","Lana Del Rey","Lorde",
    "Halsey","Miley Cyrus","Selena Gomez","Justin Bieber","Ed Sheeran",
    "Bruno Mars","The Weeknd","Drake","Kendrick Lamar","J. Cole","Travis Scott",
    "Post Malone","Bad Bunny","J Balvin","Maluma","Ozuna","Rauw Alejandro",
    "Shakira","Daddy Yankee","Pitbull","Enrique Iglesias","Rosalía","C. Tangana",
    "BTS","BLACKPINK","Stray Kids","Twice","Red Velvet","NewJeans","aespa",
    "Harry Styles","Niall Horan","Zayn","One Direction","Coldplay","U2",
    "The Rolling Stones","The Beatles","Elton John","David Bowie","Prince",
    "Michael Jackson","Madonna","Whitney Houston","Mariah Carey","Celine Dion",
    "Eminem","Jay-Z","Kanye West","Snoop Dogg","Ice Cube","Dr. Dre","Nas",
    // Sports
    "Cristiano Ronaldo","Lionel Messi","Kylian Mbappé","Neymar","Mohamed Salah",
    "Robert Lewandowski","Erling Haaland","LeBron James","Stephen Curry",
    "Kevin Durant","Giannis Antetokounmpo","Luka Dončić","Nikola Jokić",
    "Serena Williams","Roger Federer","Rafael Nadal","Novak Djokovic",
    "Carlos Alcaraz","Naomi Osaka","Simone Biles","Usain Bolt","Michael Phelps",
    "Tiger Woods","Phil Mickelson","Rory McIlroy","Lewis Hamilton","Max Verstappen",
    "Michael Jordan","Kobe Bryant","Shaquille O'Neal","Magic Johnson","Larry Bird",
    // Film/TV
    "Tom Hanks","Meryl Streep","Denzel Washington","Morgan Freeman","Samuel L. Jackson",
    "Robert Downey Jr.","Chris Evans","Scarlett Johansson","Margot Robbie",
    "Cate Blanchett","Natalie Portman","Emma Watson","Jennifer Lawrence",
    "Zendaya","Florence Pugh","Sydney Sweeney","Ana de Armas","Gal Gadot",
    "Ryan Reynolds","Brad Pitt","Leonardo DiCaprio","Johnny Depp","Will Smith",
    "Keanu Reeves","Tom Cruise","Vin Diesel","Dwayne Johnson","Chris Pratt",
    // Tech/Business
    "Elon Musk","Jeff Bezos","Bill Gates","Mark Zuckerberg","Steve Jobs",
    "Tim Cook","Sundar Pichai","Satya Nadella","Jensen Huang",
    // Other
    "Oprah Winfrey","Ellen DeGeneres","Kim Kardashian","Kylie Jenner","Khloé",
  ],

  // ── SPORTS ────────────────────────────────────────────────────────────────────
  Sports: [
    // Team sports
    "Football","Basketball","Baseball","Ice Hockey","Volleyball","Rugby","Cricket",
    "Handball","Lacrosse","Field Hockey","Water Polo","Polo","Kabaddi","Korfball",
    "Netball","Australian Rules Football","Gaelic Football","Hurling","Bandy",
    "Floorball","Roller Derby","Underwater Hockey","Sepak Takraw","Footvolley",
    // Individual sports
    "Tennis","Golf","Swimming","Boxing","Wrestling","Gymnastics","Athletics",
    "Cycling","Rowing","Canoeing","Kayaking","Archery","Fencing","Shooting",
    "Weightlifting","Powerlifting","Crossfit","Triathlon","Biathlon","Pentathlon",
    "Decathlon","Heptathlon","Equestrian","Sailing","Windsurfing","Kiteboarding",
    "Surfing","Skateboarding","BMX","Mountain Biking","Rock Climbing","Parkour",
    // Combat
    "Karate","Taekwondo","Judo","Aikido","Kickboxing","MMA","Muay Thai","Sumo",
    "Brazilian Jiu-Jitsu","Krav Maga","Capoeira","Wushu","Sambo","Savate",
    // Water
    "Diving","Synchronized Swimming","Open Water Swimming","Water Skiing",
    "Wakeboarding","Jet Skiing","Kayaking","Rafting","Freediving","Spearfishing",
    // Winter
    "Skiing","Snowboarding","Ice Skating","Speed Skating","Figure Skating",
    "Curling","Bobsled","Skeleton","Luge","Ski Jumping","Cross-Country Skiing",
    "Biathlon","Freestyle Skiing","Moguls","Halfpipe","Slopestyle","Big Air",
    // Recreational
    "Darts","Billiards","Snooker","Bowling","Bocce","Petanque","Croquet",
    "Table Tennis","Badminton","Squash","Racquetball","Padel","Pickleball",
    "Ultimate Frisbee","Disc Golf","Frisbee","Cornhole","Horseshoes",
    "Arm Wrestling","Chess Boxing","Obstacle Course","Ninja Warrior",
  ],

  // ── TECHNOLOGY ────────────────────────────────────────────────────────────────
  Technology: [
    // Consumer apps/products
    "iPhone","iPad","MacBook","AirPods","Apple Watch","Vision Pro",
    "Android","Pixel","Galaxy","Surface","Xbox","PlayStation","Nintendo Switch",
    "ChatGPT","Claude","Gemini","Copilot","Midjourney","Stable Diffusion","DALL-E",
    "Sora","Pika","Runway","ElevenLabs","Whisper","Suno","Udio",
    "Netflix","Spotify","YouTube","TikTok","Instagram","Snapchat","BeReal",
    "Twitter","Threads","Mastodon","Bluesky","LinkedIn","Facebook","WhatsApp",
    "Telegram","Signal","Discord","Slack","Zoom","Teams","Google Meet",
    "Uber","Lyft","DoorDash","Instacart","Grubhub","Deliveroo","Grab",
    "Airbnb","Booking","Expedia","Tripadvisor","Google Maps","Waze","Citymapper",
    "Amazon","eBay","Etsy","Shopify","Stripe","PayPal","Venmo","CashApp",
    // Dev tools
    "GitHub","GitLab","Bitbucket","Jira","Linear","Notion","Obsidian","Roam",
    "Figma","Sketch","Framer","Webflow","Wix","Squarespace","WordPress",
    "VS Code","IntelliJ","Xcode","Android Studio","Replit","CodeSandbox",
    "Vercel","Netlify","Railway","Render","Heroku","Fly.io","PlanetScale",
    "Supabase","Firebase","Amplify","Appwrite","Pocketbase","Neon","Turso",
    "Docker","Kubernetes","Terraform","Ansible","Puppet","Chef","Vagrant",
    "React","Vue","Angular","Svelte","SolidJS","Next.js","Nuxt","Remix","Astro",
    "Node.js","Deno","Bun","Python","Rust","Go","Zig","Elixir","Haskell",
    "PostgreSQL","MySQL","MongoDB","Redis","Cassandra","DynamoDB","Neo4j",
    // Companies
    "Google","Apple","Microsoft","Amazon","Meta","Netflix","Tesla","NVIDIA",
    "OpenAI","Anthropic","DeepMind","Mistral","Cohere","Stability AI",
    "SpaceX","Blue Origin","Virgin Galactic","Waymo","Cruise","Zoox",
    "Stripe","Square","Plaid","Robinhood","Coinbase","Binance",
    // Concepts/trends
    "Blockchain","NFT","Metaverse","Virtual Reality","Augmented Reality",
    "5G","Wi-Fi","Bluetooth","USB","HDMI","Thunderbolt","NFC","RFID",
    "Machine Learning","Deep Learning","Neural Network","Large Language Model",
    "Quantum Computing","Edge Computing","Fog Computing","Cloud Computing",
  ],

  // ── ANIMALS ───────────────────────────────────────────────────────────────────
  Animals: [
    // Mammals
    "Lion","Tiger","Leopard","Cheetah","Jaguar","Cougar","Lynx","Ocelot",
    "Elephant","Rhino","Hippo","Giraffe","Zebra","Wildebeest","Buffalo",
    "Gorilla","Chimpanzee","Orangutan","Bonobo","Baboon","Macaque","Gibbon",
    "Wolf","Fox","Coyote","Dingo","Hyena","Wild Dog","Meerkat","Mongoose",
    "Bear","Grizzly","Polar Bear","Panda","Sun Bear","Moon Bear","Sloth Bear",
    "Puma","Ocelot","Margay","Serval","Caracal","Sand Cat","Fishing Cat",
    "Dolphin","Whale","Orca","Narwhal","Beluga","Manatee","Dugong","Walrus",
    "Seal","Sea Lion","Otter","Beaver","Mink","Weasel","Badger","Wolverine",
    "Deer","Moose","Elk","Caribou","Reindeer","Antelope","Gazelle","Springbok",
    "Kangaroo","Koala","Wombat","Platypus","Echidna","Tasmanian Devil","Quoll",
    "Camel","Dromedary","Llama","Alpaca","Vicuña","Guanaco","Horse","Donkey",
    "Pig","Boar","Peccary","Tapir","Rhinoceros","Okapi","Aardvark","Pangolin",
    "Armadillo","Anteater","Sloth","Capybara","Porcupine","Hedgehog","Shrew",
    // Birds
    "Eagle","Hawk","Falcon","Owl","Hummingbird","Peacock","Flamingo","Toucan",
    "Parrot","Macaw","Cockatoo","Cockatiel","Lovebird","Finch","Canary",
    "Penguin","Ostrich","Emu","Cassowary","Kiwi","Albatross","Pelican",
    "Crane","Heron","Stork","Ibis","Spoonbill","Flamingo","Duck","Swan",
    "Crow","Raven","Magpie","Jay","Starling","Robin","Sparrow","Pigeon",
    // Reptiles & Amphibians
    "Crocodile","Alligator","Caiman","Gharial","Komodo Dragon","Monitor Lizard",
    "Chameleon","Gecko","Iguana","Skink","Anole","Horned Lizard","Bearded Dragon",
    "King Cobra","Anaconda","Python","Boa","Rattlesnake","Mamba","Viper",
    "Sea Turtle","Leatherback","Tortoise","Box Turtle","Painted Turtle",
    "Frog","Toad","Tree Frog","Poison Dart Frog","Axolotl","Salamander","Newt",
    // Sea
    "Shark","Great White","Hammerhead","Tiger Shark","Whale Shark","Manta Ray",
    "Octopus","Squid","Cuttlefish","Nautilus","Jellyfish","Sea Anemone",
    "Clownfish","Seahorse","Pufferfish","Anglerfish","Swordfish","Tuna",
    "Lobster","Crab","Shrimp","Crayfish","Barnacle","Sea Urchin","Starfish",
    // Insects
    "Butterfly","Moth","Bee","Wasp","Ant","Termite","Dragonfly","Damselfly",
    "Praying Mantis","Stick Insect","Grasshopper","Cricket","Firefly","Beetle",
  ],

  // ── OBJECTS ───────────────────────────────────────────────────────────────────
  // Easy to illustrate, describe, or draw — used for both Game 1 and Game 2
  Objects: [
    // Furniture & Home
    "Chair","Sofa","Table","Bed","Desk","Bookshelf","Wardrobe","Mirror",
    "Lamp","Candle","Clock","Calendar","Rug","Curtain","Pillow","Blanket",
    "Vase","Picture Frame","Painting","Sculpture","Trophy","Medal","Crown",
    // Kitchen
    "Kettle","Toaster","Blender","Mixer","Pan","Pot","Knife","Fork",
    "Spoon","Chopsticks","Plate","Bowl","Cup","Mug","Bottle","Jar",
    "Whisk","Rolling Pin","Spatula","Ladle","Colander","Cutting Board",
    // Technology
    "Phone","Laptop","Camera","Television","Radio","Headphones","Speaker",
    "Keyboard","Mouse","Monitor","Printer","Scanner","Remote","Calculator",
    "Thermometer","Compass","Microscope","Telescope","Binoculars","Magnifier",
    // Musical Instruments
    "Guitar","Piano","Violin","Cello","Bass","Drums","Trumpet","Saxophone",
    "Flute","Clarinet","Trombone","French Horn","Harp","Accordion","Ukulele",
    "Banjo","Mandolin","Sitar","Tabla","Djembe","Maracas","Tambourine",
    // Sports equipment
    "Ball","Bat","Racket","Golf Club","Glove","Helmet","Net","Goal",
    "Skateboard","Surfboard","Snowboard","Ski","Bicycle","Kayak","Canoe",
    // Clothing/Accessories
    "Hat","Cap","Sunglasses","Watch","Ring","Necklace","Bracelet","Belt",
    "Tie","Scarf","Gloves","Boots","Sneakers","Heels","Sandals","Flip Flops",
    "Backpack","Handbag","Briefcase","Wallet","Umbrella","Fan","Cane","Walking Stick",
    // Tools
    "Hammer","Screwdriver","Wrench","Drill","Saw","Axe","Shovel","Rake",
    "Broom","Mop","Bucket","Ladder","Tape","Scissors","Needle","Thread",
    // Transport
    "Car","Motorcycle","Bicycle","Truck","Bus","Train","Airplane","Helicopter",
    "Boat","Ship","Submarine","Rocket","Hot Air Balloon","Tram","Scooter",
    // Nature/Outdoors
    "Mountain","River","Lake","Beach","Forest","Desert","Cave","Waterfall",
    "Volcano","Island","Peninsula","Bay","Gulf","Cliff","Dune","Glacier",
    "Diamond","Ruby","Emerald","Sapphire","Pearl","Gold","Silver","Crystal",
    "Leaf","Flower","Rose","Sunflower","Tree","Cactus","Mushroom","Feather",
    // Buildings/Places
    "Castle","Palace","Tower","Lighthouse","Windmill","Bridge","Pyramid",
    "Temple","Cathedral","Mosque","Synagogue","Pagoda","Igloo","Tent","Cabin",
    // Misc
    "Balloon","Kite","Lantern","Candle","Firework","Star","Moon","Sun",
    "Rainbow","Cloud","Lightning","Snowflake","Flame","Wave","Spiral","Arrow",
    "Key","Lock","Padlock","Chain","Hook","Anchor","Compass Rose","Map",
    "Hourglass","Dice","Card","Chess Piece","Joker","Puzzle Piece","Rubik's Cube",
  ],
}

// Random mixes all categories
export const getWordBank = (category: Category): string[] => {
  if (category === "Random") {
    return Object.values(WORD_BANKS).flat()
  }
  return WORD_BANKS[category]
}

// Pick a word not recently used in this room
export const pickWord = (category: Category, usedWords: string[] = []): string => {
  const pool = getWordBank(category)
  const fresh = pool.filter(w => !usedWords.includes(w))
  const src   = fresh.length > 0 ? fresh : pool // reset when exhausted
  return src[Math.floor(Math.random() * src.length)]
}

// ── DRAW GAME word bank (objects/food only — things you can draw) ──────────────
// No celebrities, movies, or abstract concepts
export const DRAW_CATEGORIES = ["Objects", "Food", "Animals"] as const
export type DrawCategory = typeof DRAW_CATEGORIES[number]

// Simple seed hash for consistent loremflickr image
export const wordSeed = (word: string): number =>
  Math.abs(word.split("").reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0)) % 100000
