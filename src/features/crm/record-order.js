const timestamp = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};

export const newestFirst = (a, b, date = (record) => record.createdAt) =>
  timestamp(date(b)) - timestamp(date(a));

export function jobCreatedTime(job) {
  if (job?.createdAt) return timestamp(job.createdAt);
  const events = (job?.timeline || [])
    .map((event) => timestamp(event.at))
    .filter(Boolean);
  return events.length ? Math.min(...events) : timestamp(job?.installationDate);
}

export const newestJobsFirst = (a, b) => jobCreatedTime(b) - jobCreatedTime(a);

export function jobTaskOrder(a, b, jobOf, stageRank) {
  const aJob = a.jobId && jobOf(a.jobId);
  const bJob = b.jobId && jobOf(b.jobId);
  if (a.jobId && a.jobId === b.jobId) {
    const job = aJob;
    const rank = (task) => {
      const value = stageRank(task.jobStage, job);
      return value < 0 ? Number.MAX_SAFE_INTEGER : value;
    };
    return rank(a) - rank(b) || newestFirst(a, b);
  }
  const aDate = aJob ? jobCreatedTime(aJob) : timestamp(a.createdAt);
  const bDate = bJob ? jobCreatedTime(bJob) : timestamp(b.createdAt);
  return (
    bDate - aDate ||
    Number(!!bJob) - Number(!!aJob) ||
    (aJob && bJob ? String(b.jobId).localeCompare(String(a.jobId)) : 0) ||
    newestFirst(a, b)
  );
}
