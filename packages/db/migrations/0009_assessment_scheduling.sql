-- A test can be scheduled for a player before there is a result (spec 3.F.2): a row with `scheduled_on` and no value is a
-- scheduled test, and recording the result fills `value` and `recorded_at`. A result with no schedule is an ad-hoc one.

alter table assessment_results
  alter column value drop not null,
  add column scheduled_on date,
  add constraint assessment_results_value_or_scheduled check (value is not null or scheduled_on is not null);

create index assessment_results_scheduled_on_idx on assessment_results (player_id, scheduled_on) where scheduled_on is not null;
