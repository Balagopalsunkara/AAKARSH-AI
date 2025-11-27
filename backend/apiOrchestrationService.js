const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');

class ApiOrchestrationService {
    constructor() {
        this.configs = new Map();
        this.encryptionKey = process.env.API_ENCRYPTION_KEY || 'default-dev-key-do-not-use-in-prod';
        this.storageFile = path.join(__dirname, 'api_configs.json');
        this.loadConfigs();
    }

    async loadConfigs() {
        try {
            const data = await fs.readFile(this.storageFile, 'utf8');
            const configs = JSON.parse(data);
            this.configs = new Map(configs.map(c => [c.id, c]));
            logger.info(`Loaded ${this.configs.size} API configurations`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load API configs', { error: error.message });
            }
        }
    }

    async saveConfigs() {
        try {
            const configs = Array.from(this.configs.values());
            await fs.writeFile(this.storageFile, JSON.stringify(configs, null, 2));
        } catch (error) {
            logger.error('Failed to save API configs', { error: error.message });
        }
    }

    encrypt(text) {
        if (!text) return text;
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    decrypt(text) {
        if (!text || !text.includes(':')) return text;
        const [ivHex, encryptedHex] = text.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const encryptedText = Buffer.from(encryptedHex, 'hex');
        const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    async discoverApi(url) {
        try {
            // Try to fetch OpenAPI/Swagger spec
            const possiblePaths = ['/openapi.json', '/swagger.json', '/api-docs', '/v3/api-docs'];
            let spec = null;
            let baseUrl = url.replace(/\/$/, '');

            // First try the URL directly
            try {
                const response = await axios.get(url);
                if (response.data && (response.data.openapi || response.data.swagger)) {
                    spec = response.data;
                }
            } catch (e) {
                // Ignore
            }

            // If not found, try common paths
            if (!spec) {
                for (const p of possiblePaths) {
                    try {
                        const response = await axios.get(`${baseUrl}${p}`);
                        if (response.data && (response.data.openapi || response.data.swagger)) {
                            spec = response.data;
                            break;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
            }

            if (spec) {
                const endpoints = [];
                if (spec.paths) {
                    for (const [path, methods] of Object.entries(spec.paths)) {
                        for (const [method, details] of Object.entries(methods)) {
                            if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                                endpoints.push({
                                    path,
                                    method: method.toUpperCase(),
                                    description: details.summary || details.description,
                                    parameters: details.parameters || [],
                                    operationId: details.operationId
                                });
                            }
                        }
                    }
                }

                return {
                    name: spec.info?.title || 'Unknown API',
                    description: spec.info?.description,
                    baseUrl: spec.servers?.[0]?.url || baseUrl,
                    endpoints,
                    discovered: true
                };
            }

            return {
                baseUrl,
                discovered: false
            };
        } catch (error) {
            logger.error('API discovery failed', { error: error.message, url });
            return { baseUrl: url, discovered: false, error: error.message };
        }
    }

    async configureApi(config) {
        const id = config.id || crypto.randomUUID();

        // Encrypt credentials
        if (config.credentials) {
            for (const [key, value] of Object.entries(config.credentials)) {
                config.credentials[key] = this.encrypt(value);
            }
        }

        const newConfig = {
            ...config,
            id,
            updatedAt: new Date().toISOString()
        };

        this.configs.set(id, newConfig);
        await this.saveConfigs();
        return newConfig;
    }

    listApis() {
        return Array.from(this.configs.values()).map(api => {
            const { credentials, ...safeConfig } = api;
            return safeConfig;
        });
    }

    getApi(id) {
        return this.configs.get(id);
    }

    async deleteApi(id) {
        const deleted = this.configs.delete(id);
        if (deleted) {
            await this.saveConfigs();
        }
        return deleted;
    }

    async executeRequest(apiId, endpointPath, method, params = {}, body = {}) {
        const config = this.configs.get(apiId);
        if (!config) {
            throw new Error(`API ${apiId} not found`);
        }

        let url = `${config.baseUrl.replace(/\/$/, '')}${endpointPath}`;
        const headers = {
            'Content-Type': 'application/json'
        };

        // Handle Authentication
        if (config.authType === 'apiKey' && config.credentials?.apiKey) {
            const apiKey = this.decrypt(config.credentials.apiKey);
            const keyName = config.authKeyName || 'api_key';
            if (config.authLocation === 'header') {
                headers[keyName] = apiKey;
            } else {
                params[keyName] = apiKey;
            }
        } else if (config.authType === 'bearer' && config.credentials?.token) {
            headers['Authorization'] = `Bearer ${this.decrypt(config.credentials.token)}`;
        } else if (config.authType === 'basic' && config.credentials?.username) {
            const username = this.decrypt(config.credentials.username);
            const password = this.decrypt(config.credentials.password);
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            headers['Authorization'] = `Basic ${auth}`;
        }

        // Replace path parameters
        // e.g. /users/{id} -> /users/123
        let finalUrl = url;
        const queryParams = { ...params };

        // Simple path param replacement
        for (const [key, value] of Object.entries(params)) {
            if (finalUrl.includes(`{${key}}`)) {
                finalUrl = finalUrl.replace(`{${key}}`, value);
                delete queryParams[key]; // Remove from query params if used in path
            } else if (finalUrl.includes(`:${key}`)) {
                finalUrl = finalUrl.replace(`:${key}`, value);
                delete queryParams[key];
            }
        }

        try {
            const response = await axios({
                method,
                url: finalUrl,
                headers,
                params: queryParams,
                data: body
            });

            return {
                status: response.status,
                data: response.data,
                headers: response.headers
            };
        } catch (error) {
            logger.error('API request execution failed', {
                apiId,
                endpoint: endpointPath,
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = new ApiOrchestrationService();
