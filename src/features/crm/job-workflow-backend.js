export function createJobWorkflowBackend(client) {
  return {
    async command(jobId, revision, operation, payload, operationId) {
      const { data, error } = await client.rpc("crm_job_workflow_command", {
        p_job_id: jobId,
        p_revision: revision || 0,
        p_operation: operation,
        p_payload: payload,
        p_operation_id: operationId,
      });
      if (error)
        throw Object.assign(new Error(error.message), {
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
      if (!data?.job?.id || !Array.isArray(data.tasks))
        throw Error("The backend did not confirm the job workflow.");
      return data;
    },
  };
}
