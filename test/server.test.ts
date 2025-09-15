// Use dynamic import for ESM compatibility
import { jest } from '@jest/globals';

// Mock modules before importing the modules that use them
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  return {
    Server: jest.fn().mockImplementation(() => {
      return {
        setRequestHandler: jest.fn(),
        onerror: jest.fn(),
        listen: jest.fn(),
        getRequestHandler: jest.fn().mockImplementation(() => {
          return () => {
            return { content: [{ type: 'text', text: '{}' }] };
          };
        }),
      };
    })
  };
}, { virtual: true });

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn()
      };
    })
  };
}, { virtual: true });

// Mock the jira.js client
jest.mock('jira.js', () => {
  const mockClient = {
    issues: { createIssue: jest.fn() },
    issueSearch: { searchForIssuesUsingJql: jest.fn() }
  };
  
  return {
    Version2Client: jest.fn(() => mockClient),
    AgileClient: jest.fn(() => ({ board: { getBoard: jest.fn() } }))
  };
});

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Let's mock the Server class in a simpler way
const mockServer = {
  setRequestHandler: jest.fn(),
  onerror: jest.fn(),
  listen: jest.fn(),
  getRequestHandler: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined)
};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer)
}), { virtual: true });

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({
    connect: jest.fn()
  }))
}), { virtual: true });

// Import after mocks are set up
import { start } from '../src/server.js';

describe('Jira MCP Server', () => {
  beforeAll(() => {
    process.env.JIRA_HOST = 'test.atlassian.net';
    process.env.JIRA_EMAIL = 'test@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';
  });
  
  afterAll(async () => {
    // Clean up any potential listeners
    jest.clearAllMocks();
  });
  
  it('server can be created', async () => {
    // Override console.error to prevent output during tests
    const originalConsoleError = console.error;
    console.error = jest.fn();
    
    await start();
    
    // Restore console.error
    console.error = originalConsoleError;
    
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });
});