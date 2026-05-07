/**
 * Configuration Jest pour les modules pure-TS du mobile.
 *
 * Ne couvre PAS les composants React Native (qui demanderaient
 * @testing-library/react-native + jest-expo). Couvre uniquement la logique
 * métier (engines, replays, achievements, etc.).
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  // Specs sont DEHORS de src/ pour ne pas polluer Metro bundler
  testMatch: ['<rootDir>/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Mock simple pour AsyncStorage (les modules de logique l'utilisent)
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/src/__mocks__/asyncStorageMock.ts',
  },
  globals: {
    'ts-jest': {
      isolatedModules: true,
      diagnostics: false,
    },
  },
};
