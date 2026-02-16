import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

interface CloudWatchConfig {
  logGroupName: string;
  logStreamName: string;
  awsRegion: string;
  credentials: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
  };
}

const cloudWatchConfig: CloudWatchConfig = {
  logGroupName: 'jira-mcp-auth-bridge',
  logStreamName: 'domain-logging',
  awsRegion: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const transports: winston.transport[] = [
  new winston.transports.Console({
    silent: process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true'
  }),
];

if (process.env.AWS_ACCESS_KEY_ID) {
  transports.push(new WinstonCloudWatch(cloudWatchConfig));
}

export const logger = winston.createLogger({
  transports,
});
