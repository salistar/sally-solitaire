/**
 * @file fullCatalog.ts — Full SALISTAR solitaire taxonomy (21 families, 177 variants).
 * Generated from solitaires_master.json. This catalog is for browsing only.
 *
 * Playable variants point to the legacy VariantKey in legacyKey so the existing
 * game screens (which key off VARIANTS in variants.ts) still work without any
 * change. Non-playable variants surface as "Bientôt disponible".
 */

export interface CatalogFamily {
  id: string;
  nameFr: string;
  nameEn: string;
  description: string;
  nVariants: number;
  totalGames: number;
}

export interface CatalogVariant {
  key: string;
  family: string;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  /** Built-in engine if any, otherwise null. */
  engine: 'klondike' | 'spider' | 'freecell' | 'yukon' | 'golf' | 'pyramid' | 'tripeaks' | 'fortythieves' | 'accordion' | 'generic_tableau' | 'generic_distribution' | null;
  /** Legacy VariantKey from variants.ts when this variant is playable, else null. */
  legacyKey: string | null;
  available: boolean;
}

export const FULL_FAMILIES: CatalogFamily[] = [
  {
    "id": "klondike",
    "nameFr": "Klondike",
    "nameEn": "Klondike",
    "description": "",
    "nVariants": 11,
    "totalGames": 1650
  },
  {
    "id": "spider",
    "nameFr": "Spider",
    "nameEn": "Spider",
    "description": "Former des suites complètes descendantes de Roi à As d'une même couleur (8 suites pour 2 decks, 4 suites pour 1 deck), retirées vers les fondations.",
    "nVariants": 13,
    "totalGames": 1950
  },
  {
    "id": "freecell",
    "nameFr": "FreeCell",
    "nameEn": "FreeCell",
    "description": "Déplacer les 52 cartes vers les 4 fondations (une par couleur), de l'As au Roi.",
    "nVariants": 11,
    "totalGames": 1650
  },
  {
    "id": "yukon",
    "nameFr": "Yukon",
    "nameEn": "Yukon",
    "description": "Déplacer les 52 cartes vers les 4 fondations (une par couleur), de l'As au Roi.",
    "nVariants": 6,
    "totalGames": 900
  },
  {
    "id": "pyramid",
    "nameFr": "Pyramide",
    "nameEn": "Pyramid",
    "description": "Retirer toutes les cartes de la pyramide en formant des paires totalisant 13.",
    "nVariants": 9,
    "totalGames": 1350
  },
  {
    "id": "tripeaks_golf",
    "nameFr": "TriPeaks / Golf",
    "nameEn": "TriPeaks_Golf",
    "description": "Retirer toutes les cartes du tableau en les chaînant ±1 par rapport à la carte du dessus de la défausse.",
    "nVariants": 9,
    "totalGames": 1350
  },
  {
    "id": "fans",
    "nameFr": "Carré / Calques (Fans)",
    "nameEn": "Fans",
    "description": "Déplacer toutes les cartes vers les fondations (4 ou 8 selon variante).",
    "nVariants": 9,
    "totalGames": 1350
  },
  {
    "id": "canfield",
    "nameFr": "Canfield",
    "nameEn": "Canfield",
    "description": "Déplacer toutes les cartes vers les fondations (4 ou 8 selon variante).",
    "nVariants": 9,
    "totalGames": 1350
  },
  {
    "id": "forty_thieves",
    "nameFr": "Napoléon / Forty Thieves",
    "nameEn": "Forty_Thieves",
    "description": "Déplacer les 104 cartes (2 decks) vers les 8 fondations (2 par couleur), de l'As au Roi.",
    "nVariants": 14,
    "totalGames": 2100
  },
  {
    "id": "clock",
    "nameFr": "Horloge",
    "nameEn": "Clock",
    "description": "Placer toutes les cartes dans les piles correspondant à leur 'heure' (As=1h, 2=2h, ..., Valet=11h, Dame=12h, Roi=centre).",
    "nVariants": 5,
    "totalGames": 750
  },
  {
    "id": "pairs",
    "nameFr": "Couplage / Pairs",
    "nameEn": "Pairs",
    "description": "Retirer toutes les cartes par paires selon la règle de la variante.",
    "nVariants": 10,
    "totalGames": 1500
  },
  {
    "id": "accordion",
    "nameFr": "Accordéon",
    "nameEn": "Accordion",
    "description": "Compresser toutes les cartes en une seule pile finale en utilisant la mécanique d'accordéon.",
    "nVariants": 6,
    "totalGames": 900
  },
  {
    "id": "castle",
    "nameFr": "Beleaguered Castle (Château assiégé)",
    "nameEn": "Beleaguered_Castle",
    "description": "Déplacer les 52 cartes (104 pour Bastion) vers les fondations.",
    "nVariants": 9,
    "totalGames": 1350
  },
  {
    "id": "gypsy",
    "nameFr": "Gypsy / Whitehead",
    "nameEn": "Gypsy",
    "description": "Famille où on distribue le tableau initial, puis on ajoute des cartes du stock par 'volées' (8 cartes à la fois sur les colonnes). Empilement par couleurs alternées (Gypsy classique). 2 decks dans plusieurs variantes.",
    "nVariants": 7,
    "totalGames": 1050
  },
  {
    "id": "russian_bezique",
    "nameFr": "Mat Russe / Bezique",
    "nameEn": "Russian_Bezique",
    "description": "Famille de solitaires russes et de tradition européenne, basés sur Bezique et le Mat russe. Souvent 2 decks, mécanique tactique avec réserves.",
    "nVariants": 4,
    "totalGames": 600
  },
  {
    "id": "royal_coronation",
    "nameFr": "La Patience Royale / Couronnement",
    "nameEn": "Royal_Coronation",
    "description": "Famille de solitaires 'royaux' historiques. 1 deck généralement, avec réserves et fondations. Mécaniques tactiques inspirées des cours royales.",
    "nVariants": 8,
    "totalGames": 1200
  },
  {
    "id": "numeric_math",
    "nameFr": "Numérique / Math",
    "nameEn": "Numeric_Math",
    "description": "Famille de solitaires basés sur des règles numériques précises (suites mathématiques, séquences). Pas de couleurs en général. Calcul mental requis.",
    "nVariants": 8,
    "totalGames": 1200
  },
  {
    "id": "mahjong_cards",
    "nameFr": "Mahjong-style aux cartes",
    "nameEn": "Mahjong_Cards",
    "description": "Solitaires d'appariement style Mahjong adaptés aux cartes. Mécanique : on retire des paires/groupes de cartes en respectant les contraintes d'accessibilité (cartes 'libres' = sans rien dessus).",
    "nVariants": 3,
    "totalGames": 450
  },
  {
    "id": "multiplayer",
    "nameFr": "Solitaires multi-joueurs / compétitifs",
    "nameEn": "Multiplayer",
    "description": "Solitaires conçus pour être joués à 2 joueurs ou plus, en compétition (le premier à finir gagne). Chaque joueur a son propre tableau mais partage des fondations centrales. Ici on génère le set-up pour 1 joueur (l'app peut dupliquer).",
    "nVariants": 5,
    "totalGames": 750
  },
  {
    "id": "modern_hybrid",
    "nameFr": "Variantes modernes / hybrides",
    "nameEn": "Modern_Hybrid",
    "description": "Solitaires modernes ou hybrides combinant des mécaniques de plusieurs familles classiques.",
    "nVariants": 11,
    "totalGames": 1650
  },
  {
    "id": "french_traditional",
    "nameFr": "Solitaires français traditionnels",
    "nameEn": "French_Traditional",
    "description": "Solitaires de tradition française, souvent appelés 'patiences' ou 'réussites'. Mécaniques variées, généralement 1 deck.",
    "nVariants": 10,
    "totalGames": 1500
  }
];

