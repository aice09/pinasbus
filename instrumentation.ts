// Runs once when a server process starts: migrations, then the background jobs.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { ready } = await import('./lib/db');
  const { startJobs } = await import('./lib/jobs');
  await ready().catch((e) => console.error('migrations failed at startup', e));
  startJobs();
}
