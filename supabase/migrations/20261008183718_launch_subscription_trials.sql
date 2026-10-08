-- Preserve standalone Quoting when a trial converts to a paid subscription.
CREATE OR REPLACE FUNCTION public.billet_sync_subscription(p_event jsonb, p_subscription jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  acc public.accounts%ROWTYPE;
  event_time bigint := (p_event->>'created')::bigint;
  chosen_plan text := p_subscription#>>'{metadata,plan}';
  state text := p_subscription->>'status';
  module_limit int;
  chosen_modules text[];
  all_modules text[] := ARRAY['production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service'];
BEGIN
  IF state NOT IN ('active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused')
     OR p_subscription->>'id' IS NULL OR p_subscription->>'customer' IS NULL THEN
    RAISE EXCEPTION 'Invalid subscription';
  END IF;
  SELECT * INTO acc FROM public.accounts WHERE id=(p_subscription#>>'{metadata,account_id}')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ignored',true); END IF;
  IF acc.stripe_customer_id IS NOT NULL AND acc.stripe_customer_id<>p_subscription->>'customer' THEN
    RAISE EXCEPTION 'Billing customer mismatch';
  END IF;
  IF acc.stripe_subscription_id IS NOT NULL AND acc.stripe_subscription_id<>p_subscription->>'id'
     AND coalesce(acc.billing_status,'') NOT IN ('canceled','incomplete_expired') THEN
    RAISE EXCEPTION 'Conflicting subscription';
  END IF;
  IF event_time < acc.stripe_event_created THEN RETURN jsonb_build_object('stale',true); END IF;
  module_limit := CASE chosen_plan WHEN 'starter' THEN 1 WHEN 'growth' THEN 3 WHEN 'suite' THEN 9 ELSE 0 END;
  IF module_limit=0 THEN RAISE EXCEPTION 'Invalid plan'; END IF;
  INSERT INTO public.billet_billing_events(event_id,event_type,event_created)
    VALUES(p_event->>'id',p_event->>'type',event_time) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate',true); END IF;
  SELECT array_agg(m ORDER BY first_position) INTO chosen_modules FROM (
    SELECT m,min(ord) AS first_position FROM unnest(coalesce(acc.modules,'{}') || all_modules) WITH ORDINALITY AS x(m,ord)
    WHERE (m=ANY(all_modules) OR m='laser-quoting') GROUP BY m ORDER BY min(ord) LIMIT module_limit
  ) selected;
  -- Launch plans promise only the currently available tools. Older subscriptions retain their selection.
  IF p_subscription#>>'{metadata,price_version}'='launch-2026-10' THEN
    IF chosen_plan='starter' THEN chosen_modules:=ARRAY['laser-quoting'];
    ELSIF chosen_plan='growth' THEN chosen_modules:=ARRAY['production-board','job-costing','shop-traveler'];
    END IF;
  END IF;
  UPDATE public.accounts SET
    stripe_customer_id=p_subscription->>'customer', stripe_subscription_id=p_subscription->>'id',
    billing_status=state, billing_cancel_at_period_end=coalesce((p_subscription->>'cancel_at_period_end')::boolean,false),
    billing_period_end=to_timestamp((p_subscription->>'current_period_end')::double precision),
    stripe_event_created=event_time,
    plan=CASE WHEN state IN ('active','trialing') THEN chosen_plan ELSE plan END,
    modules=CASE WHEN state IN ('active','trialing') THEN chosen_modules ELSE modules END,
    trial_ends_at=CASE WHEN state='trialing' THEN (to_timestamp((p_subscription->>'trial_end')::double precision) AT TIME ZONE 'UTC')::date WHEN state='active' THEN NULL ELSE trial_ends_at END
  WHERE id=acc.id;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.billet_sync_subscription(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billet_sync_subscription(jsonb,jsonb) TO service_role;
