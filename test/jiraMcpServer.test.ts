import { JiraMcpServer } from '../src/index';
import { Version2Client, AgileClient } from 'jira.js';
import { CallToolRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock the jira.js clients
jest.mock('jira.js', () => {
  const mockIssues = {
    deleteIssue: jest.fn(),
    createIssue: jest.fn(),
    editIssue: jest.fn(),
    getTransitions: jest.fn(),
    doTransition: jest.fn(),
    getIssue: jest.fn(),
  };
  const mockIssueSearch = {
    searchForIssuesUsingJql: jest.fn(),
  };
  const mockProjects = {
    getProject: jest.fn(),
  };
  const mockIssueTypes = {
    getIssueAllTypes: jest.fn(),
  };
  const mockAgileBoard = {
    getBoard: jest.fn(),
    getConfiguration: jest.fn(),
  };
  const mockFilters = {
    getFilter: jest.fn(),
  };
  const mockUserSearch = {
    findUsers: jest.fn(),
  };
  const mockIssueLink = {
    linkIssues: jest.fn(),
  };

  return {
    Version2Client: jest.fn(() => ({
      issues: mockIssues,
      issueSearch: mockIssueSearch,
      projects: mockProjects,
      issueTypes: mockIssueTypes,
      filters: mockFilters,
      userSearch: mockUserSearch,
      issueLinks: mockIssueLink,
    })),
    AgileClient: jest.fn(() => ({
      board: mockAgileBoard,
    })),
  };
});

// A helper to call tools on the server instance for testing
async function callTool(server: any, name: string, args: any) {
  const handler = server.server.getRequestHandler(CallToolRequestSchema);
  if (!handler) {
    throw new Error('CallToolRequest handler not registered');
  }
  return handler({
    jsonrpc: '2.0',
    method: 'tool/call',
    params: { name, arguments: args },
  });
}

describe('JiraMcpServer Tool Handlers', () => {
  let server: JiraMcpServer;
  let mockJiraClient: jest.Mocked<Version2Client>;
  let mockAgileClient: jest.Mocked<AgileClient>;

  beforeAll(() => {
    // Set dummy env vars for server initialization
    process.env.JIRA_HOST = 'test.atlassian.net';
    process.env.JIRA_EMAIL = 'test@example.com';
    process.env.JIRA_API_TOKEN = 'test-token';
  });

  beforeEach(() => {
    // Create a new server for each test to ensure isolation
    server = new JiraMcpServer();
    
    // Get the mocked instances
    mockJiraClient = new Version2Client({} as any) as jest.Mocked<Version2Client>;
    mockAgileClient = new AgileClient({} as any) as jest.Mocked<AgileClient>;

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('get_issues tool', () => {
    it('should get issues for a project key', async () => {
      const mockResponse = { total: 1, issues: [{ id: '1', key: 'TEST-1' }] };
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue(mockResponse);

      const result = await callTool(server, 'get_issues', { projectKey: 'TEST' });

      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: 'project = "TEST"',
      });
      expect(result.content[0].text).toBe(JSON.stringify(mockResponse, null, 2));
    });

    it('should combine project key and JQL', async () => {
      const mockResponse = { total: 0, issues: [] };
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue(mockResponse);

      await callTool(server, 'get_issues', { projectKey: 'TEST', jql: 'status = Done' });

      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: 'project = "TEST" AND status = Done',
      });
    });

    it('should get issues from a rapid view and combine JQL', async () => {
      (mockAgileClient.board.getBoard as jest.Mock).mockResolvedValue({ id: 1, name: 'Test Board' });
      (mockAgileClient.board.getConfiguration as jest.Mock).mockResolvedValue({ filter: { id: '10000' } });
      (mockJiraClient.filters.getFilter as jest.Mock).mockResolvedValue({ jql: 'project = BOARD' });
      const mockResponse = { total: 1, issues: [{ id: '2', key: 'BOARD-1' }] };
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue(mockResponse);

      await callTool(server, 'get_issues', { rapidView: 1, jql: 'assignee = currentUser()' });

      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: 'project = BOARD AND (assignee = currentUser())',
      });
    });

    it('should throw McpError for invalid arguments', async () => {
      await expect(callTool(server, 'get_issues', {})).rejects.toThrow(McpError);
      await expect(callTool(server, 'get_issues', {})).rejects.toHaveProperty('code', ErrorCode.InvalidParams);
    });
  });

  describe('create_issue tool', () => {
    it('should create an issue with required fields', async () => {
      (mockJiraClient.projects.getProject as jest.Mock).mockResolvedValue({ id: '10000' });
      (mockJiraClient.issueTypes.getIssueAllTypes as jest.Mock).mockResolvedValue([{ id: '10001', name: 'Task' }]);
      const mockCreatedIssue = { id: '123', key: 'TEST-123' };
      (mockJiraClient.issues.createIssue as jest.Mock).mockResolvedValue(mockCreatedIssue);

      const result = await callTool(server, 'create_issue', {
        projectKey: 'TEST',
        summary: 'New test issue',
        issueType: 'Task',
      });

      expect(mockJiraClient.issues.createIssue).toHaveBeenCalledWith(expect.objectContaining({
        fields: expect.objectContaining({ summary: 'New test issue' }),
      });
      expect(result.content[0].text).toBe(JSON.stringify(mockCreatedIssue, null, 2));
    });
  });

  describe('get_assigned_issues tool', () => {
    it('should get issues currently assigned to a user by default', async () => {
      const mockResponse = { total: 1, issues: [{ id: '1', key: 'TEST-1' }] };
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue(mockResponse);

      const result = await callTool(server, 'get_assigned_issues', { accountId: 'user-123' });

      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: 'assignee = "user-123"',
      });
      expect(result.content[0].text).toBe(JSON.stringify(mockResponse, null, 2));
    });

    it('should get issues previously assigned to a user', async () => {
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue({});
      await callTool(server, 'get_assigned_issues', { accountId: 'user-123', status: 'past' });
      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: 'assignee WAS "user-123"',
      });
    });

    it('should get all issues ever assigned to a user', async () => {
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue({});
      await callTool(server, 'get_assigned_issues', { accountId: 'user-123', status: 'all' });
      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: '(assignee = "user-123" OR assignee WAS "user-123")',
      });
    });

    it('should combine with additional JQL', async () => {
      (mockJiraClient.issueSearch.searchForIssuesUsingJql as jest.Mock).mockResolvedValue({});
      await callTool(server, 'get_assigned_issues', {
        accountId: 'user-123',
        status: 'all',
        additionalJql: 'project = "TEST"',
      });
      expect(mockJiraClient.issueSearch.searchForIssuesUsingJql).toHaveBeenCalledWith({
        jql: '(assignee = "user-123" OR assignee WAS "user-123") AND (project = "TEST")',
      });
    });

    it('should throw McpError for missing accountId', async () => {
      await expect(callTool(server, 'get_assigned_issues', {})).rejects.toThrow(McpError);
      await expect(callTool(server, 'get_assigned_issues', {})).rejects.toHaveProperty('code', ErrorCode.InvalidParams);
    });
  });

  // ... Add more tests for update_issue, delete_issue, etc. here
});
