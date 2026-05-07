/**
 * @file action-describer.ts
 * @description Décrit une action de jeu de manière humaine (pour AI preview,
 * tutoriels, debug). Fonction pure — testable sans React.
 */

export function describeAction(action: any): string {
  if (!action || typeof action !== 'object') return '?';
  const t = action.type;
  switch (t) {
    case 'DRAW': return 'PIOCHE';
    case 'DEAL_ROW': return 'DISTRIBUE';
    case 'PLAY':
    case 'PLAY_SLOT':
      return `JOUE${action.col != null ? ` col${action.col + 1}` : ''}${action.index != null ? ` slot${action.index + 1}` : ''}`;
    case 'TAP_PYRAMID': return `TAP r${action.row + 1}c${action.col + 1}`;
    case 'TAP_WASTE': return 'TAP défausse';
    case 'TAP_PILE': return `TAP pile${action.index + 1}`;
    case 'MOVE': return `MOVE p${action.from + 1}→p${action.to + 1}`;
    case 'MOVE_TABLEAU': return `MOVE c${action.fromCol + 1}→c${action.toCol + 1}`;
    case 'MOVE_STACK': return `MOVE c${action.fromCol + 1}→c${action.toCol + 1} (×${action.count ?? 1})`;
    case 'WASTE_TO_TABLEAU': return `DÉFAUSSE→c${action.toCol + 1}`;
    case 'WASTE_TO_FOUNDATION': return `DÉFAUSSE→fondation`;
    case 'TABLEAU_TO_FOUNDATION': return `c${action.fromCol + 1}→fondation`;
    case 'TO_FOUNDATION': return `${action.src}${action.col != null ? ` c${action.col + 1}` : ''}→fondation`;
    case 'FREECELL_TO_TABLEAU': return `freecell${action.cellIdx + 1}→c${action.toCol + 1}`;
    case 'TABLEAU_TO_FREECELL': return `c${action.fromCol + 1}→freecell`;
    case 'AUTO_COMPLETE': return 'AUTO';
    default: return String(t).replace('_', ' ');
  }
}
