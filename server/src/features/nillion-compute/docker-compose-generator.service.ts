class DockerComposeGeneratorService {
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
}

export const dockerComposeGeneratorService = new DockerComposeGeneratorService();
