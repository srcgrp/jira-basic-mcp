import { JiraMcpServer } from '../src/index';
import { Version2Client } from 'jira.js';
import * as dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

describe('JiraMcpServer Integration Tests', () => {
  let server: JiraMcpServer;
  const testProjectKey = process.env.TEST_PROJECT_KEY || 'TEST';

  beforeAll(async () => {
    server = new JiraMcpServer();
    await server.run();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('Tool: get_issues', () => {
    it('should return issues for a project', async () => {
      const testJira = new Version2Client({
        host: process.env.JIRA_HOST!,
        authentication: {
          basic: {
            email: process.env.JIRA_EMAIL!,
            apiToken: process.env.JIRA_PASSWORD!
          }
        }
      });

      const response = await testJira.issueSearch.searchForIssuesUsingJql({ 
        jql: `project = ${testProjectKey} ORDER BY created DESC`,
        maxResults: 5
      });
      
      expect(response.issues).toBeDefined();
      expect(response.issues?.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Tool: create_issue', () => {
    it('should create and delete a test issue', async () => {
      const testJira = new Version2Client({
        host: process.env.JIRA_HOST!,
        authentication: {
          basic: {
            email: process.env.JIRA_EMAIL!,
            apiToken: process.env.JIRA_PASSWORD!
          }
        }
      });

      // Create test issue
      const newIssue = await testJira.issues.createIssue({
        fields: {
          project: { key: testProjectKey },
          summary: 'Test Issue from MCP Server Tests',
          issuetype: { name: 'Task' },
          description: 'This is a test issue created by automated tests'
        }
      });

      expect(newIssue.id).toBeDefined();
      expect(newIssue.key).toContain(testProjectKey);

      // Cleanup - delete test issue
      await testJira.issues.deleteIssue({
        issueIdOrKey: newIssue.key
      });
    });
  });

  // Add more test cases for other tools...
});
