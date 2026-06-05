-- The integer FOR loop variable is created by PL/pgSQL; declaring it first
-- triggers shadowed-variable and unused-variable lints.
create or replace function public.generate_family_invite_code() returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for code_index in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;
