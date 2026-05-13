/**
 * @file variants.ts — Catalog of all Solitaire variants implemented in this app.
 * Each entry has metadata + the on-screen rules text shown to the player.
 */

export type VariantKey =
  | 'klondike-1' | 'klondike-3' | 'klondike-vegas'
  | 'spider-1' | 'spider-2' | 'spider-4'
  | 'freecell'
  | 'pyramid' | 'tripeaks' | 'yukon' | 'golf' | 'forty-thieves' | 'accordion';

export interface Variant {
  key: VariantKey;
  /** Underlying engine: which file does the game screen instantiate. */
  engine: 'klondike' | 'spider' | 'freecell'
        | 'yukon' | 'golf' | 'pyramid' | 'tripeaks' | 'fortythieves' | 'accordion'
        | 'unsupported';
  emoji: string;
  name: string;
  shortDesc: string;
  difficulty: 1 | 2 | 3 | 4 | 5;       // ⭐ 1..5
  winRate: string;                       // human-readable win rate
  duration: string;                      // typical play time
  cards: number;                         // 52 or 104
  /** Step-by-step rules shown in the rules screen. */
  rules: { title: string; body: string }[];
  /** True when implemented (others surface as "Bientôt disponible"). */
  available: boolean;
  /** Engine-specific options (e.g. spider suitMode). */
  options?: { drawCount?: 1 | 3; vegas?: boolean; suitMode?: 1 | 2 | 4 };
}

