# Admin and Manager Roles

Roles live in `auth.users.raw_app_meta_data.role` (the JWT's `app_metadata`).
Users cannot edit app metadata themselves. The app ignores any `role` in
`user_metadata`, because users can change that field from the client.

The database schema comes only from `supabase/migrations/`. Do not run ad-hoc
SQL from old guides against production.

## Roles

| Role | Can do |
|------|--------|
| `admin` | Everything, including granting roles, banning users and the billing ledger |
| `manager` | Create and run tournaments and leagues, add scorers and co-managers |
| (none) | Register for tournaments and leagues, score matches they are assigned to, practice |

Granting `manager` starts a 30-day trial row in `manager_subscriptions`.

## Granting a role

**In the app (normal way):** sign in as an admin, open **Admin**, find the
user and pick the role. This calls the `set_user_role_secure` RPC, which
checks that the caller is an admin and writes an `admin_audit_log` entry.

**First admin on a fresh project:** no admin exists yet to use the app, so run
this once in the Supabase SQL editor (it runs as `postgres`):

```sql
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{role}', '"admin"')
WHERE lower(email) = lower('you@example.com');
```

The user has to sign out and back in (or wait for the token refresh) before
the new role shows up in their session.

## Removing a role

Use the Admin screen, or call `set_user_role_secure(email, NULL)` as an admin.
