import { Worker } from 'bullmq';
import { connection } from './queue.js';
import { extractAudio, MediaExtractionError } from '../services/mediaExtraction.js';
import { transcribeAudio, TranscriptionError } from '../services/transcription.js';
import { updateJob, initSchema } from '../services/jobStore.js';

await initSchema();

const worker = new Worker(
  'transcript-jobs',
  async (job) => {
    const { jobId, sourceUrl } = job.data;
    let media;

    try {
      await updateJob(jobId, { status: 'processing', stage: 'detecting_language' });

      // Stage: extract audio
      await updateJob(jobId, { stage: 'extracting_audio' });
      media = await extractAudio(sourceUrl);

      // Stage: transcribe (includes language detection)
      await updateJob(jobId, { stage: 'transcribing' });
      const result = await transcribeAudio(media.filePath);

      // Stage: finalize
      await updateJob(jobId, { stage: 'finalizing' });
      await updateJob(jobId, {
        status: 'completed',
        stage: 'done',
        language: result.language,
        segments: JSON.stringify(result.segments),
      });
    } catch (err) {
      const message =
        err instanceof MediaExtractionError || err instanceof TranscriptionError
          ? err.message
          : 'Something went wrong while generating your transcript. Please try again.';

      await updateJob(jobId, { status: 'failed', error_message: message });
      throw err; // let BullMQ record the failure too
    } finally {
      if (media) await media.cleanup();
    }
  },
  { connection, concurrency: 3 }
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log('Trnscrpt worker started.');
