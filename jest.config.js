export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
        isolatedModules: true
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@modelcontextprotocol/sdk/server/(.*)$': '<rootDir>/node_modules/@modelcontextprotocol/sdk/dist/server/$1',
    '^@modelcontextprotocol/sdk/types$': '<rootDir>/node_modules/@modelcontextprotocol/sdk/dist/types',
    '^@modelcontextprotocol/sdk$': '<rootDir>/node_modules/@modelcontextprotocol/sdk/dist/index'
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/)'
  ]
};
