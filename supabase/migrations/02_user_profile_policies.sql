create policy "Select own profile"
on profiles
for select
using (auth.uid() = id);

CREATE POLICY "Allow insert for auth users"
ON save_modules
FOR INSERT
TO authenticated
USING (
  auth.uid() = user_id
)

create policy "Allow insert for authenticated users"
on modules
for insert
to authenticated
with check (auth.uid() = user_id);
