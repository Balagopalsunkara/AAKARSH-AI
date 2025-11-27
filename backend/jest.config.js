module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server.js',
    'middleware.js',
    'logger.js',
    'metrics.js'
  ],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  verbose: true,
  // Fix for ES module compatibility with @octokit/rest
  transformIgnorePatterns: [
    'node_modules/(?!(@octokit)/)'
  ]
};
