BEGIN;
CREATE TABLE public.ovrendi_laser_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES public.accounts,job_id uuid NOT NULL REFERENCES public.jobs,
 quote_id uuid NOT NULL REFERENCES public.billet_laser_quotes,machine_id uuid NOT NULL REFERENCES public.machines,
 recorded_by uuid NOT NULL REFERENCES auth.users,recorded_at timestamptz NOT NULL DEFAULT now(),completed_on date NOT NULL,
 run_ref text NOT NULL CHECK(length(trim(run_ref)) BETWEEN 1 AND 100),program text NOT NULL CHECK(length(trim(program)) BETWEEN 1 AND 200),
 entry_method text NOT NULL CHECK(entry_method IN ('manual','csv')),cut_minutes numeric NOT NULL CHECK(cut_minutes BETWEEN 0 AND 1000000),
 elapsed_minutes numeric NOT NULL CHECK(elapsed_minutes BETWEEN cut_minutes AND 1000000 AND elapsed_minutes>0),
 sheets numeric NOT NULL CHECK(sheets BETWEEN 0 AND 100000),good_parts integer NOT NULL CHECK(good_parts BETWEEN 0 AND 10000000),
 gas_type text,gas_m3 numeric CHECK(gas_m3 BETWEEN 0 AND 10000000), energy_kwh numeric CHECK(energy_kwh BETWEEN 0 AND 10000000),
 gas_source text CHECK(gas_source IN ('meter','operator')), energy_source text CHECK(energy_source IN ('meter','operator')),
 CHECK((gas_m3 IS NULL)=(gas_source IS NULL)),CHECK(gas_m3 IS NULL OR length(trim(coalesce(gas_type,'')))>0),CHECK((energy_kwh IS NULL)=(energy_source IS NULL))
);
CREATE UNIQUE INDEX ovrendi_laser_run_identity ON public.ovrendi_laser_runs(account_id,machine_id,lower(trim(run_ref)));
CREATE INDEX ovrendi_laser_run_job ON public.ovrendi_laser_runs(account_id,job_id);
ALTER TABLE public.ovrendi_laser_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_laser_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.ovrendi_laser_runs TO service_role;
CREATE FUNCTION public.ovrendi_record_laser_run(a uuid,u uuid,j uuid,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q uuid; rid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=a AND user_id=u AND role IN ('owner','admin','manager','operator')) OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=a AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Production operator access required');END IF;
 SELECT t.quote_id INTO q FROM public.ovrendi_job_tracking t JOIN public.billet_laser_quotes b ON b.id=t.quote_id AND b.account_id=t.account_id WHERE t.account_id=a AND t.job_id=j AND b.status='accepted';
 IF q IS NULL THEN RETURN jsonb_build_object('error','Choose a job linked to an accepted quote');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.machines WHERE id=(d->>'machine_id')::uuid AND account_id=a) THEN RETURN jsonb_build_object('error','Choose a machine in this shop');END IF;
 INSERT INTO public.ovrendi_laser_runs(account_id,job_id,quote_id,machine_id,recorded_by,completed_on,run_ref,program,entry_method,cut_minutes,elapsed_minutes,sheets,good_parts,gas_type,gas_m3,gas_source,energy_kwh,energy_source)
 VALUES(a,j,q,(d->>'machine_id')::uuid,u,(d->>'completed_on')::date,trim(d->>'run_ref'),trim(d->>'program'),d->>'entry_method',(d->>'cut_minutes')::numeric,(d->>'elapsed_minutes')::numeric,(d->>'sheets')::numeric,(d->>'good_parts')::integer,d->>'gas_type',(d->>'gas_m3')::numeric,d->>'gas_source',(d->>'energy_kwh')::numeric,d->>'energy_source') ON CONFLICT DO NOTHING RETURNING id INTO rid;
 IF rid IS NULL THEN RETURN jsonb_build_object('error','This run reference already exists for this machine');END IF;
 RETURN jsonb_build_object('id',rid,'quote_id',q,'job_id',j);
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_record_laser_run(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_record_laser_run(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
