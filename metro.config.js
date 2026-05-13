/**
 * @file metro.config.js (standalone deploy repo)
 * @description Version SIMPLIFIÉE pour le repo standalone sally-solitaire.
 *
 * Le monorepo SallyCards utilise un metro.config.js avec resolveRequest
 * custom (pour pinner toutes les copies dupliquées sur app/node_modules/)
 * + un workspaceRoot fallback (../../../node_modules). Ce setup est
 * indispensable QUAND deux copies physiques d'un package coexistent dans
 * le monorepo.
 *
 * Dans ce repo standalone, sally-solitaire/node_modules/ contient TOUS les
 * packages en direct (npm install résout tout au niveau du repo, pas
 * d'héritage workspace). Donc :
 *   - Plus de duplication → resolveRequest custom inutile
 *   - workspaceRoot ../../../node_modules N'EXISTE PAS → erreurs Metro
 *
 * Cf. SallyCards-CICD-Pipeline-Report.pdf §4 :
 *   « metro.config.js workspaceRoot inexistant — Fix : Simplification :
 *     juste getDefaultConfig(__dirname) »
 *
 * SEULE exception préservée : le rewrite `event-target-shim/index`,
 * requis par react-native-webrtc qui importe le sous-chemin /index alors
 * que event-target-shim v5+ n'a plus de /index.js (cf. APK Build Guide).
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ─── Fix react-native-webrtc → event-target-shim/index ──────────────
// event-target-shim v5 expose seulement `dist/event-target-shim.js` via
// le champ `main`. react-native-webrtc importe `event-target-shim/index`
// qui 404 → ré-écriture vers le bare name pour que Metro résolve via main.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'event-target-shim/index') {
    return (originalResolveRequest || context.resolveRequest)(
      context, 'event-target-shim', platform,
    );
  }
  return (originalResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
