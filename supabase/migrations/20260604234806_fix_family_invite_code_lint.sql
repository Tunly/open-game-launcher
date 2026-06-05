-- Avoid plpgsql shadowed-variable warnings from the integer FOR loop variable.
create or replace function public.generate_family_invite_code() returns text
language plpgsql
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  code_index integer;
begin
  for code_index in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;
