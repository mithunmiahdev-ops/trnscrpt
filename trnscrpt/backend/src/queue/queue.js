import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';

export const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });

export const transcriptQueue = new Queue('transcript-jobs', { connection });

export async function enqueueTranscriptJob({ jobId, sourceUrl, platform }) {
  await transcriptQueue.add(
    'transcribe',
    { jobId, sourceUrl, platform },
    {
      jobId, // dedupe on our own job id
      attempts: 1, // retries are handled inside the worker per-stage, not by re-running the whole pipeline
      removeOnComplete: 500,
      removeOnFail: 500,
    }
  );
}