export const FULL_VARIANTS: CatalogVariant[] = [
  {
    "key": "klondike_classic",
    "family": "klondike",
    "nameFr": "Klondike (classique)",
    "nameEn": "Klondike (classic)",
    "descriptionFr": "Le solitaire classique de Windows. 7 colonnes, distribution 1-2-3-4-5-6-7, pioche 1 carte à la fois, recyclages illimités.",
    "engine": "klondike",
    "legacyKey": "klondike_classic",
    "available": true
  },
  {
    "key": "klondike_turn1",
    "family": "klondike",
    "nameFr": "Klondike Turn 1",
    "nameEn": "Klondike Turn 1",
    "descriptionFr": "Variante de Klondike où l'on pioche 1 carte à la fois. Identique au classique.",
    "engine": "klondike",
    "legacyKey": "klondike_turn1",
    "available": true
  },
  {
    "key": "klondike_turn3",
    "family": "klondike",
    "nameFr": "Klondike Turn 3",
    "nameEn": "Klondike Turn 3",
    "descriptionFr": "Klondike où l'on pioche 3 cartes à la fois (seule la 3e est jouable). Variante plus difficile.",
    "engine": "klondike",
    "legacyKey": "klondike_turn3",
    "available": true
  },
  {
    "key": "vegas_solitaire",
    "family": "klondike",
    "nameFr": "Vegas Solitaire",
    "nameEn": "Vegas Solitaire",
    "descriptionFr": "Klondike Turn 3 avec un seul passage du stock autorisé (pas de recyclage). Système de scoring monétaire.",
    "engine": "klondike",
    "legacyKey": "vegas_solitaire",
    "available": true
  },
  {
    "key": "double_klondike",
    "family": "klondike",
    "nameFr": "Double Klondike",
    "nameEn": "Double Klondike",
    "descriptionFr": "Klondike avec 2 jeux (104 cartes), 9 colonnes, 8 fondations.",
    "engine": "klondike",
    "legacyKey": "double_klondike",
    "available": true
  },
  {
    "key": "triple_klondike",
    "family": "klondike",
    "nameFr": "Triple Klondike",
    "nameEn": "Triple Klondike",
    "descriptionFr": "Klondike avec 3 jeux (156 cartes), 13 colonnes, 12 fondations.",
    "engine": "klondike",
    "legacyKey": "triple_klondike",
    "available": true
  },
  {
    "key": "westcliff",
    "family": "klondike",
    "nameFr": "Westcliff",
    "nameEn": "Westcliff",
    "descriptionFr": "1 deck, 10 colonnes de 3 cartes (2 cachées + 1 visible). Stock plus petit (22 cartes).",
    "engine": "klondike",
    "legacyKey": "westcliff",
    "available": true
  },
  {
    "key": "easthaven",
    "family": "klondike",
    "nameFr": "Easthaven",
    "nameEn": "Easthaven",
    "descriptionFr": "Variante avec 7 colonnes de 3 cartes. Quand on est bloqué, on distribue 7 cartes du stock (une par colonne).",
    "engine": "klondike",
    "legacyKey": "easthaven",
    "available": true
  },
  {
    "key": "thumb_and_pouch",
    "family": "klondike",
    "nameFr": "Thumb and Pouch",
    "nameEn": "Thumb and Pouch",
    "descriptionFr": "Klondike avec règles plus souples : on peut empiler n'importe quelle couleur sauf la même, et les colonnes vides acceptent n'importe quelle carte.",
    "engine": "klondike",
    "legacyKey": "thumb_and_pouch",
    "available": true
  },
  {
    "key": "agnes_sorel",
    "family": "klondike",
    "nameFr": "Agnes Sorel",
    "nameEn": "Agnes Sorel",
    "descriptionFr": "Variante d'Agnes où la première carte du stock définit le rang de base des fondations. Pas de stock à piocher après distribution.",
    "engine": "klondike",
    "legacyKey": "agnes_sorel",
    "available": true
  },
  {
    "key": "agnes_bernauer",
    "family": "klondike",
    "nameFr": "Agnes Bernauer",
    "nameEn": "Agnes Bernauer",
    "descriptionFr": "Variante d'Agnes avec 7 cartes de réserve. La 1re carte tirée définit le rang de base des fondations.",
    "engine": "klondike",
    "legacyKey": "agnes_bernauer",
    "available": true
  },
  {
    "key": "spider_1suit",
    "family": "spider",
    "nameFr": "Spider 1 couleur",
    "nameEn": "Spider 1 Suit",
    "descriptionFr": "Spider avec une seule couleur (toutes Pique). 2 decks (104 cartes), 10 colonnes, 8 suites à former. Niveau facile.",
    "engine": "spider",
    "legacyKey": "spider_1suit",
    "available": true
  },
  {
    "key": "spider_2suits",
    "family": "spider",
    "nameFr": "Spider 2 couleurs",
    "nameEn": "Spider 2 Suits",
    "descriptionFr": "Spider avec 2 couleurs (Pique et Coeur). 2 decks, 10 colonnes, 8 suites. Niveau intermédiaire.",
    "engine": "spider",
    "legacyKey": "spider_2suits",
    "available": true
  },
  {
    "key": "spider_4suits",
    "family": "spider",
    "nameFr": "Spider 4 couleurs",
    "nameEn": "Spider 4 Suits",
    "descriptionFr": "Spider classique avec les 4 couleurs. 2 decks, 10 colonnes, 8 suites. Le plus difficile.",
    "engine": "spider",
    "legacyKey": "spider_4suits",
    "available": true
  },
  {
    "key": "spiderette",
    "family": "spider",
    "nameFr": "Spiderette",
    "nameEn": "Spiderette",
    "descriptionFr": "Mini-Spider 1 deck (52 cartes), 7 colonnes (distribution Klondike 1-2-3-4-5-6-7), 4 suites.",
    "engine": "spider",
    "legacyKey": "spiderette",
    "available": true
  },
  {
    "key": "spiderwort",
    "family": "spider",
    "nameFr": "Spiderwort",
    "nameEn": "Spiderwort",
    "descriptionFr": "Spider 1 deck simplifié, 8 colonnes, 4 suites à former.",
    "engine": "generic_tableau",
    "legacyKey": "spiderwort",
    "available": true
  },
  {
    "key": "black_widow",
    "family": "spider",
    "nameFr": "Black Widow",
    "nameEn": "Black Widow",
    "descriptionFr": "Spider 4 couleurs avec empilement en couleurs alternées (noir/rouge) au lieu de couleurs identiques. 2 decks.",
    "engine": "spider",
    "legacyKey": "black_widow",
    "available": true
  },
  {
    "key": "will_o_wisp",
    "family": "spider",
    "nameFr": "Will o' the Wisp",
    "nameEn": "Will o' the Wisp",
    "descriptionFr": "Spider 1 deck, 7 colonnes de 3 cartes. Petite version rapide.",
    "engine": "generic_tableau",
    "legacyKey": "will_o_wisp",
    "available": true
  },
  {
    "key": "scorpion",
    "family": "spider",
    "nameFr": "Scorpion",
    "nameEn": "Scorpion",
    "descriptionFr": "Spider 1 deck, 7 colonnes de 7 cartes. On peut déplacer une carte avec toutes celles au-dessus (même non triées).",
    "engine": "spider",
    "legacyKey": "scorpion",
    "available": true
  },
  {
    "key": "wasp",
    "family": "spider",
    "nameFr": "Wasp",
    "nameEn": "Wasp",
    "descriptionFr": "Variante de Scorpion : colonnes vides acceptent n'importe quelle séquence.",
    "engine": "spider",
    "legacyKey": "wasp",
    "available": true
  },
  {
    "key": "beetle",
    "family": "spider",
    "nameFr": "Beetle",
    "nameEn": "Beetle",
    "descriptionFr": "Hybride Spider/Scorpion : empilement par couleurs identiques mais déplacement libre.",
    "engine": "generic_tableau",
    "legacyKey": "beetle",
    "available": true
  },
  {
    "key": "mrs_mop",
    "family": "spider",
    "nameFr": "Mrs. Mop",
    "nameEn": "Mrs. Mop",
    "descriptionFr": "Spider 4 couleurs SANS cartes cachées, toutes face_up dès le départ. Pas de stock. 13 colonnes de 8 cartes.",
    "engine": "generic_tableau",
    "legacyKey": "mrs_mop",
    "available": true
  },
  {
    "key": "simple_simon",
    "family": "spider",
    "nameFr": "Simple Simon",
    "nameEn": "Simple Simon",
    "descriptionFr": "Spider 1 deck, 10 colonnes, distribution 8-7-6-5-4-3-2-1-8-8 (52 cartes). Toutes face_up. Pas de stock.",
    "engine": "spider",
    "legacyKey": "simple_simon",
    "available": true
  },
  {
    "key": "relaxed_spider",
    "family": "spider",
    "nameFr": "Relaxed Spider",
    "nameEn": "Relaxed Spider",
    "descriptionFr": "Spider 4 couleurs avec règles assouplies : on peut piocher du stock même si une colonne est vide. 2 decks.",
    "engine": "spider",
    "legacyKey": "relaxed_spider",
    "available": true
  },
  {
    "key": "freecell_classic",
    "family": "freecell",
    "nameFr": "FreeCell (classique)",
    "nameEn": "FreeCell (classic)",
    "descriptionFr": "FreeCell classique. 8 colonnes (4 col de 7 + 4 col de 6 = 52 cartes), 4 cellules libres, 4 fondations. Empilement par couleurs alternées.",
    "engine": "freecell",
    "legacyKey": "freecell_classic",
    "available": true
  },
  {
    "key": "bakers_game",
    "family": "freecell",
    "nameFr": "Baker's Game",
    "nameEn": "Baker's Game",
    "descriptionFr": "FreeCell où l'empilement se fait par couleurs IDENTIQUES (au lieu d'alternées). Plus difficile.",
    "engine": "freecell",
    "legacyKey": "bakers_game",
    "available": true
  },
  {
    "key": "eight_off",
    "family": "freecell",
    "nameFr": "Eight Off",
    "nameEn": "Eight Off",
    "descriptionFr": "8 cellules libres (au lieu de 4), 8 colonnes de 6 cartes (4 cellules pré-remplies). Empilement par même couleur.",
    "engine": "freecell",
    "legacyKey": "eight_off",
    "available": true
  },
  {
    "key": "seahaven_towers",
    "family": "freecell",
    "nameFr": "Seahaven Towers",
    "nameEn": "Seahaven Towers",
    "descriptionFr": "10 colonnes de 5 cartes, 4 cellules libres dont 2 sont déjà occupées au départ. Empilement par même couleur.",
    "engine": "freecell",
    "legacyKey": "seahaven_towers",
    "available": true
  },
  {
    "key": "forecell",
    "family": "freecell",
    "nameFr": "ForeCell",
    "nameEn": "ForeCell",
    "descriptionFr": "Variante stricte de FreeCell : les colonnes vides ne peuvent recevoir QUE des Rois. Les 4 cellules libres sont remplies au départ. 8 colonnes de 6 cartes (48) + 4 cellules = 52 cartes.",
    "engine": "freecell",
    "legacyKey": "forecell",
    "available": true
  },
  {
    "key": "penguin",
    "family": "freecell",
    "nameFr": "Penguin",
    "nameEn": "Penguin",
    "descriptionFr": "Variante avec 7 colonnes de 7 cartes (49) + 3 cartes 'flipper' (de même rang que la 1ère carte) en cellules. 7 cellules libres.",
    "engine": "generic_tableau",
    "legacyKey": "penguin",
    "available": true
  },
  {
    "key": "stalactites",
    "family": "freecell",
    "nameFr": "Stalactites",
    "nameEn": "Stalactites",
    "descriptionFr": "PAS de cellules libres. 8 colonnes de 6 cartes (48) + 4 cartes en fondations centrales pré-remplies. Empilement libre (n'importe quelle carte de rang -1).",
    "engine": "generic_tableau",
    "legacyKey": "stalactites",
    "available": true
  },
  {
    "key": "bath",
    "family": "freecell",
    "nameFr": "Bath",
    "nameEn": "Bath",
    "descriptionFr": "10 colonnes (4 col de 6 + 6 col de 5 = 54... ajusté à 52), 4 cellules libres, alternance couleur.",
    "engine": "generic_tableau",
    "legacyKey": "bath",
    "available": true
  },
  {
    "key": "challenge_freecell",
    "family": "freecell",
    "nameFr": "Challenge FreeCell",
    "nameEn": "Challenge FreeCell",
    "descriptionFr": "FreeCell où les 4 As sont placés au TOP de leurs colonnes (donc difficiles à libérer). Plus difficile.",
    "engine": "freecell",
    "legacyKey": "challenge_freecell",
    "available": true
  },
  {
    "key": "super_challenge_freecell",
    "family": "freecell",
    "nameFr": "Super Challenge FreeCell",
    "nameEn": "Super Challenge FreeCell",
    "descriptionFr": "Challenge FreeCell où les 4 As ET les 4 Deux sont placés au TOP des colonnes. Très difficile.",
    "engine": "generic_tableau",
    "legacyKey": "super_challenge_freecell",
    "available": true
  },
  {
    "key": "relaxed_freecell",
    "family": "freecell",
    "nameFr": "Relaxed FreeCell",
    "nameEn": "Relaxed FreeCell",
    "descriptionFr": "FreeCell avec règle de déplacement multi-cartes plus permissive : on peut déplacer plusieurs cartes même sans cellule libre disponible.",
    "engine": "freecell",
    "legacyKey": "relaxed_freecell",
    "available": true
  },
  {
    "key": "yukon_classic",
    "family": "yukon",
    "nameFr": "Yukon (classique)",
    "nameEn": "Yukon (classic)",
    "descriptionFr": "Yukon classique. 7 colonnes (1-6-7-8-9-10-11 = 52 cartes), pas de stock. Plusieurs cartes face_up par colonne. On peut déplacer n'importe quelle carte avec toutes celles au-dessus.",
    "engine": "yukon",
    "legacyKey": "yukon_classic",
    "available": true
  },
  {
    "key": "russian_solitaire",
    "family": "yukon",
    "nameFr": "Russian Solitaire",
    "nameEn": "Russian Solitaire",
    "descriptionFr": "Yukon mais empilement par MÊME COULEUR au lieu de couleurs alternées. Plus difficile.",
    "engine": "yukon",
    "legacyKey": "russian_solitaire",
    "available": true
  },
  {
    "key": "alaska",
    "family": "yukon",
    "nameFr": "Alaska",
    "nameEn": "Alaska",
    "descriptionFr": "Yukon avec empilement par même couleur, ET on peut empiler en descendant OU ascendant.",
    "engine": "yukon",
    "legacyKey": "alaska",
    "available": true
  },
  {
    "key": "moosehide",
    "family": "yukon",
    "nameFr": "Moosehide",
    "nameEn": "Moosehide",
    "descriptionFr": "Yukon avec empilement par couleurs alternées strictes (mêmes couleurs interdites entre cartes adjacentes).",
    "engine": "yukon",
    "legacyKey": "moosehide",
    "available": true
  },
  {
    "key": "australian_patience",
    "family": "yukon",
    "nameFr": "Australian Patience",
    "nameEn": "Australian Patience",
    "descriptionFr": "Yukon-like : 7 colonnes de 4 cartes (28 cartes), + stock de 24 cartes piochées 1 par 1. Empilement même couleur.",
    "engine": "yukon",
    "legacyKey": "australian_patience",
    "available": true
  },
  {
    "key": "yukon_cells",
    "family": "yukon",
    "nameFr": "Yukon Cells",
    "nameEn": "Yukon Cells",
    "descriptionFr": "Yukon + 4 cellules libres (style FreeCell). Beaucoup plus facile grâce aux zones de stockage temporaire.",
    "engine": "generic_tableau",
    "legacyKey": "yukon_cells",
    "available": true
  },
  {
    "key": "pyramid_classic",
    "family": "pyramid",
    "nameFr": "Pyramide (classique)",
    "nameEn": "Pyramid (classic)",
    "descriptionFr": "Pyramide classique. 28 cartes disposées en pyramide (1-2-3-4-5-6-7) + 24 cartes en stock. Retirer les paires totalisant 13. Roi = retiré seul.",
    "engine": "pyramid",
    "legacyKey": "pyramid_classic",
    "available": true
  },
  {
    "key": "tuts_tomb",
    "family": "pyramid",
    "nameFr": "Tut's Tomb",
    "nameEn": "Tut's Tomb",
    "descriptionFr": "Variante de Pyramide avec 4 réserves additionnelles. 28 cartes en pyramide + 4 réserves + 20 stock.",
    "engine": "generic_tableau",
    "legacyKey": "tuts_tomb",
    "available": true
  },
  {
    "key": "giza",
    "family": "pyramid",
    "nameFr": "Giza",
    "nameEn": "Giza",
    "descriptionFr": "3 pyramides plus petites côte à côte. Distribution 6 cartes par pyramide (3 rangées) = 18 cartes + 8 réserves + 26 stock.",
    "engine": "pyramid",
    "legacyKey": "giza",
    "available": true
  },
  {
    "key": "pharaoh",
    "family": "pyramid",
    "nameFr": "Pharaoh",
    "nameEn": "Pharaoh",
    "descriptionFr": "Pyramide principale + 2 mini-pyramides bonus (3 cartes chacune). Total 28 + 6 + 18 = 52 cartes (pas de stock).",
    "engine": "pyramid",
    "legacyKey": "pharaoh",
    "available": true
  },
  {
    "key": "triangle",
    "family": "pyramid",
    "nameFr": "Triangle",
    "nameEn": "Triangle",
    "descriptionFr": "Pyramide INVERSÉE (7 cartes en haut, 1 en bas). 28 cartes en triangle + 24 stock. La règle d'exposition est inversée.",
    "engine": "generic_tableau",
    "legacyKey": "triangle",
    "available": true
  },
  {
    "key": "apophis",
    "family": "pyramid",
    "nameFr": "Apophis",
    "nameEn": "Apophis",
    "descriptionFr": "Pyramide + 3 cartes 'réserve' visibles en cellules. Total 28 + 3 + 21 = 52 cartes.",
    "engine": "generic_tableau",
    "legacyKey": "apophis",
    "available": true
  },
  {
    "key": "cheops",
    "family": "pyramid",
    "nameFr": "Cheops",
    "nameEn": "Cheops",
    "descriptionFr": "Pyramide où l'appariement se fait par DIFFÉRENCE de 1 (et non par somme = 13). On retire 2 cartes consécutives (5+6, J+Q, etc.).",
    "engine": "generic_tableau",
    "legacyKey": "cheops",
    "available": true
  },
  {
    "key": "two_pyramids",
    "family": "pyramid",
    "nameFr": "Two Pyramids",
    "nameEn": "Two Pyramids",
    "descriptionFr": "2 pyramides classiques côte à côte (56 cartes). 2 decks partiels + stock de 48 cartes.",
    "engine": "pyramid",
    "legacyKey": "two_pyramids",
    "available": true
  },
  {
    "key": "relaxed_pyramid",
    "family": "pyramid",
    "nameFr": "Pyramide Relaxed",
    "nameEn": "Relaxed Pyramid",
    "descriptionFr": "Pyramide classique avec recyclages ILLIMITÉS et règles assouplies (on peut bouger des paires depuis n'importe où).",
    "engine": "generic_tableau",
    "legacyKey": "relaxed_pyramid",
    "available": true
  },
  {
    "key": "tripeaks",
    "family": "tripeaks_golf",
    "nameFr": "TriPeaks",
    "nameEn": "TriPeaks",
    "descriptionFr": "3 pics triangulaires (28 cartes au tableau : 3 sommets + 6 + 9 + 10 base) + stock de 24 cartes. On joue ±1 par rapport à la défausse.",
    "engine": "tripeaks",
    "legacyKey": "tripeaks",
    "available": true
  },
  {
    "key": "golf",
    "family": "tripeaks_golf",
    "nameFr": "Golf",
    "nameEn": "Golf",
    "descriptionFr": "7 colonnes de 5 cartes (35) + stock de 17 cartes piochées 1 par 1 vers la défausse. Pas de recyclage. Roi-As non connectés.",
    "engine": "generic_tableau",
    "legacyKey": "golf",
    "available": true
  },
  {
    "key": "black_hole",
    "family": "tripeaks_golf",
    "nameFr": "Black Hole",
    "nameEn": "Black Hole",
    "descriptionFr": "17 piles de 3 cartes autour de l'As de Pique (le 'trou noir'). Pas de stock. On joue ±1 (cyclique : K↔A) en retirant les cartes du dessus.",
    "engine": "golf",
    "legacyKey": "black_hole",
    "available": true
  },
  {
    "key": "all_in_a_row",
    "family": "tripeaks_golf",
    "nameFr": "All in a Row",
    "nameEn": "All in a Row",
    "descriptionFr": "13 piles linéaires de 4 cartes. Pas de stock. ±1 cyclique (K↔A). Toutes face_up.",
    "engine": "tripeaks",
    "legacyKey": "all_in_a_row",
    "available": true
  },
  {
    "key": "putt_putt",
    "family": "tripeaks_golf",
    "nameFr": "Putt Putt",
    "nameEn": "Putt Putt",
    "descriptionFr": "Comme Golf mais avec recyclage de la défausse autorisé (1 fois). 7 col × 5 + stock 17.",
    "engine": "golf",
    "legacyKey": "putt_putt",
    "available": true
  },
  {
    "key": "triple_peaks",
    "family": "tripeaks_golf",
    "nameFr": "Triple Peaks",
    "nameEn": "Triple Peaks",
    "descriptionFr": "TriPeaks avec wraparound : Roi peut connecter avec As. Plus permissif.",
    "engine": "generic_tableau",
    "legacyKey": "triple_peaks",
    "available": true
  },
  {
    "key": "pumpkin",
    "family": "tripeaks_golf",
    "nameFr": "Pumpkin",
    "nameEn": "Pumpkin",
    "descriptionFr": "Variante TriPeaks avec 4 pics au lieu de 3. 36 cartes au tableau (4 sommets + 8 + 12 + 12 base) + stock 16.",
    "engine": "generic_tableau",
    "legacyKey": "pumpkin",
    "available": true
  },
  {
    "key": "diamond_mine",
    "family": "tripeaks_golf",
    "nameFr": "Diamond Mine",
    "nameEn": "Diamond Mine",
    "descriptionFr": "Tableau en losange (diamant). 13 colonnes en losange (1+2+3+4+5+6+7+6+5+4+3+2+1=49) + stock 3.",
    "engine": "generic_tableau",
    "legacyKey": "diamond_mine",
    "available": true
  },
  {
    "key": "robert",
    "family": "tripeaks_golf",
    "nameFr": "Robert",
    "nameEn": "Robert",
    "descriptionFr": "Golf 9 colonnes × 4 cartes (36) + stock 16 avec recyclage illimité. Wraparound K↔A.",
    "engine": "generic_tableau",
    "legacyKey": "robert",
    "available": true
  },
  {
    "key": "la_belle_lucie",
    "family": "fans",
    "nameFr": "La Belle Lucie",
    "nameEn": "La Belle Lucie",
    "descriptionFr": "Le classique français : 17 éventails de 3 cartes (51) + 1 carte seule. Empilement par même couleur. 2 redistributions autorisées.",
    "engine": "generic_tableau",
    "legacyKey": "la_belle_lucie",
    "available": true
  },
  {
    "key": "trefoil",
    "family": "fans",
    "nameFr": "Trefoil",
    "nameEn": "Trefoil",
    "descriptionFr": "Comme La Belle Lucie mais les 4 As sont pré-placés en fondation. 16 éventails × 3 cartes = 48 cartes restantes.",
    "engine": "generic_tableau",
    "legacyKey": "trefoil",
    "available": true
  },
  {
    "key": "shamrocks",
    "family": "fans",
    "nameFr": "Shamrocks",
    "nameEn": "Shamrocks",
    "descriptionFr": "Comme La Belle Lucie mais AUCUNE redistribution autorisée. Plus difficile. 17 fans × 3 + 1 seule.",
    "engine": "generic_tableau",
    "legacyKey": "shamrocks",
    "available": true
  },
  {
    "key": "bristol",
    "family": "fans",
    "nameFr": "Bristol",
    "nameEn": "Bristol",
    "descriptionFr": "8 éventails × 3 cartes (24) + 3 réserves linéaires (24 cartes : 3 réserves × 8) + 4 singles. Total 52. Empilement par n'importe quelle couleur descendant.",
    "engine": "generic_tableau",
    "legacyKey": "bristol",
    "available": true
  },
  {
    "key": "fan",
    "family": "fans",
    "nameFr": "Fan",
    "nameEn": "Fan",
    "descriptionFr": "18 éventails de 3 cartes (= 54 mais ajusté à 17×3+1 pour totaliser 52). Empilement même couleur. Pas de redistribution.",
    "engine": "generic_tableau",
    "legacyKey": "fan",
    "available": true
  },
  {
    "key": "house_in_the_wood",
    "family": "fans",
    "nameFr": "House in the Wood",
    "nameEn": "House in the Wood",
    "descriptionFr": "Variante 2 decks (104 cartes) : 35 éventails × 3 cartes (105... ajusté). 8 fondations. Empilement par même couleur.",
    "engine": "generic_tableau",
    "legacyKey": "house_in_the_wood",
    "available": true
  },
  {
    "key": "house_on_the_hill",
    "family": "fans",
    "nameFr": "House on the Hill",
    "nameEn": "House on the Hill",
    "descriptionFr": "House in the Wood avec règles différentes : 4 fondations partent de l'As, 4 autres du Roi (descendant).",
    "engine": "generic_tableau",
    "legacyKey": "house_on_the_hill",
    "available": true
  },
  {
    "key": "falling_star",
    "family": "fans",
    "nameFr": "Falling Star",
    "nameEn": "Falling Star",
    "descriptionFr": "Variante La Belle Lucie où les éventails sont disposés en étoile. 17 fans × 3 + 1. 1 redistribution.",
    "engine": "generic_tableau",
    "legacyKey": "falling_star",
    "available": true
  },
  {
    "key": "clover_leaf",
    "family": "fans",
    "nameFr": "Clover Leaf",
    "nameEn": "Clover Leaf",
    "descriptionFr": "13 éventails disposés en 4 groupes (trèfle). 16 fans × 3 + 4 = 52. 8 fondations (2 par couleur).",
    "engine": "generic_tableau",
    "legacyKey": "clover_leaf",
    "available": true
  },
  {
    "key": "canfield_classic",
    "family": "canfield",
    "nameFr": "Canfield (classique)",
    "nameEn": "Canfield (classic)",
    "descriptionFr": "Le classique : 4 colonnes × 1 carte + réserve de 13 cartes + 1 carte en fondation (rang variable) + stock 34. Pioche par 3, recyclages illimités. Empilement couleurs alternées.",
    "engine": "generic_tableau",
    "legacyKey": "canfield_classic",
    "available": true
  },
  {
    "key": "demon",
    "family": "canfield",
    "nameFr": "Demon",
    "nameEn": "Demon",
    "descriptionFr": "Nom britannique de Canfield. Identique au Canfield classique. 4 col, réserve 13, stock 34.",
    "engine": "generic_tableau",
    "legacyKey": "demon",
    "available": true
  },
  {
    "key": "storehouse",
    "family": "canfield",
    "nameFr": "Storehouse",
    "nameEn": "Storehouse",
    "descriptionFr": "Canfield avec rang de base FIXE = 2. Les 4 fondations partent toujours du 2. 4 col × 1 + réserve 13 + stock 35.",
    "engine": "generic_tableau",
    "legacyKey": "storehouse",
    "available": true
  },
  {
    "key": "selective_canfield",
    "family": "canfield",
    "nameFr": "Selective Canfield",
    "nameEn": "Selective Canfield",
    "descriptionFr": "Le joueur CHOISIT la carte de base parmi les 5 premières cartes piochées. 4 col, réserve 13, stock 30.",
    "engine": "generic_tableau",
    "legacyKey": "selective_canfield",
    "available": true
  },
  {
    "key": "rainbow",
    "family": "canfield",
    "nameFr": "Rainbow",
    "nameEn": "Rainbow",
    "descriptionFr": "Canfield mais empilement par N'IMPORTE QUELLE COULEUR (juste rang descendant). Plus facile.",
    "engine": "generic_tableau",
    "legacyKey": "rainbow",
    "available": true
  },
  {
    "key": "american_toad",
    "family": "canfield",
    "nameFr": "American Toad",
    "nameEn": "American Toad",
    "descriptionFr": "Variante avec 2 decks (104 cartes). 8 colonnes × 1 + réserve 20 + 8 fondations + stock 75. Empilement même couleur.",
    "engine": "generic_tableau",
    "legacyKey": "american_toad",
    "available": true
  },
  {
    "key": "duchess",
    "family": "canfield",
    "nameFr": "Duchess",
    "nameEn": "Duchess",
    "descriptionFr": "4 colonnes × 1 + 4 mini-réserves de 3 cartes (12 réserves au total) + stock 35. Empilement couleurs alternées.",
    "engine": "generic_tableau",
    "legacyKey": "duchess",
    "available": true
  },
  {
    "key": "eagle_wing",
    "family": "canfield",
    "nameFr": "Eagle Wing",
    "nameEn": "Eagle Wing",
    "descriptionFr": "8 colonnes × 1 + réserve 13 disposée en 'ailes' (4 à gauche, 4 à droite) + stock 30. Empilement couleurs alternées.",
    "engine": "generic_tableau",
    "legacyKey": "eagle_wing",
    "available": true
  },
  {
    "key": "acme",
    "family": "canfield",
    "nameFr": "Acme",
    "nameEn": "Acme",
    "descriptionFr": "Canfield mais empilement par MÊME COULEUR descendant. Plus difficile. 4 col + réserve 4 (pas 13) + stock 43.",
    "engine": "generic_tableau",
    "legacyKey": "acme",
    "available": true
  },
  {
    "key": "forty_thieves",
    "family": "forty_thieves",
    "nameFr": "Forty Thieves (classique)",
    "nameEn": "Forty Thieves (classic)",
    "descriptionFr": "Le classique : 2 decks (104 cartes), 10 colonnes × 4 cartes (40), 8 fondations (As→K par couleur), stock 64, pioche 1, pas de recyclage. Empilement même couleur.",
    "engine": "generic_tableau",
    "legacyKey": "forty_thieves",
    "available": true
  },
  {
    "key": "napoleon_st_helena",
    "family": "forty_thieves",
    "nameFr": "Napoleon at St. Helena",
    "nameEn": "Napoleon at St. Helena",
    "descriptionFr": "Synonyme de Forty Thieves (nom anglais classique). 2 decks, 10 col × 4, 8 fondations, stock 64.",
    "engine": "fortythieves",
    "legacyKey": "napoleon_st_helena",
    "available": true
  },
  {
    "key": "limited",
    "family": "forty_thieves",
    "nameFr": "Limited",
    "nameEn": "Limited",
    "descriptionFr": "Forty Thieves avec 12 colonnes × 3 cartes (36 au tableau). Stock plus grand (68 cartes).",
    "engine": "fortythieves",
    "legacyKey": "limited",
    "available": true
  },
  {
    "key": "lucas",
    "family": "forty_thieves",
    "nameFr": "Lucas",
    "nameEn": "Lucas",
    "descriptionFr": "Variante avec les 8 As pré-placés en fondation. 13 colonnes × 3 cartes (39). Stock 57.",
    "engine": "fortythieves",
    "legacyKey": "lucas",
    "available": true
  },
  {
    "key": "maria",
    "family": "forty_thieves",
    "nameFr": "Maria",
    "nameEn": "Maria",
    "descriptionFr": "9 colonnes × 4 cartes (36). Empilement couleurs ALTERNÉES (plus permissif). 1 recyclage autorisé. Stock 68.",
    "engine": "generic_tableau",
    "legacyKey": "maria",
    "available": true
  },
  {
    "key": "streets",
    "family": "forty_thieves",
    "nameFr": "Streets",
    "nameEn": "Streets",
    "descriptionFr": "10 col × 4, empilement couleurs alternées. Pas de recyclage. Plus difficile que Maria.",
    "engine": "generic_tableau",
    "legacyKey": "streets",
    "available": true
  },
  {
    "key": "number_ten",
    "family": "forty_thieves",
    "nameFr": "Number Ten",
    "nameEn": "Number Ten",
    "descriptionFr": "10 col × 4, alternance couleur, mouvement multi-cartes autorisé. 2 cartes face_down + 2 face_up par colonne.",
    "engine": "generic_tableau",
    "legacyKey": "number_ten",
    "available": true
  },
  {
    "key": "rank_and_file",
    "family": "forty_thieves",
    "nameFr": "Rank and File",
    "nameEn": "Rank and File",
    "descriptionFr": "Variante de Number Ten avec séquences déplaçables. 3 face_down + 1 face_up par colonne. Multi-cartes.",
    "engine": "generic_tableau",
    "legacyKey": "rank_and_file",
    "available": true
  },
  {
    "key": "indian",
    "family": "forty_thieves",
    "nameFr": "Indian",
    "nameEn": "Indian",
    "descriptionFr": "10 colonnes × 3 cartes (30). Empilement par n'importe quelle couleur DIFFÉRENTE de la carte du dessus. Stock 74.",
    "engine": "generic_tableau",
    "legacyKey": "indian",
    "available": true
  },
  {
    "key": "josephine",
    "family": "forty_thieves",
    "nameFr": "Josephine",
    "nameEn": "Josephine",
    "descriptionFr": "Forty Thieves avec mouvement multi-cartes : on peut déplacer une séquence entière en une fois. 10 col × 4.",
    "engine": "generic_tableau",
    "legacyKey": "josephine",
    "available": true
  },
  {
    "key": "deuces",
    "family": "forty_thieves",
    "nameFr": "Deuces",
    "nameEn": "Deuces",
    "descriptionFr": "Les 8 fondations partent du 2 (As pré-placés). 10 col × 4. Empilement couleurs alternées. Cyclique : K → A.",
    "engine": "generic_tableau",
    "legacyKey": "deuces",
    "available": true
  },
  {
    "key": "corona",
    "family": "forty_thieves",
    "nameFr": "Corona",
    "nameEn": "Corona",
    "descriptionFr": "12 colonnes × 3 cartes (36) + 8 réserves linéaires (8 cartes). Stock 60. Empilement même couleur.",
    "engine": "generic_tableau",
    "legacyKey": "corona",
    "available": true
  },
  {
    "key": "famous_fifty",
    "family": "forty_thieves",
    "nameFr": "Famous Fifty",
    "nameEn": "Famous Fifty",
    "descriptionFr": "10 colonnes × 5 cartes (50). Stock 54. Empilement même couleur. Variation 'plus de cartes au tableau'.",
    "engine": "generic_tableau",
    "legacyKey": "famous_fifty",
    "available": true
  },
  {
    "key": "big_forty",
    "family": "forty_thieves",
    "nameFr": "Big Forty",
    "nameEn": "Big Forty",
    "descriptionFr": "Synonyme/variante de Forty Thieves classique avec 1 recyclage permis. 10 col × 4.",
    "engine": "generic_tableau",
    "legacyKey": "big_forty",
    "available": true
  },
  {
    "key": "clock_solitaire",
    "family": "clock",
    "nameFr": "Clock Solitaire (Horloge classique)",
    "nameEn": "Clock Solitaire (classic)",
    "descriptionFr": "Le classique : 13 piles de 4 cartes (52). 12 piles autour formant un cadran d'horloge + 1 pile centrale. On retourne les cartes une à une, chacune va à 'son heure'. Victoire si toutes rangées avant que tous les Rois sortent.",
    "engine": "generic_distribution",
    "legacyKey": "clock_solitaire",
    "available": true
  },
  {
    "key": "big_ben",
    "family": "clock",
    "nameFr": "Big Ben",
    "nameEn": "Big Ben",
    "descriptionFr": "12 fondations en cadran + tableau de 8 piles × 3 cartes. Les fondations partent à 1h=2 de Pique, 2h=2 de Coeur, etc., et montent jusqu'à 13. 2 decks (104 cartes).",
    "engine": "generic_distribution",
    "legacyKey": "big_ben",
    "available": true
  },
  {
    "key": "grandfathers_clock",
    "family": "clock",
    "nameFr": "Grandfather's Clock",
    "nameEn": "Grandfather's Clock",
    "descriptionFr": "12 fondations en cadran d'horloge + tableau 8 piles × 4 cartes. Les fondations partent du 2 (1h) jusqu'à la Dame (12h). 1 deck.",
    "engine": "generic_distribution",
    "legacyKey": "grandfathers_clock",
    "available": true
  },
  {
    "key": "hickory_dickory_dock",
    "family": "clock",
    "nameFr": "Hickory Dickory Dock",
    "nameEn": "Hickory Dickory Dock",
    "descriptionFr": "Variante anglaise avec règles permissives. 12 piles cadran × 4 cartes + pile centrale + redistribution. 1 deck.",
    "engine": "generic_distribution",
    "legacyKey": "hickory_dickory_dock",
    "available": true
  },
  {
    "key": "travellers",
    "family": "clock",
    "nameFr": "Travellers (Voyageurs)",
    "nameEn": "Travellers",
    "descriptionFr": "Variante 'voyageurs' : 13 piles × 4 cartes. Mécanique similaire mais on peut 'voyager' entre les piles. 1 deck.",
    "engine": "generic_distribution",
    "legacyKey": "travellers",
    "available": true
  },
  {
    "key": "monte_carlo",
    "family": "pairs",
    "nameFr": "Monte Carlo",
    "nameEn": "Monte Carlo",
    "descriptionFr": "Grille 5×5 (25 cartes) + stock 27. Retirer les paires de MÊME RANG adjacentes (horizontalement, verticalement ou diagonalement). Quand des trous apparaissent, les cartes se rassemblent.",
    "engine": "generic_tableau",
    "legacyKey": "monte_carlo",
    "available": true
  },
  {
    "key": "nestor",
    "family": "pairs",
    "nameFr": "Nestor",
    "nameEn": "Nestor",
    "descriptionFr": "8 colonnes × 6 cartes (48) + 1 réserve de 4 cartes. Retirer les paires de MÊME RANG n'importe où (cartes accessibles uniquement).",
    "engine": "generic_tableau",
    "legacyKey": "nestor",
    "available": true
  },
  {
    "key": "tens",
    "family": "pairs",
    "nameFr": "Tens",
    "nameEn": "Tens",
    "descriptionFr": "Grille 5×4 (20 cartes) + stock 32. Retirer les paires totalisant 10 (As=1, sans figures). Les figures (J,Q,K) doivent être retirées par groupes de 4 (1 J + 1 Q + 1 K + ?). Plus difficile.",
    "engine": "generic_tableau",
    "legacyKey": "tens",
    "available": true
  },
  {
    "key": "pairs",
    "family": "pairs",
    "nameFr": "Pairs",
    "nameEn": "Pairs",
    "descriptionFr": "Variante simple : 13 paires de cartes face_up à retirer. Distribution 13 colonnes × 4 cartes (52). Retirer les paires de même rang.",
    "engine": "generic_tableau",
    "legacyKey": "pairs",
    "available": true
  },
  {
    "key": "decade",
    "family": "pairs",
    "nameFr": "Decade",
    "nameEn": "Decade",
    "descriptionFr": "Variante de Tens : retirer paires/triplets totalisant 10, 14 ou 24 (figures incluses : J=11, Q=12, K=13). Tableau 7 colonnes × 4 cartes (28) + stock 24.",
    "engine": "generic_tableau",
    "legacyKey": "decade",
    "available": true
  },
  {
    "key": "vertical",
    "family": "pairs",
    "nameFr": "Vertical",
    "nameEn": "Vertical",
    "descriptionFr": "Cartes alignées verticalement à apparier. 13 colonnes × 4 cartes (52). Paires de même rang verticalement adjacentes uniquement.",
    "engine": "generic_tableau",
    "legacyKey": "vertical",
    "available": true
  },
  {
    "key": "quinze",
    "family": "pairs",
    "nameFr": "Quinze",
    "nameEn": "Quinze",
    "descriptionFr": "Variante française : paires totalisant 15 (J=11, Q=12, K=13). Grille 5×5 + stock 27. Plus permissif que Tens.",
    "engine": "generic_tableau",
    "legacyKey": "quinze",
    "available": true
  },
  {
    "key": "aces_up",
    "family": "pairs",
    "nameFr": "Aces Up",
    "nameEn": "Aces Up",
    "descriptionFr": "4 colonnes × 1 carte au départ + stock 48. On distribue 4 cartes (une par colonne), si 2 cartes de même couleur visibles → retirer la plus basse. As reste au tableau, on gagne quand seuls les 4 As restent.",
    "engine": "generic_tableau",
    "legacyKey": "aces_up",
    "available": true
  },
  {
    "key": "idiots_delight",
    "family": "pairs",
    "nameFr": "Idiot's Delight",
    "nameEn": "Idiot's Delight",
    "descriptionFr": "Synonyme/variante d'Aces Up avec règles légèrement différentes. 4 col × 1 + stock 48. Idiot's Delight = on cherche à mettre les 4 As en évidence.",
    "engine": "generic_tableau",
    "legacyKey": "idiots_delight",
    "available": true
  },
  {
    "key": "aces_and_kings",
    "family": "pairs",
    "nameFr": "Aces and Kings",
    "nameEn": "Aces and Kings",
    "descriptionFr": "Retirer les paires As+Roi de même couleur. Grille 4 colonnes × 13 cartes (52). 4 fondations finales (As+Roi par couleur).",
    "engine": "generic_tableau",
    "legacyKey": "aces_and_kings",
    "available": true
  },
  {
    "key": "accordion_classic",
    "family": "accordion",
    "nameFr": "Accordéon (classique)",
    "nameEn": "Accordion (classic)",
    "descriptionFr": "Le classique français : 52 cartes alignées en ligne. On déplace une carte sur la 3e à sa gauche OU sur l'adjacente, si elles partagent la couleur OU le rang. Victoire : toutes les cartes en une seule pile.",
    "engine": "accordion",
    "legacyKey": "accordion_classic",
    "available": true
  },
  {
    "key": "methuselah",
    "family": "accordion",
    "nameFr": "Methuselah",
    "nameEn": "Methuselah",
    "descriptionFr": "Variante d'Accordéon avec règles assouplies : sauts ±1, ±3 ET ±5. Beaucoup plus jouable.",
    "engine": "accordion",
    "legacyKey": "methuselah",
    "available": true
  },
  {
    "key": "tower_of_hanoy",
    "family": "accordion",
    "nameFr": "Tower of Hanoy",
    "nameEn": "Tower of Hanoy",
    "descriptionFr": "Variante 'tour' : 3 piles cibles + cartes en ligne. On déplace les cartes vers les piles selon des règles inspirées de la Tour de Hanoï. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "tower_of_hanoy",
    "available": true
  },
  {
    "key": "royal_marriage",
    "family": "accordion",
    "nameFr": "Royal Marriage",
    "nameEn": "Royal Marriage",
    "descriptionFr": "Variante romantique : on retire les cartes pour faire se rejoindre le Roi de Coeur et la Dame de Coeur. Distribution : Dame de Coeur en bas du paquet, Roi de Coeur en haut. 50 cartes alignées entre eux.",
    "engine": "accordion",
    "legacyKey": "royal_marriage",
    "available": true
  },
  {
    "key": "idle_year",
    "family": "accordion",
    "nameFr": "Idle Year",
    "nameEn": "Idle Year",
    "descriptionFr": "Variante avec 13 'mois' (12 mois + 1 carte de pivot). Les cartes sont disposées par groupes de 4. Mécanique d'accordéon par mois.",
    "engine": "generic_tableau",
    "legacyKey": "idle_year",
    "available": true
  },
  {
    "key": "streets_and_alleys_acc",
    "family": "accordion",
    "nameFr": "Streets and Alleys (Accordéon)",
    "nameEn": "Streets and Alleys (Accordion)",
    "descriptionFr": "Variante hybride : 8 colonnes (Streets & Alleys classique) mais mouvements compressifs façon accordéon. Pas de fondations.",
    "engine": "generic_tableau",
    "legacyKey": "streets_and_alleys_acc",
    "available": true
  },
  {
    "key": "beleaguered_castle",
    "family": "castle",
    "nameFr": "Beleaguered Castle (Château assiégé)",
    "nameEn": "Beleaguered Castle",
    "descriptionFr": "Le classique : 4 As pré-placés en fondation centrale + 8 colonnes × 6 cartes (48). Empilement n'importe quelle couleur descendant. Pas de stock. Toutes face_up.",
    "engine": "generic_tableau",
    "legacyKey": "beleaguered_castle",
    "available": true
  },
  {
    "key": "citadel",
    "family": "castle",
    "nameFr": "Citadel",
    "nameEn": "Citadel",
    "descriptionFr": "Variante avec empilement couleurs ALTERNÉES descendant. 8 col × 6, As pré-placés. Plus difficile que le classique.",
    "engine": "generic_tableau",
    "legacyKey": "citadel",
    "available": true
  },
  {
    "key": "streets_and_alleys",
    "family": "castle",
    "nameFr": "Streets and Alleys",
    "nameEn": "Streets and Alleys",
    "descriptionFr": "Comme Beleaguered Castle MAIS sans As pré-placés. Les As sont dans les colonnes. 4 col × 7 + 4 col × 6 = 52. Plus difficile.",
    "engine": "generic_tableau",
    "legacyKey": "streets_and_alleys",
    "available": true
  },
  {
    "key": "castles_end",
    "family": "castle",
    "nameFr": "Castles End",
    "nameEn": "Castles End",
    "descriptionFr": "Variante 'inverse' : fondations descendantes (Roi → As). Rois pré-placés au centre, 8 col × 6. Empilement n'importe quelle couleur ascendant.",
    "engine": "generic_tableau",
    "legacyKey": "castles_end",
    "available": true
  },
  {
    "key": "stronghold",
    "family": "castle",
    "nameFr": "Stronghold",
    "nameEn": "Stronghold",
    "descriptionFr": "Empilement par MÊME COULEUR descendant (plus difficile). 8 col × 6, As pré-placés.",
    "engine": "generic_tableau",
    "legacyKey": "stronghold",
    "available": true
  },
  {
    "key": "fortress",
    "family": "castle",
    "nameFr": "Fortress",
    "nameEn": "Fortress",
    "descriptionFr": "Variante avec 10 colonnes : 4 col × 5 + 6 col × 5 = 50 + 2 cartes en réserve. As pré-placés. Empilement n'importe quelle couleur (asc OU desc).",
    "engine": "generic_tableau",
    "legacyKey": "fortress",
    "available": true
  },
  {
    "key": "chessboard",
    "family": "castle",
    "nameFr": "Chessboard",
    "nameEn": "Chessboard",
    "descriptionFr": "Disposition en damier 8×4 = 32 cartes + 5 réserves + 4 As pré-placés (= 41) + 11 cartes ajustement.",
    "engine": "generic_tableau",
    "legacyKey": "chessboard",
    "available": true
  },
  {
    "key": "bastion",
    "family": "castle",
    "nameFr": "Bastion",
    "nameEn": "Bastion",
    "descriptionFr": "8 col × 5 + 2 réserves + As pré-placés (8 As pour 2 decks). 2 decks (104 cartes). Alternance couleur descendant.",
    "engine": "generic_tableau",
    "legacyKey": "bastion",
    "available": true
  },
  {
    "key": "penelope",
    "family": "castle",
    "nameFr": "Penelope",
    "nameEn": "Penelope",
    "descriptionFr": "8 col × 6, As pré-placés. MULTI-CARTES autorisé (séquences déplaçables). Empilement même couleur descendant.",
    "engine": "generic_tableau",
    "legacyKey": "penelope",
    "available": true
  },
  {
    "key": "gypsy",
    "family": "gypsy",
    "nameFr": "Gypsy",
    "nameEn": "Gypsy",
    "descriptionFr": "Le classique. 2 decks (104 cartes). 8 colonnes × 3 cartes (24 visibles + 1 caché chacune = 32 cartes... ajusté à 8 col × 3 = 24). Stock de 80 cartes, distribution par volées de 8.",
    "engine": "generic_tableau",
    "legacyKey": "gypsy",
    "available": true
  },
  {
    "key": "easy_gypsy",
    "family": "gypsy",
    "nameFr": "Easy Gypsy",
    "nameEn": "Easy Gypsy",
    "descriptionFr": "Variante plus facile : toutes les cartes du tableau face_up dès le début. 8 col × 3 = 24, stock 80.",
    "engine": "generic_tableau",
    "legacyKey": "easy_gypsy",
    "available": true
  },
  {
    "key": "whitehead",
    "family": "gypsy",
    "nameFr": "Whitehead",
    "nameEn": "Whitehead",
    "descriptionFr": "Variante 1 deck. 7 col (1-2-3-4-5-6-7=28) toutes face_up, stock 24 cartes piochées 1 par 1. Empilement même couleur descendant.",
    "engine": "generic_tableau",
    "legacyKey": "whitehead",
    "available": true
  },
  {
    "key": "blockade",
    "family": "gypsy",
    "nameFr": "Blockade",
    "nameEn": "Blockade",
    "descriptionFr": "Variante stricte. 12 colonnes × 1 carte (12) + stock 92. 2 decks, 8 fondations. Stock distribué par volées de 12.",
    "engine": "generic_tableau",
    "legacyKey": "blockade",
    "available": true
  },
  {
    "key": "irmgard",
    "family": "gypsy",
    "nameFr": "Irmgard",
    "nameEn": "Irmgard",
    "descriptionFr": "9 col × variable + stock. 2 decks, 8 fondations. Empilement même couleur descendant.",
    "engine": "generic_tableau",
    "legacyKey": "irmgard",
    "available": true
  },
  {
    "key": "trusty_twelve",
    "family": "gypsy",
    "nameFr": "Trusty Twelve",
    "nameEn": "Trusty Twelve",
    "descriptionFr": "12 colonnes × 1 carte au départ. Stock 40. Pas de fondations classiques, on retire les paires. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "trusty_twelve",
    "available": true
  },
  {
    "key": "milligan",
    "family": "gypsy",
    "nameFr": "Milligan",
    "nameEn": "Milligan",
    "descriptionFr": "8 colonnes × 1 carte + stock 96. 2 decks, 8 fondations. Distribution par volées de 8, alternance couleur.",
    "engine": "generic_tableau",
    "legacyKey": "milligan",
    "available": true
  },
  {
    "key": "russian_patience",
    "family": "russian_bezique",
    "nameFr": "Russian Patience (Mat Russe)",
    "nameEn": "Russian Patience",
    "descriptionFr": "Le classique russe. 7 col distribution Yukon (1-6-7-8-9-10-11) MAIS empilement par MÊME COULEUR. Pas de stock. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "russian_patience",
    "available": true
  },
  {
    "key": "crapette",
    "family": "russian_bezique",
    "nameFr": "Crapette (Russian Bank)",
    "nameEn": "Crapette (Russian Bank)",
    "descriptionFr": "Solitaire russe avec 2 decks. 4 col × 1 + 13 réserves + stock + 8 fondations. Mécanique compétitive (peut se jouer à 2). Empilement couleurs alternées.",
    "engine": "generic_tableau",
    "legacyKey": "crapette",
    "available": true
  },
  {
    "key": "bezique_solitaire",
    "family": "russian_bezique",
    "nameFr": "Bezique Solitaire",
    "nameEn": "Bezique Solitaire",
    "descriptionFr": "Solitaire inspiré du jeu Bezique. 2 decks (avec retrait des 2-6, donc 64 cartes effectives). 8 col × 4 = 32 + stock 32. Alternance couleur.",
    "engine": "generic_tableau",
    "legacyKey": "bezique_solitaire",
    "available": true
  },
  {
    "key": "boudoir",
    "family": "russian_bezique",
    "nameFr": "Boudoir",
    "nameEn": "Boudoir",
    "descriptionFr": "Solitaire de salon. 4 col × 13 cartes (52). Pas de stock. Empilement même couleur. 1 deck. Sans fondations classiques (on cherche à dégarnir).",
    "engine": "generic_tableau",
    "legacyKey": "boudoir",
    "available": true
  },
  {
    "key": "king_albert",
    "family": "royal_coronation",
    "nameFr": "King Albert",
    "nameEn": "King Albert",
    "descriptionFr": "9 colonnes (1+2+3+4+5+6+7+8+9 = 45) + 7 réserves face_up + 4 fondations. Pas de stock. Empilement couleurs alternées. Toutes face_up.",
    "engine": "generic_tableau",
    "legacyKey": "king_albert",
    "available": true
  },
  {
    "key": "raglan",
    "family": "royal_coronation",
    "nameFr": "Raglan",
    "nameEn": "Raglan",
    "descriptionFr": "Comme King Albert mais avec As pré-placés. 9 col + 6 réserves. Plus facile.",
    "engine": "generic_tableau",
    "legacyKey": "raglan",
    "available": true
  },
  {
    "key": "brigade",
    "family": "royal_coronation",
    "nameFr": "Brigade",
    "nameEn": "Brigade",
    "descriptionFr": "8 col × 5 cartes = 40 + 8 réserves + 4 fondations. As pré-placés. Empilement par n'importe quelle couleur (asc/desc).",
    "engine": "generic_tableau",
    "legacyKey": "brigade",
    "available": true
  },
  {
    "key": "belvedere",
    "family": "royal_coronation",
    "nameFr": "Belvedere",
    "nameEn": "Belvedere",
    "descriptionFr": "8 colonnes × 6 cartes = 48 + 4 réserves. As pré-placés. 2 decks. Plus simple que Forty Thieves.",
    "engine": "generic_tableau",
    "legacyKey": "belvedere",
    "available": true
  },
  {
    "key": "salic_law",
    "family": "royal_coronation",
    "nameFr": "Salic Law",
    "nameEn": "Salic Law",
    "descriptionFr": "Solitaire historique français. 8 colonnes mixtes + stock + Rois pré-placés en fondation. 2 decks (104).",
    "engine": "generic_tableau",
    "legacyKey": "salic_law",
    "available": true
  },
  {
    "key": "glencoe",
    "family": "royal_coronation",
    "nameFr": "Glencoe",
    "nameEn": "Glencoe",
    "descriptionFr": "Variante écossaise. 4 col × 6 cartes (24) + stock 24 + 4 fondations. 1 deck. Empilement alternance couleur.",
    "engine": "generic_tableau",
    "legacyKey": "glencoe",
    "available": true
  },
  {
    "key": "british_square",
    "family": "royal_coronation",
    "nameFr": "British Square",
    "nameEn": "British Square",
    "descriptionFr": "Disposition en carré. 4 col × 4 (16) + 4 fondations en croix + stock 32. Plutôt difficile. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "british_square",
    "available": true
  },
  {
    "key": "royal_cotillion",
    "family": "royal_coronation",
    "nameFr": "Royal Cotillion",
    "nameEn": "Royal Cotillion",
    "descriptionFr": "Solitaire de cour. 2 decks. 4 col × 4 (16) + 12 réserves + 8 fondations. Empilement même couleur, monte par 2 (ex: A,3,5,7...).",
    "engine": "generic_tableau",
    "legacyKey": "royal_cotillion",
    "available": true
  },
  {
    "key": "calculation",
    "family": "numeric_math",
    "nameFr": "Calculation",
    "nameEn": "Calculation",
    "descriptionFr": "Le classique 'mathématique'. 4 fondations partent de A, 2, 3, 4 et montent par +1, +2, +3, +4 (avec wraparound K→A). 4 réserves + stock 48.",
    "engine": "generic_tableau",
    "legacyKey": "calculation",
    "available": true
  },
  {
    "key": "betsy_ross",
    "family": "numeric_math",
    "nameFr": "Betsy Ross",
    "nameEn": "Betsy Ross",
    "descriptionFr": "Inspiré de Calculation. 4 fondations partent de A, 2, 3, 4 et montent par +1, +2, +3, +4. 4 'guides' (As, 2, 3, 4) + 4 réserves.",
    "engine": "generic_tableau",
    "legacyKey": "betsy_ross",
    "available": true
  },
  {
    "key": "auld_lang_syne",
    "family": "numeric_math",
    "nameFr": "Auld Lang Syne",
    "nameEn": "Auld Lang Syne",
    "descriptionFr": "4 As pré-placés en fondation + 4 piles × 1 + stock 44. Très simple. Pas de règle d'empilement strict, on monte juste les fondations.",
    "engine": "generic_tableau",
    "legacyKey": "auld_lang_syne",
    "available": true
  },
  {
    "key": "sir_tommy",
    "family": "numeric_math",
    "nameFr": "Sir Tommy",
    "nameEn": "Sir Tommy",
    "descriptionFr": "L'ancêtre de plusieurs solitaires. 4 piles libres pour ranger + stock 52. 4 fondations As→K. Pas d'empilement contraint sur le tableau.",
    "engine": "generic_tableau",
    "legacyKey": "sir_tommy",
    "available": true
  },
  {
    "key": "strategy",
    "family": "numeric_math",
    "nameFr": "Strategy",
    "nameEn": "Strategy",
    "descriptionFr": "Comme Sir Tommy mais 8 piles libres (au lieu de 4). On range stratégiquement les cartes dans les 8 piles, puis on monte les fondations à la fin. As pré-placés.",
    "engine": "generic_tableau",
    "legacyKey": "strategy",
    "available": true
  },
  {
    "key": "lady_betty",
    "family": "numeric_math",
    "nameFr": "Lady Betty",
    "nameEn": "Lady Betty",
    "descriptionFr": "8 piles × 4 + 4 fondations. 1 deck. Empilement même couleur descendant (variante de Strategy avec tableau structuré).",
    "engine": "generic_tableau",
    "legacyKey": "lady_betty",
    "available": true
  },
  {
    "key": "quadrille",
    "family": "numeric_math",
    "nameFr": "Quadrille",
    "nameEn": "Quadrille",
    "descriptionFr": "Disposition en croix. 4 fondations 'rouges' (montent A,3,5,7,9,J,K) + 4 fondations 'noires' (montent 2,4,6,8,10,Q). 8 piles autour. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "quadrille",
    "available": true
  },
  {
    "key": "above_and_below",
    "family": "numeric_math",
    "nameFr": "Above and Below",
    "nameEn": "Above and Below",
    "descriptionFr": "8 fondations (4 montantes A→K, 4 descendantes K→A) en deux rangées. 8 col × 5 cartes (40). 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "above_and_below",
    "available": true
  },
  {
    "key": "mahjong_cards",
    "family": "mahjong_cards",
    "nameFr": "Mahjong Solitaire (cartes)",
    "nameEn": "Mahjong Solitaire (cards)",
    "descriptionFr": "Adaptation du Mahjong avec des cartes. 2 decks (104 cartes) disposées en pyramide multi-niveaux. On retire les paires de MÊME RANG. Une carte est jouable seulement si elle est libre (aucune autre dessus, et accessible par un côté).",
    "engine": "generic_tableau",
    "legacyKey": "mahjong_cards",
    "available": true
  },
  {
    "key": "pegged",
    "family": "mahjong_cards",
    "nameFr": "Pegged",
    "nameEn": "Pegged",
    "descriptionFr": "Variante 'cribbage-style' : 13 piles × 4 cartes (52). On retire les paires totalisant 15. Pas de stock. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "pegged",
    "available": true
  },
  {
    "key": "crystal_cluster",
    "family": "mahjong_cards",
    "nameFr": "Crystal Cluster",
    "nameEn": "Crystal Cluster",
    "descriptionFr": "Disposition en grappes (clusters). 8 colonnes × 6 cartes (48) + 4 cartes de cluster central. Retirer les paires de même rang. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "crystal_cluster",
    "available": true
  },
  {
    "key": "spite_and_malice",
    "family": "multiplayer",
    "nameFr": "Spite and Malice",
    "nameEn": "Spite and Malice",
    "descriptionFr": "Solitaire compétitif 2 joueurs. Chaque joueur a une pile 'pay-off' de 26 cartes + 5 cartes en main + 4 piles 'side' libres. Centre : 4 fondations partant de l'As, qui montent jusqu'au Roi (cyclique).",
    "engine": "generic_tableau",
    "legacyKey": "spite_and_malice",
    "available": true
  },
  {
    "key": "crapette_2p",
    "family": "multiplayer",
    "nameFr": "Crapette (2 joueurs)",
    "nameEn": "Crapette (2 players)",
    "descriptionFr": "Variante compétitive de Crapette pour 2 joueurs. Chaque joueur a 4 colonnes + réserve + son stock. 8 fondations centrales partagées. 2 decks.",
    "engine": "generic_tableau",
    "legacyKey": "crapette_2p",
    "available": true
  },
  {
    "key": "nerts",
    "family": "multiplayer",
    "nameFr": "Nerts (Pounce)",
    "nameEn": "Nerts (Pounce)",
    "descriptionFr": "Solitaire frénétique multi-joueurs. Chaque joueur : 4 colonnes × 1 + pile Nert (13 cartes) + main. Course aux fondations centrales partagées. 1 deck par joueur.",
    "engine": "generic_tableau",
    "legacyKey": "nerts",
    "available": true
  },
  {
    "key": "racing_demon",
    "family": "multiplayer",
    "nameFr": "Racing Demon",
    "nameEn": "Racing Demon",
    "descriptionFr": "Variante britannique de Nerts. Chaque joueur a 4 colonnes × 1 + 13 cartes 'demon' + stock. Course pour vider la pile demon. 1 deck par joueur.",
    "engine": "generic_tableau",
    "legacyKey": "racing_demon",
    "available": true
  },
  {
    "key": "double_solitaire",
    "family": "multiplayer",
    "nameFr": "Double Solitaire",
    "nameEn": "Double Solitaire",
    "descriptionFr": "Klondike compétitif à 2 joueurs. Chaque joueur a sa donne Klondike (1 deck), mais peut jouer sur les fondations de l'adversaire. Ici on génère 1 donne Klondike standard.",
    "engine": "generic_tableau",
    "legacyKey": "double_solitaire",
    "available": true
  },
  {
    "key": "freecell_two_decks",
    "family": "modern_hybrid",
    "nameFr": "FreeCell Two Decks",
    "nameEn": "FreeCell Two Decks",
    "descriptionFr": "Version 2 decks de FreeCell. 10 colonnes (4×11 + 6×10 = 104), 6 cellules libres, 8 fondations.",
    "engine": "generic_tableau",
    "legacyKey": "freecell_two_decks",
    "available": true
  },
  {
    "key": "bakers_dozen",
    "family": "modern_hybrid",
    "nameFr": "Baker's Dozen",
    "nameEn": "Baker's Dozen",
    "descriptionFr": "13 colonnes × 4 cartes (52) toutes face_up. Pas de stock. Empilement par n'importe quelle couleur descendant. Les Rois sont déplacés au fond de leur colonne au départ.",
    "engine": "generic_tableau",
    "legacyKey": "bakers_dozen",
    "available": true
  },
  {
    "key": "curds_and_whey",
    "family": "modern_hybrid",
    "nameFr": "Curds and Whey",
    "nameEn": "Curds and Whey",
    "descriptionFr": "13 colonnes × 4 cartes (52) toutes face_up. Empilement même couleur descendant. Pas de stock. Pas de fondations classiques (les suites complètes sont retirées).",
    "engine": "generic_tableau",
    "legacyKey": "curds_and_whey",
    "available": true
  },
  {
    "key": "scuffle",
    "family": "modern_hybrid",
    "nameFr": "Scuffle",
    "nameEn": "Scuffle",
    "descriptionFr": "Variante hybride : 8 colonnes × 4 cartes (32) + stock 20. Empilement bidirectionnel. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "scuffle",
    "available": true
  },
  {
    "key": "la_cigale",
    "family": "modern_hybrid",
    "nameFr": "La Cigale",
    "nameEn": "La Cigale",
    "descriptionFr": "Solitaire français moderne. 8 col × 5 (40) + stock 12 + 4 fondations. Empilement même couleur. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "la_cigale",
    "available": true
  },
  {
    "key": "la_fourmi",
    "family": "modern_hybrid",
    "nameFr": "La Fourmi",
    "nameEn": "La Fourmi",
    "descriptionFr": "Pendant de La Cigale. 6 col × 6 (36) + stock 16 + 4 fondations. Couleurs alternées descendant. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "la_fourmi",
    "available": true
  },
  {
    "key": "maze",
    "family": "modern_hybrid",
    "nameFr": "Maze",
    "nameEn": "Maze",
    "descriptionFr": "Solitaire 'labyrinthe'. 52 cartes disposées en grille 9 colonnes × 6 lignes (2 emplacements vides au départ pour permettre le glissement). On déplace les cartes pour former une suite continue As→Roi 4 fois.",
    "engine": "generic_tableau",
    "legacyKey": "maze",
    "available": true
  },
  {
    "key": "carlton",
    "family": "modern_hybrid",
    "nameFr": "Carlton",
    "nameEn": "Carlton",
    "descriptionFr": "9 colonnes × 1 carte au départ + stock 43. Distribution Klondike-like par volées de 9. Empilement couleurs alternées. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "carlton",
    "available": true
  },
  {
    "key": "display",
    "family": "modern_hybrid",
    "nameFr": "Display",
    "nameEn": "Display",
    "descriptionFr": "Solitaire 'présentation'. 8 col × 5 (40) toutes face_up + stock 12. Empilement même couleur. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "display",
    "available": true
  },
  {
    "key": "step_by_step",
    "family": "modern_hybrid",
    "nameFr": "Step by Step",
    "nameEn": "Step by Step",
    "descriptionFr": "Variante méthodique : 7 colonnes pour ranger pas à pas. 7×4 (28) + stock 24 + 4 fondations. Empilement bidirectionnel.",
    "engine": "generic_tableau",
    "legacyKey": "step_by_step",
    "available": true
  },
  {
    "key": "strategy_modern",
    "family": "modern_hybrid",
    "nameFr": "Strategy (moderne)",
    "nameEn": "Strategy (modern)",
    "descriptionFr": "Variante moderne de Strategy. 8 piles libres + stock 52 + 4 fondations (As pré-placés). Empilement libre dans les piles.",
    "engine": "generic_tableau",
    "legacyKey": "strategy_modern",
    "available": true
  },
  {
    "key": "patience_carree",
    "family": "french_traditional",
    "nameFr": "Patience Réussite Carrée",
    "nameEn": "Square Patience",
    "descriptionFr": "Disposition en carré 4×4 (16 cartes) au centre + stock 36 + 4 fondations en angle. Empilement même couleur. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "patience_carree",
    "available": true
  },
  {
    "key": "quatre_coins",
    "family": "french_traditional",
    "nameFr": "Patience des Quatre Coins",
    "nameEn": "Four Corners Patience",
    "descriptionFr": "4 fondations aux 4 coins + 4 colonnes × 6 (24) + stock 28. As pré-placés aux coins. Empilement par n'importe quelle couleur. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "quatre_coins",
    "available": true
  },
  {
    "key": "glouton",
    "family": "french_traditional",
    "nameFr": "Glouton",
    "nameEn": "Glutton",
    "descriptionFr": "Solitaire 'glouton'. 13 colonnes × 1 carte (13) + stock 39 + 4 fondations. Empilement libre. Très permissif. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "glouton",
    "available": true
  },
  {
    "key": "drapeaux",
    "family": "french_traditional",
    "nameFr": "La Réussite des Drapeaux",
    "nameEn": "Flags Patience",
    "descriptionFr": "Disposition en 'drapeaux' : 4 'mâts' (colonnes) × 5 cartes + 4 'flammes' (réserves) × 4 cartes + stock 16. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "drapeaux",
    "available": true
  },
  {
    "key": "tapis_vert",
    "family": "french_traditional",
    "nameFr": "Le Tapis Vert",
    "nameEn": "The Green Carpet",
    "descriptionFr": "Solitaire de salon. 8 col × 4 (32) + stock 20 + 4 fondations. Empilement même couleur. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "tapis_vert",
    "available": true
  },
  {
    "key": "belle_lucie_fr",
    "family": "french_traditional",
    "nameFr": "La Belle Lucie (française)",
    "nameEn": "La Belle Lucie (French)",
    "descriptionFr": "Variante française stricte. 17 fans × 3 (51) + 1 single. Empilement même couleur, 2 redistributions. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "belle_lucie_fr",
    "available": true
  },
  {
    "key": "les_huit",
    "family": "french_traditional",
    "nameFr": "Les Huit",
    "nameEn": "The Eights",
    "descriptionFr": "8 colonnes × 6 (48) + stock 4 + 4 fondations. Les 8 sont retirés en début de partie. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "les_huit",
    "available": true
  },
  {
    "key": "le_cadran",
    "family": "french_traditional",
    "nameFr": "Le Cadran",
    "nameEn": "The Dial",
    "descriptionFr": "Variante française de l'Horloge. 12 piles disposées en cadran + 1 centre. 13 piles × 4 cartes (52). Mécanique horloge.",
    "engine": "generic_tableau",
    "legacyKey": "le_cadran",
    "available": true
  },
  {
    "key": "la_tour",
    "family": "french_traditional",
    "nameFr": "La Tour",
    "nameEn": "The Tower",
    "descriptionFr": "Solitaire 'tour'. 7 colonnes × 6 cartes (42) en pyramide inversée + stock 10 + 4 fondations. Empilement même couleur. 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "la_tour",
    "available": true
  },
  {
    "key": "la_pendule",
    "family": "french_traditional",
    "nameFr": "La Pendule",
    "nameEn": "The Pendulum",
    "descriptionFr": "Variante balance. 6 colonnes × 4 (24) + stock 28 + 4 fondations. Empilement bidirectionnel (asc/desc selon balance). 1 deck.",
    "engine": "generic_tableau",
    "legacyKey": "la_pendule",
    "available": true
  }
];

export function variantsByFamily(familyId: string): CatalogVariant[] {
  return FULL_VARIANTS.filter((v) => v.family === familyId);
}

export function findCatalogVariant(key: string): CatalogVariant | undefined {
  return FULL_VARIANTS.find((v) => v.key === key);
}

export const CATALOG_STATS = {
  totalFamilies: FULL_FAMILIES.length,
  totalVariants: FULL_VARIANTS.length,
  playable: FULL_VARIANTS.filter((v) => v.available).length,
  comingSoon: FULL_VARIANTS.filter((v) => !v.available).length,
};