export const VARIANTS: Variant[] = [
  // ─────────────────── Klondike ───────────────────
  {
    key: 'klondike-1', engine: 'klondike',
    emoji: '🃏', name: 'Klondike (Pioche 1)',
    shortDesc: 'Le solitaire classique — pioche 1 carte à la fois.',
    difficulty: 2, winRate: '~82%', duration: '5-10 min', cards: 52,
    available: true, options: { drawCount: 1 },
    rules: [
      { title: 'Objectif', body: 'Placer les 52 cartes sur les 4 fondations, organisées par couleur, dans l\'ordre As → Roi.' },
      { title: 'Mise en place', body: '7 colonnes au tableau (1, 2, 3, 4, 5, 6, 7 cartes). Seule la dernière carte de chaque colonne est face visible. Les 24 cartes restantes forment la pioche.' },
      { title: 'Sur le tableau', body: 'Suite descendante (Roi → As) avec couleurs alternées : rouge sur noir, noir sur rouge. Exemple : 9♥ sur 10♠.' },
      { title: 'Sur les fondations', body: 'Suite ascendante As → Roi de la même couleur (♠ avec ♠, etc.).' },
      { title: 'Colonne vide', body: 'Seul un Roi peut occuper une colonne vide.' },
      { title: 'Déplacer une suite', body: 'Tu peux déplacer une suite entière de cartes face visible si elle respecte la règle (descendante + couleurs alternées).' },
      { title: 'Pioche', body: 'Tap sur la pioche → 1 carte vers la défausse. Quand la pioche est vide, elle se reforme à partir de la défausse (illimité).' },
      { title: 'Victoire', body: 'Les 4 fondations complètes (52 cartes placées).' },
    ],
  },
  {
    key: 'klondike-3', engine: 'klondike',
    emoji: '🎴', name: 'Klondike (Pioche 3)',
    shortDesc: 'Variante plus difficile — pioche 3 cartes mais seule la 3ème est jouable.',
    difficulty: 3, winRate: '~10-15%', duration: '8-15 min', cards: 52,
    available: true, options: { drawCount: 3 },
    rules: [
      { title: 'Objectif', body: 'Comme Klondike Pioche 1 — placer les 52 cartes sur les 4 fondations.' },
      { title: 'Différence', body: 'Tap sur la pioche → 3 cartes révélées d\'un coup. Seule la 3ème est immédiatement jouable.' },
      { title: 'Stratégie', body: 'Anticipe quels triplets vont apparaître. Plus difficile que Pioche 1 car 1/3 des cartes seulement est accessible directement.' },
      { title: 'Re-pioche', body: 'Illimitée (variante Standard).' },
    ],
  },
  {
    key: 'klondike-vegas', engine: 'klondike',
    emoji: '💰', name: 'Klondike Vegas',
    shortDesc: 'Mise initiale 52$. +5$ par carte sur fondations. 3 passes max.',
    difficulty: 4, winRate: '~10%', duration: '10-15 min', cards: 52,
    available: true, options: { drawCount: 3, vegas: true },
    rules: [
      { title: 'Mise initiale', body: '52 $ misés au démarrage (1 $ par carte).' },
      { title: 'Score', body: '+5 $ par carte placée sur les fondations. Objectif : finir avec plus de 52 $ pour gagner.' },
      { title: 'Pioche', body: '3 cartes par pioche. Maximum 3 passes — après ça, tu ne peux plus piocher.' },
      { title: 'Cible', body: 'Place au moins 11 cartes sur les fondations pour ne pas perdre d\'argent.' },
    ],
  },

  // ─────────────────── Spider ───────────────────
  {
    key: 'spider-1', engine: 'spider',
    emoji: '🕷', name: 'Spider 1 couleur',
    shortDesc: 'Variante facile — 104 cartes mais une seule couleur (♠).',
    difficulty: 2, winRate: '~90%', duration: '10-15 min', cards: 104,
    available: true, options: { suitMode: 1 },
    rules: [
      { title: 'Objectif', body: 'Construire 8 suites complètes Roi → As (de la même couleur). Chaque suite formée est automatiquement retirée.' },
      { title: 'Mise en place', body: '10 colonnes au tableau (4 colonnes de 6 cartes, 6 colonnes de 5 cartes). Seule la dernière carte de chaque colonne est visible. 50 cartes restantes en pioche (5 paquets de 10).' },
      { title: 'Tableau', body: 'Suite descendante (Roi → As). N\'importe quelle couleur peut suivre, MAIS tu ne peux déplacer une suite que si elle est de la même couleur (single-suit run).' },
      { title: 'Pioche', body: 'Tap sur la pioche → distribue 1 carte sur chacune des 10 colonnes. Tu ne peux PAS piocher s\'il y a une colonne vide.' },
      { title: 'Victoire', body: '8 suites Roi → As retirées du tableau.' },
    ],
  },
  {
    key: 'spider-2', engine: 'spider',
    emoji: '🕸', name: 'Spider 2 couleurs',
    shortDesc: 'Difficulté moyenne — 2 couleurs (♠ + ♥).',
    difficulty: 3, winRate: '~50%', duration: '15-20 min', cards: 104,
    available: true, options: { suitMode: 2 },
    rules: [
      { title: 'Mise en place', body: 'Comme Spider 1 couleur, mais avec ♠ ET ♥.' },
      { title: 'Difficulté ajoutée', body: 'Les couleurs alternent à l\'aveuglette. Plus difficile de former des suites pures pour les déplacer.' },
    ],
  },
  {
    key: 'spider-4', engine: 'spider',
    emoji: '🕷‍🕸', name: 'Spider 4 couleurs',
    shortDesc: 'La version la plus difficile — toutes les 4 couleurs.',
    difficulty: 5, winRate: '~30%', duration: '20-30 min', cards: 104,
    available: true, options: { suitMode: 4 },
    rules: [
      { title: 'Mise en place', body: '2 jeux complets de 52 cartes (♠ ♥ ♦ ♣ × 2).' },
      { title: 'Le défi', body: 'Tu dois isoler chaque couleur pour pouvoir les déplacer en bloc. Réservé aux experts.' },
    ],
  },

  // ─────────────────── FreeCell ───────────────────
  {
    key: 'freecell', engine: 'freecell',
    emoji: '🧠', name: 'FreeCell',
    shortDesc: '99,999% des donnes sont solvables — pure réflexion.',
    difficulty: 3, winRate: '~99,999%', duration: '5-10 min', cards: 52,
    available: true,
    rules: [
      { title: 'Objectif', body: 'Placer les 52 cartes sur les 4 fondations (As → Roi par couleur).' },
      { title: 'Mise en place', body: '8 colonnes (4 de 7 cartes, 4 de 6 cartes). Toutes les cartes sont face visible dès le début. 4 cellules libres + 4 fondations vides.' },
      { title: 'Cellules libres', body: 'Chacune peut contenir 1 seule carte (n\'importe laquelle), comme un parking temporaire.' },
      { title: 'Tableau', body: 'Descendant + couleurs alternées (rouge sur noir, noir sur rouge). Une colonne vide accepte n\'importe quelle carte.' },
      { title: 'Déplacements multiples', body: 'Officiellement 1 carte à la fois. En pratique, tu peux déplacer (cellules libres + 1) × 2^(colonnes vides) cartes en un coup.' },
      { title: 'Stratégie', body: 'Garde toujours au moins 1 cellule libre et 1 colonne vide en réserve. Identifie les As et 2 enfouis sous des cartes hautes.' },
    ],
  },

  // ─────────────── Yukon / Golf / Pyramid / TriPeaks / Forty Thieves / Accordion ───────────────
  {
    key: 'pyramid', engine: 'pyramid', emoji: '🔺', name: 'Pyramide',
    shortDesc: 'Supprimer les paires dont la somme = 13.',
    difficulty: 4, winRate: '~5%', duration: '3-5 min', cards: 52,
    available: true,
    rules: [
      { title: 'Objectif', body: 'Vider toute la pyramide (28 cartes) en supprimant des paires de cartes dont la somme = 13.' },
      { title: 'Mise en place', body: '7 rangées en pyramide (1, 2, 3, 4, 5, 6, 7 cartes). Une carte n\'est utilisable que si elle n\'a aucune carte qui la chevauche en dessous.' },
      { title: 'Valeurs', body: 'As = 1, 2-10 = valeur faciale, Valet = 11, Dame = 12, Roi = 13.' },
      { title: 'Paires valides', body: 'A + Q (1+12), 2 + J (2+11), 3 + 10, 4 + 9, 5 + 8, 6 + 7. Le Roi = 13 se retire seul.' },
      { title: 'Pioche', body: 'Tap sur la pioche pour révéler une carte sur la défausse. Tu peux apparier une carte de la pyramide avec la défausse.' },
      { title: 'Victoire', body: 'Toute la pyramide retirée. Plus tu enlèves de cartes, plus le score est élevé.' },
    ],
  },
  {
    key: 'tripeaks', engine: 'tripeaks', emoji: '⛰️', name: 'TriPeaks',
    shortDesc: '3 sommets — enchaîner les cartes ±1.',
    difficulty: 3, winRate: '~50%', duration: '3-5 min', cards: 52,
    available: true,
    rules: [
      { title: 'Objectif', body: 'Vider les 3 sommets — soit 28 cartes du tableau.' },
      { title: 'Mise en place', body: '3 pics qui se partagent une rangée du bas. Seule la rangée du bas est face visible au début.' },
      { title: 'Règle', body: 'Tu peux retirer une carte face visible si sa valeur est ±1 par rapport à la carte de défausse. La couleur n\'a pas d\'importance.' },
      { title: 'Circulaire', body: 'As ↔ Roi : un As peut suivre un Roi et inversement.' },
      { title: 'Combos', body: 'À chaque carte enchaînée sans piocher, le score double : 1, 2, 4, 8, 16, 32 points… Tap sur la pioche réinitialise le combo.' },
      { title: 'Pioche', body: 'Pas de re-pioche : 23 cartes maximum dans la pioche.' },
    ],
  },
  {
    key: 'yukon', engine: 'yukon', emoji: '🏔', name: 'Yukon',
    shortDesc: 'Klondike sans pioche — toutes cartes au tableau.',
    difficulty: 3, winRate: '~80%', duration: '10-15 min', cards: 52,
    available: true,
    rules: [
      { title: 'Mise en place', body: '7 colonnes : 1 carte / 6 / 7 / 8 / 9 / 10 / 11. Pas de pioche, toutes les 52 cartes sont distribuées sur le tableau.' },
      { title: 'Tableau', body: 'Suite descendante avec couleurs alternées (rouge sur noir, noir sur rouge).' },
      { title: 'Flexibilité unique', body: 'Tu peux déplacer N\'IMPORTE QUELLE carte face visible avec TOUTES les cartes en dessous, même si elles ne forment pas une suite valide.' },
      { title: 'Colonne vide', body: 'Seul un Roi (avec ce qui le suit) peut occuper une colonne vide.' },
      { title: 'Fondations', body: 'A → K par couleur (♠ ♥ ♦ ♣).' },
      { title: 'Victoire', body: 'Les 4 fondations complètes (52 cartes).' },
    ],
  },
  {
    key: 'golf', engine: 'golf', emoji: '⛳', name: 'Golf',
    shortDesc: 'Score = nombre de cartes restantes (objectif : 0).',
    difficulty: 2, winRate: '~10%', duration: '2-4 min', cards: 52,
    available: true,
    rules: [
      { title: 'Objectif', body: 'Vider le tableau. Comme au golf, le score est le nombre de cartes restantes : MINIMUM = mieux.' },
      { title: 'Mise en place', body: '7 colonnes de 5 cartes face visible (35 cartes). 17 cartes en pioche, 1 carte sur la défausse.' },
      { title: 'Règle', body: 'Place sur la défausse une carte du sommet d\'une colonne si sa valeur est ±1 par rapport à la carte de défausse. Couleur indifférente.' },
      { title: 'Roi terminal', body: 'Le Roi (13) est terminal : aucune carte ne peut s\'enchaîner après. Tu dois piocher.' },
      { title: 'Pioche', body: 'Tap sur la pioche → 1 carte sur la défausse. Pas de re-pioche.' },
      { title: 'Victoire', body: 'Tableau entièrement vidé.' },
    ],
  },
  {
    key: 'forty-thieves', engine: 'fortythieves', emoji: '🗡', name: 'Forty Thieves',
    shortDesc: 'Très difficile — 2 jeux, 1 carte à la fois.',
    difficulty: 5, winRate: '~10%', duration: '15-25 min', cards: 104,
    available: true,
    rules: [
      { title: 'Mise en place', body: '2 jeux complets. 10 colonnes de 4 cartes (toutes visibles). 64 cartes en pioche. 8 fondations vides.' },
      { title: 'Tableau', body: 'Suite descendante MÊME COULEUR (♠ sur ♠, ♥ sur ♥). PAS d\'alternance.' },
      { title: '1 carte à la fois', body: 'Tu ne peux déplacer qu\'UNE seule carte à la fois (la dernière de la colonne ou de la défausse).' },
      { title: 'Colonne vide', body: 'N\'importe quelle carte peut occuper une colonne vide.' },
      { title: 'Pioche', body: 'Tap sur la pioche → 1 carte sur la défausse. Pas de re-pioche.' },
      { title: 'Fondations', body: '8 fondations (2 par couleur). A → K par couleur. Victoire = toutes complètes (104 cartes).' },
    ],
  },
  {
    key: 'accordion', engine: 'accordion', emoji: '🪗', name: 'Accordéon',
    shortDesc: 'Réduire 52 cartes en 1 seule pile.',
    difficulty: 5, winRate: '~0,3%', duration: '5-10 min', cards: 52,
    available: true,
    rules: [
      { title: 'Mise en place', body: '52 cartes posées en ligne, toutes face visible.' },
      { title: 'Règle', body: 'Pose une carte sur sa voisine immédiate (à 1 case à gauche) ou sur la 3ème à gauche, si MÊME VALEUR OU MÊME COULEUR.' },
      { title: 'Empilement', body: 'La carte déplacée vient sur le dessus de la pile cible. Les cartes à droite glissent pour combler l\'espace.' },
      { title: 'Stratégie', body: 'Ne te précipite pas : un mauvais empilement bloque définitivement la partie. Pense plusieurs coups en avance.' },
      { title: 'Victoire', body: 'Réduire les 52 cartes en UNE SEULE pile. Très rare (~0,3% des donnes), c\'est un défi de patience.' },
    ],
  },
];

export const AVAILABLE_VARIANTS = VARIANTS.filter((v) => v.available);
export const UNSUPPORTED_VARIANTS = VARIANTS.filter((v) => !v.available);
export function findVariant(key: string): Variant | undefined {
  return VARIANTS.find((v) => v.key === key);
}
