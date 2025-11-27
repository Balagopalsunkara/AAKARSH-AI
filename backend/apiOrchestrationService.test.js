const apiOrchestrationService = require('./apiOrchestrationService');
const axios = require('axios');
const fs = require('fs').promises;

jest.mock('axios');
jest.mock('./logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
}));
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn(),
        writeFile: jest.fn()
    },
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn()
}));

describe('ApiOrchestrationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        console.log('Service:', apiOrchestrationService);
        if (apiOrchestrationService && apiOrchestrationService.configs) {
            apiOrchestrationService.configs.clear();
        }
    });

    describe('discoverApi', () => {
        it('should discover API from OpenAPI spec', async () => {
            const mockSpec = {
                openapi: '3.0.0',
                info: { title: 'Test API', description: 'Test Description', version: '1.0.0' },
                servers: [{ url: 'http://api.test.com' }],
                paths: {
                    '/users': {
                        get: { description: 'Get users', operationId: 'getUsers' }
                    }
                }
            };

            axios.get.mockResolvedValueOnce({ data: mockSpec });

            const result = await apiOrchestrationService.discoverApi('http://api.test.com');

            expect(result.name).toBe('Test API');
            expect(result.endpoints).toHaveLength(1);
            expect(result.endpoints[0].path).toBe('/users');
            expect(result.endpoints[0].method).toBe('GET');
        });

        it('should return basic info if discovery fails', async () => {
            axios.get.mockRejectedValue(new Error('Not found'));

            const result = await apiOrchestrationService.discoverApi('http://api.test.com');

            expect(result.baseUrl).toBe('http://api.test.com');
            expect(result.discovered).toBe(false);
        });
    });

    describe('configureApi', () => {
        it('should save API configuration', async () => {
            const config = {
                name: 'My API',
                baseUrl: 'http://api.test.com',
                authType: 'none'
            };

            const saved = await apiOrchestrationService.configureApi(config);

            expect(saved.id).toBeDefined();
            expect(apiOrchestrationService.configs.has(saved.id)).toBe(true);
            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should encrypt credentials', async () => {
            const config = {
                name: 'Secure API',
                baseUrl: 'http://secure.api.com',
                authType: 'apiKey',
                credentials: { apiKey: 'secret-key' }
            };

            const saved = await apiOrchestrationService.configureApi(config);

            expect(saved.credentials.apiKey).not.toBe('secret-key');
            expect(saved.credentials.apiKey).toContain(':'); // IV:Encrypted
        });
    });

    describe('executeRequest', () => {
        it('should execute request with correct parameters', async () => {
            const config = {
                id: 'test-id',
                name: 'Test API',
                baseUrl: 'http://api.test.com',
                authType: 'none'
            };
            apiOrchestrationService.configs.set('test-id', config);

            axios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                data: { success: true },
                headers: {}
            });

            const result = await apiOrchestrationService.executeRequest('test-id', '/users', 'GET', { limit: 10 });

            expect(axios).toHaveBeenCalledWith(expect.objectContaining({
                method: 'GET',
                url: 'http://api.test.com/users',
                params: { limit: 10 }
            }));
            expect(result.data).toEqual({ success: true });
        });
    });
});
