/** Jest-Konfiguration für @nexa/api.
 *  Tests laufen ohne Live-DB/Redis: PrismaService und RedisService werden gemockt.
 *  @nexa/shared wird auf die TypeScript-Quelle gemappt (vom Shared-Agenten
 *  implementiert); zur Build-/Testzeit ohne fertiges Shared-Paket kann die
 *  Mappe temporär auf einen lokalen Stub zeigen – die committete Config hier
 *  zeigt auf die echte Quelle. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', target: 'ES2022', experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, strict: true, skipLibCheck: true } }],
  },
  moduleNameMapper: {
    '^@nexa/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
};
