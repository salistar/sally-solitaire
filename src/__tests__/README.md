# Tests mobile — guide

## Tests actifs (pure-TS, sans React)

- `src/game/replays.spec.ts` — sauvegarde/listing/suppression de replays
- `src/game/achievements.spec.ts` — prédicats de déblocage
- `src/game/daily-reminder.spec.ts` — logique de rappel
- `src/game/action-describer.spec.ts` — formatage des actions

## Activation de tests RTL (composants RN)

Pour tester les composants React Native (`<GameHeader />`, `<AiTutorialModal />`, etc.) :

```bash
pnpm add -D @testing-library/react-native @testing-library/jest-native react-test-renderer
```

Puis modifier `jest.config.js` :

```js
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  setupFilesAfterEach: ['@testing-library/jest-native/extend-expect'],
  // ...
};
```

Exemple de smoke test (`src/__tests__/components/AiTutorialModal.spec.tsx`) :

```tsx
import { render, screen } from '@testing-library/react-native';
import { AiTutorialModal } from '../../app/game/solo';

describe('<AiTutorialModal />', () => {
  it('affiche le titre quand visible', () => {
    render(<AiTutorialModal visible={true} onDismiss={() => {}} />);
    expect(screen.getByText(/AI Mode/)).toBeOnTheScreen();
  });
});
```

## Tests existants

```
$ npx jest --no-coverage
PASS src/game/daily-reminder.spec.ts
PASS src/game/replays.spec.ts
PASS src/game/achievements.spec.ts
PASS src/game/action-describer.spec.ts
Test Suites: 4 passed
Tests:       30+ passed
```
