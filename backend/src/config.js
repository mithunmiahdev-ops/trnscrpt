import 'dotenv/config';

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  return val;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicAppUrl: required('PUBLIC_APP_URL', 'http://localhost:3000'),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL', 'redis://localhost:6379'),

  storage: {
    bucket: required('STORAGE_BUCKET'),
    region: required('STORAGE_REGION', 'auto'),
    accessKeyId: required('STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required('STORAGE_SECRET_ACCESS_KEY'),
    endpoint: required('STORAGE_ENDPOINT'),
  },

  transcription: {
    apiUrl: required('TRANSCRIPTION_API_URL'),
    apiKey: required('TRANSCRIPTION_API_KEY'),
  },

  translation: {
    apiUrl: required('TRANSLATION_API_URL'),
    apiKey: required('TRANSLATION_API_KEY'),
  },

  summary: {
    apiUrl: required('SUMMARY_API_URL'),
    apiKey: required('SUMMARY_API_KEY'),
  },

  limits: {
    freeDailyLimit: Number(process.env.FREE_DAILY_LIMIT || 5),
    maxMediaDurationSeconds: Number(process.env.MAX_MEDIA_DURATION_SECONDS || 3600),
    maxMediaFileSizeMb: Number(process.env.MAX_MEDIA_FILE_SIZE_MB || 250),
    jobExpiryHours: Number(process.env.JOB_EXPIRY_HOURS || 24),
  },
};
