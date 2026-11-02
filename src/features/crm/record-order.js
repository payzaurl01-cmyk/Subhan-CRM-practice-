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
  if (a.jobId && a.jobId === b.jobId) {
    const job = jobOf(a.jobId);
    const rank = (task) => {
      const value = stageRank(task.jobStage, job);
      return value < 0 ? Number.MAX_SAFE_INTEGER : value;
    };
    return rank(a) - rank(b) || newestFirst(a, b);
  }
  const date = (task) => {
    const job = task.jobId && jobOf(task.jobId);
    return job ? jobCreatedTime(job) : timestamp(task.createdAt);
  };
  return date(b) - date(a) || newestFirst(a, b);
}
