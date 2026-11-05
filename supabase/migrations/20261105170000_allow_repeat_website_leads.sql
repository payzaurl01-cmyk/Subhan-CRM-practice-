-- Every website submission may create its own CRM lead, even when contact details change.
-- Matching contacts and clients are reused; other identity conflicts still require review.
do $guard$ begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef('private.crm_process_website_intake(uuid)'::pg_catalog.regprocedure)) <> '582eeb72579a2ee581abd01bb518e841' then
    raise exception 'Website intake function changed; review before applying repeat-lead migration';
  end if;
end $guard$;

CREATE OR REPLACE FUNCTION private.crm_process_website_intake(p_enquiry_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  e public.website_enquiries;
  c public.crm_records;
  cl public.crm_records;
  matches text[];
  contact_id_text text;
  client_id_text text;
  lead_id_text text;
  v_email text;
  v_phone text;
  conflict_reason text;
  common_data jsonb;
  lead_data jsonb;
  source_data jsonb;
  lead_number text;
  sequence_text text;
  created_time text;
  follow_up_time text;
BEGIN
  -- One consistent lock order for both source paths and matching identities.
  PERFORM pg_advisory_xact_lock(hashtextextended('crm:website-contact-intake',0));
  SELECT * INTO e FROM public.website_enquiries WHERE id=p_enquiry_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Enquiry not found' USING ERRCODE='P0002'; END IF;
  IF e.crm_lead_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.crm_records WHERE collection='leads' AND id=e.crm_lead_id)
      OR NOT EXISTS(SELECT 1 FROM public.crm_records WHERE collection='contacts' AND id=e.crm_contact_id)
      OR NOT EXISTS(SELECT 1 FROM public.crm_records WHERE collection='clients' AND id=e.crm_client_id) THEN
      RAISE EXCEPTION 'Intake references a missing CRM record; manual review required' USING ERRCODE='23503';
    END IF;
    RETURN jsonb_build_object('status','processed','enquiry_id',e.id,'lead_id',e.crm_lead_id,
      'contact_id',e.crm_contact_id,'client_id',e.crm_client_id,'replayed',true,'schema_version',1);
  END IF;
  -- Preserve already processed legacy sources; never backfill implicitly.
  IF e.lead_id IS NOT NULL OR e.contact_id IS NOT NULL OR e.status='processed' THEN
    RETURN jsonb_build_object('status','legacy','enquiry_id',e.id,'replayed',true);
  END IF;
  IF e.status IN ('spam','duplicate') THEN
    RETURN jsonb_build_object('status',e.status,'enquiry_id',e.id,'replayed',true);
  END IF;

  v_email:=nullif(lower(btrim(e.email)),'');
  v_phone:=private.crm_intake_phone(e.phone);
  IF nullif(btrim(e.name),'') IS NULL OR (v_email IS NULL AND v_phone IS NULL) THEN
    RAISE EXCEPTION 'Name and at least one contact method are required' USING ERRCODE='22023';
  END IF;

  -- Match contacts conservatively; conflicting or multiple candidates need review.
  SELECT array_agg(id ORDER BY id) INTO matches FROM public.crm_records
  WHERE collection='contacts' AND
    ((v_email IS NOT NULL AND lower(btrim(data->>'email'))=v_email)
      OR (v_phone IS NOT NULL AND private.crm_intake_phone(data->>'phone')=v_phone));
  IF cardinality(matches)>1 THEN conflict_reason:='multiple_contact_matches';
  ELSIF cardinality(matches)=1 THEN
    contact_id_text:=matches[1];
    SELECT * INTO c FROM public.crm_records WHERE collection='contacts' AND id=contact_id_text FOR UPDATE;
    -- Keep the existing contact identity; this enquiry's email and phone stay on its own lead.
  END IF;

  SELECT array_agg(id ORDER BY id) INTO matches FROM public.crm_records
  WHERE collection='clients' AND
    ((contact_id_text IS NOT NULL AND data->>'contactId'=contact_id_text)
      OR (c.data->>'clientId' IS NOT NULL AND id=c.data->>'clientId')
      OR (v_email IS NOT NULL AND lower(btrim(data->>'email'))=v_email)
      OR (v_phone IS NOT NULL AND private.crm_intake_phone(data->>'phone')=v_phone));
  IF cardinality(matches)>1 THEN conflict_reason:=coalesce(conflict_reason,'multiple_client_matches');
  ELSIF cardinality(matches)=1 THEN
    client_id_text:=matches[1];
    SELECT * INTO cl FROM public.crm_records WHERE collection='clients' AND id=client_id_text FOR UPDATE;
    -- Keep the existing client identity without overwriting its contact details.
    IF nullif(cl.data->>'contactId','') IS NOT NULL THEN
      IF contact_id_text IS NOT NULL AND contact_id_text<>cl.data->>'contactId' THEN
        conflict_reason:=coalesce(conflict_reason,'conflicting_identity_links');
      ELSIF contact_id_text IS NULL THEN
        contact_id_text:=cl.data->>'contactId';
        SELECT * INTO c FROM public.crm_records WHERE collection='contacts' AND id=contact_id_text FOR UPDATE;
        IF NOT FOUND THEN conflict_reason:=coalesce(conflict_reason,'missing_linked_contact');
        ELSIF (v_email IS NOT NULL AND nullif(lower(btrim(c.data->>'email')),'') IS NOT NULL
            AND lower(btrim(c.data->>'email'))<>v_email)
           OR (v_phone IS NOT NULL AND private.crm_intake_phone(c.data->>'phone') IS NOT NULL
            AND private.crm_intake_phone(c.data->>'phone')<>v_phone) THEN
          conflict_reason:=coalesce(conflict_reason,'conflicting_linked_contact');
        END IF;
      END IF;
    END IF;
  END IF;
  IF nullif(c.data->>'clientId','') IS NOT NULL AND
    (client_id_text IS NULL OR c.data->>'clientId'<>client_id_text) THEN
    conflict_reason:=coalesce(conflict_reason,'missing_or_conflicting_linked_client');
  END IF;
  IF conflict_reason IS NOT NULL THEN
    UPDATE public.website_enquiries SET status='failed',crm_intake_version=1,
      crm_intake_error=conflict_reason WHERE id=e.id;
    RETURN jsonb_build_object('status','needs_review','enquiry_id',e.id,'reason',conflict_reason,'schema_version',1);
  END IF;

  contact_id_text:=coalesce(contact_id_text,'contact-'||gen_random_uuid()::text);
  client_id_text:=coalesce(client_id_text,'client-'||gen_random_uuid()::text);
  lead_id_text:='lead-web-'||e.id::text;
  -- Separate display-number namespace prevents collisions with browser-generated numbers.
  sequence_text:=nextval('private.crm_website_intake_number_seq')::text;
  lead_number:='LEAD-WEB-'||lpad(sequence_text,greatest(6,length(sequence_text)),'0');
  created_time:=to_char(e.submitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  follow_up_time:=to_char((now()+interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  source_data:=jsonb_strip_nulls(jsonb_build_object('type','website','enquiryId',e.id::text,
    'contactMessageId',e.contact_message_id::text,'form',e.intake_source,'landingPage',e.landing_page,
    'referrer',e.referrer,'utmSource',e.utm_source,'utmMedium',e.utm_medium,'utmCampaign',e.utm_campaign,
    'utmTerm',e.utm_term,'utmContent',e.utm_content));
  common_data:=jsonb_build_object('name',btrim(e.name),'customer',btrim(e.name),
    'email',coalesce(v_email,''),'phone',coalesce(nullif(btrim(e.phone),''),''),
    'address',coalesce(e.raw_payload->>'address',''),'suburb',coalesce(e.raw_payload->>'suburb',''),
    'postcode',coalesce(e.postcode,''),'source','Website','createdAt',created_time,
    'assignedTo','','intake',source_data,'schemaVersion',1);

  IF c.id IS NULL THEN
    INSERT INTO public.crm_records(collection,id,data) VALUES('contacts',contact_id_text,
      common_data||jsonb_build_object('id',contact_id_text,'clientId',client_id_text,'status','Active'));
  ELSIF nullif(c.data->>'clientId','') IS NULL THEN
    UPDATE public.crm_records SET data=data||jsonb_build_object('clientId',client_id_text)
    WHERE collection='contacts' AND id=contact_id_text;
  END IF;
  IF cl.id IS NULL THEN
    INSERT INTO public.crm_records(collection,id,data) VALUES('clients',client_id_text,
      common_data||jsonb_build_object('id',client_id_text,'contactId',contact_id_text,'status','Prospect'));
  ELSIF nullif(cl.data->>'contactId','') IS NULL THEN
    UPDATE public.crm_records SET data=data||jsonb_build_object('contactId',contact_id_text)
    WHERE collection='clients' AND id=client_id_text;
  END IF;

  lead_data:=common_data - 'name' || jsonb_build_object('id',lead_id_text,'number',lead_number,
    'contactId',contact_id_text,'clientId',client_id_text,'stage','New Lead','priority','Normal',
    'service',coalesce(e.required_service,'Website enquiry'),'value',0,'nextFollowUp',follow_up_time,
    'notes',coalesce(e.message,''),'requirements',coalesce(e.message,''));
  INSERT INTO public.crm_records(collection,id,data) VALUES('leads',lead_id_text,lead_data);
  INSERT INTO public.crm_records(collection,id,data) VALUES('tasks','task-web-'||e.id::text,
    jsonb_build_object('id','task-web-'||e.id::text,'leadId',lead_id_text,
      'contactId',contact_id_text,'clientId',client_id_text,'title','Follow up '||lead_number,
      'notes',coalesce(e.message,''),'category','Sales','status','Pending','priority','Normal',
      'assignedTo','','dueAt',follow_up_time,'createdAt',created_time));
  UPDATE public.website_enquiries SET status='processed',processed_at=now(),
    crm_lead_id=lead_id_text,crm_contact_id=contact_id_text,crm_client_id=client_id_text,
    crm_intake_version=1,crm_intake_error=NULL WHERE id=e.id;
  RETURN jsonb_build_object('status','processed','enquiry_id',e.id,'lead_id',lead_id_text,
    'contact_id',contact_id_text,'client_id',client_id_text,'replayed',false,'schema_version',1);
END;
$function$;


-- Replay only website enquiries rejected solely by the old contact-detail check.
do $replay$
declare
  enquiry record;
  outcome jsonb;
begin
  for enquiry in
    select id from public.website_enquiries
    where status = 'failed'
      and crm_intake_error = 'conflicting_contact_details'
      and crm_lead_id is null
    order by submitted_at, id
  loop
    outcome := private.crm_process_website_intake(enquiry.id);
    if outcome->>'status' <> 'processed' then
      raise exception 'Website enquiry % still needs review: %', enquiry.id, outcome->>'reason';
    end if;
  end loop;
end $replay$;
