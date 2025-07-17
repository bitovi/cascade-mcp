import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

const cloudWatchConfig = {
  logGroupName: 'status-reports-for-jira',
  logStreamName: 'domain-logging',
  awsRegion: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    process.env.AWS_ACCESS_KEY_ID && new WinstonCloudWatch(cloudWatchConfig),
  ].filter(Boolean),
});
