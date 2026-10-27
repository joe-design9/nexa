/** Jest-Konfiguration für @nexa/web.
 *  Deckt die Wörterbuch-Vollständigkeit (i18n) ab; jest/ts-jest werden aus
 *  dem Root-Workspace (hoisted) verwendet, wie bei @nexa/api und @nexa/shared. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'ES2022', esModuleInterop: true, strict: true, skipLibCheck: true } }],
  },
};
