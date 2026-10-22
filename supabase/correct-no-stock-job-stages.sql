-- REVIEWED TARGET LIST ONLY. Not a migration and not run by this task.
-- Release the conditional workflow extension first. Execute each command through
-- the authenticated management RPC (or the per-job Recalculate button), so
-- get_access_context / effective grants and actor audit remain authoritative.
-- Do not run as an unauthenticated SQL-editor/service-role substitute.
-- Recheck the preview and current revisions immediately before applying.
-- These two records have no items; the original quote/lead-linked Pending
-- scheduling tasks are incorrectly attached to Collected. The command moves
-- those proven generated scheduling tasks to Installation Scheduled and retains
-- completed/manual tasks, evidence, stock records and accepted documents.
select public.crm_job_workflow_correction_preview();

select public.crm_job_workflow_command(
 'job-1792492445490-67o9v',0,'reconcile',
 '{"reason":"Correct JOB-000119 no-inventory stages; retain original quotation-linked work and evidence"}',
 '629e3126-20f2-4d18-82f4-f1f7bc89b7b1'::uuid
);
select public.crm_job_workflow_command(
 'job-1792592849295-u6z4i',0,'reconcile',
 '{"reason":"Correct JOB-000121 no-inventory stages; retain original quotation-linked work and evidence"}',
 '2b6f481e-9d16-4d5b-ae84-e2e091c7d1b4'::uuid
);

-- JOB-000120 has completed work/evidence and is deliberately not in this list.
-- Unknown task provenance or recorded stock/collection activity stops correction
-- for review. Version mismatches also stop the operation; do not force revisions.
