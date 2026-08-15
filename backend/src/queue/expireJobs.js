// Run on a schedule (e.g. every 15 minutes via cron or a scheduled task)
// to mark old jobs expired. Combine with a separate storage lifecycle rule
// on the object storage bucket to delete any lingering temp audio files.
import { deleteExpiredJobs } from '../services/jobStore.js';

await deleteExpiredJobs();
console.log('Expired job sweep complete.');
process.exit(0);
