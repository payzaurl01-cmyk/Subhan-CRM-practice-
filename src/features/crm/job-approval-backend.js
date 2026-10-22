export function canApproveJobs(context) {
  const jobs = context?.modules?.find((module) => module.key === "jobs");
  return (
    context?.profile?.status === "active" &&
    ["super_admin", "admin", "manager"].includes(context.profile.role) &&
    jobs?.can_view === true &&
    jobs.can_approve === true
  );
}

export function sameReviewedWork(left, right) {
  const keys = [
    "status",
    "stages",
    "workType",
    "reopenedAt",
    "installerId",
    "items",
    "extraItems",
    "installationProof",
    "photos",
    "evidenceRequiredAfter",
    "collectionIssuedAt",
    "address",
    "suburb",
    "service",
    "notes",
  ];
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])]),
          )
        : value;
  return (
    !!right &&
    keys.every(
      (key) =>
        JSON.stringify(canonical(left[key])) ===
        JSON.stringify(canonical(right[key])),
    )
  );
}

// The browser client forwards its current session. PostgreSQL repeats every
// authorization and completion check while locking the reviewed job revision.
export function createJobApprovalBackend(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  return {
    async load() {
      const data = await rpc("job_approval_snapshot");
      if (
        !Array.isArray(data?.jobs) ||
        !Array.isArray(data?.history) ||
        !Array.isArray(data?.notifications)
      )
        throw new Error("The backend did not confirm approval data");
      return data;
    },
    async approve(id, revision, notes) {
      const data = await rpc("approve_completed_job", {
        p_job_id: id,
        p_revision: revision,
        p_notes: notes.trim(),
      });
      if (
        data?.approval_status !== "Approved" ||
        data.job_id !== id ||
        !data.id
      )
        throw new Error("The backend did not confirm job approval");
      return data;
    },
    async read(id) {
      if ((await rpc("read_job_approval_notification", { p_id: id })) !== true)
        throw new Error("Notification update was not confirmed");
    },
    watch(refresh) {
      let timer;
      const channel = client.channel(`job-approvals-${crypto.randomUUID()}`);
      for (const table of [
        "job_approval_state",
        "job_approval_history",
        "job_approval_notifications",
        "crm_records",
      ])
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            clearTimeout(timer);
            timer = setTimeout(refresh, 150);
          },
        );
      channel.subscribe();
      return () => {
        clearTimeout(timer);
        void client.removeChannel(channel);
      };
    },
  };
}
