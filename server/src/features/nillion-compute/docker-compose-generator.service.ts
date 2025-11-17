import { logger } from '@/utils/logger';

export interface DockerComposeConfig {
  serviceName: string;
  nodeJsCode: string;
  inputs: Record<string, any>;
}

class DockerComposeGeneratorService {
  generateComposeYaml(config: DockerComposeConfig): string {
    const { serviceName, nodeJsCode, inputs } = config;

    const compose = {
      version: '3.8',
      services: {
        [serviceName]: {
          image: 'node:18-alpine',
          working_dir: '/app',
          volumes: [
            './workflow.js:/app/workflow.js:ro',
            './input.json:/app/input.json:ro',
            './output:/app:rw',
          ],
          command: ['node', 'workflow.js'],
          environment: {
            NODE_ENV: 'production',
          },
        },
      },
    };

    const yaml = this.objectToYaml(compose);
    return yaml;
  }

  generatePackageJson(): string {
    return JSON.stringify(
      {
        name: 'nillion-workflow',
        version: '1.0.0',
        description: 'Generated Nillion workflow',
        main: 'workflow.js',
        scripts: {
          start: 'node workflow.js',
        },
        dependencies: {},
      },
      null,
      2,
    );
  }

  generateDockerfile(): string {
    return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
COPY workflow.js ./
COPY input.json ./
RUN mkdir -p /app
CMD ["node", "workflow.js"]
`;
  }

  private objectToYaml(obj: any, indent: number = 0): string {
    const lines: string[] = [];
    const indentStr = '  '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        lines.push(`${indentStr}${key}:`);
      } else if (Array.isArray(value)) {
        lines.push(`${indentStr}${key}:`);
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            lines.push(`${indentStr}- ${this.objectToYaml(item, indent + 1).trim()}`);
          } else {
            lines.push(`${indentStr}- ${item}`);
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        lines.push(`${indentStr}${key}:`);
        lines.push(this.objectToYaml(value, indent + 1));
      } else if (typeof value === 'string') {
        if (value.includes(':') || value.includes('#') || value.includes('-')) {
          lines.push(`${indentStr}${key}: "${value}"`);
        } else {
          lines.push(`${indentStr}${key}: ${value}`);
        }
      } else {
        lines.push(`${indentStr}${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }
}

export const dockerComposeGeneratorService = new DockerComposeGeneratorService();
