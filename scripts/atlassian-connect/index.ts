import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const deploymentConnectMetadata = {
  staging: {
    name: 'Status Reports for Jira (Staging)',
    baseUrl: 'https://cascade-staging.bitovi.com',
    key: 'bitovi.jira-mcp-auth-bridge.staging',
  },
  production: {
    name: 'Status Reports for Jira',
    baseUrl: 'https://cascade.bitovi.com',
    key: 'bitovi.jira-mcp-auth-bridge',
  },
} as const;

const createLocalConnectMetaData = ({ name, url }: { name: string; url: string }) => {
  return {
    name: `Status Reports for Jira (Local - ${name})`,
    baseUrl: `${url}`,
    key: `bitovi.jira-mcp-auth-bridge.local.${name.toLowerCase()}`,
  };
};

const createMetadata = (options: { name: string; url: string }) => {
  return {
    ...deploymentConnectMetadata,
    local: createLocalConnectMetaData(options),
  };
};

type Metadata = (typeof connectMetadata)[keyof typeof connectMetadata];

const program = new Command();

program
  .option('-e, --environment <env>', 'specify the environment', 'production')
  .option('-n, --name <developer-name>', 'your name', '<your-name-here>')
  .option('-u, --url <url>', 'your fully qualified url', '<ngrok-url-here>')
  .parse(process.argv);

const { environment, ...localOptions } = program.opts<{
  environment: string;
  name: string;
  url: string;
}>();

const connectMetadata = createMetadata(localOptions);

function main() {
  if (!Object.keys(connectMetadata).includes(environment)) {
    console.error(
      [
        `Specified environment "${environment}" does not exist.`,
        "The only allowed environments are 'local', 'staging', or 'production'.",
      ].join('\n'),
    );
    process.exit(1);
  }

  const metadata: Metadata = connectMetadata[environment];

  try {
    const rawConnect = fs.readFileSync(path.resolve(__dirname, 'base-connect.json'), 'utf-8');
    const baseConnect = JSON.parse(rawConnect);

    fs.writeFileSync(
      path.resolve(__dirname, '../../', 'public/atlassian-connect.json'),
      JSON.stringify({ ...baseConnect, ...metadata, ...createModules(metadata) }),
    );

    console.log('Created atlassian-connect.json');
  } catch (error) {
    console.error('Something went wrong creating atlassian-connect.json');
    console.error(error);
  }
}

main();

function createModules({ name, key }: Metadata) {
  return {
    modules: {
      generalPages: [
        {
          url: '/connect.html',
          key: 'main',
          location: 'system.top.navigation.bar',
          name: {
            value: name,
          },
        },
        {
          url: `/connect.html?primaryIssueType={ac.${key}.primaryIssueType}&hideUnknownInitiatives={ac.${key}.hideUnknownInitiatives}&jql={ac.${key}.jql}&loadChildren={ac.${key}.loadChildren}&primaryReportType={ac.${key}.primaryReportType}&secondaryReportType={ac.${key}.secondaryReportType}&showPercentComplete={ac.${key}.showPercentComplete}&showOnlySemverReleases={ac.${key}.showOnlySemverReleases}&settings={ac.${key}.settings}`,
          key: 'deeplink',
          location: 'none',
          name: {
            value: `${name} (Deep Link)`,
          },
        },
      ],
      jiraProjectPages: [
        {
          key: 'project',
          name: {
            value: name,
          },
          url: "/connect.html?jql=project%3D'${project.key}'&primaryIssueType%3DInitiative",
          weight: 1,
        },
      ],
    },
  };
}

main();
