-- A session keeps the title it had in the plan when it was assigned (the plan may be edited afterwards).
alter table plan_sessions add column title text;
