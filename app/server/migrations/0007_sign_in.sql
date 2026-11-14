-- Signing in (L-01; plans/architecture.md §7, decision 004): email codes,
-- sessions, and, from M1-3, Google. Better Auth reads and writes these
-- tables; server/src/sign-in.ts maps its names onto ours.
--
-- The person stays `public.account`, with what Better Auth needs added.
-- Everything else sign-in keeps is in its own schema, `sign_in`, apart from
-- the board: unlike board content (invariant 6), its rows really are deleted
-- (a used code, an ended session), and account deletion (M1-12) empties it
-- for a person in one place.
--
-- Additive only, so the code already running keeps working (AGENTS.md rule 7).

-- A new account exists from its first sign-in, before its person has picked
-- a username, so the username is empty until then. Test users and accounts
-- made before sign-in have no email.
alter table account alter column username drop not null;
alter table account
  add column email          text,
  add column email_verified boolean not null default false,
  -- Better Auth requires a name. Steelman doesn't ask for one: always empty.
  add column name           text not null default '',
  add column image          text,
  add column updated_at     timestamptz;

-- One account per address, whatever its capitals.
create unique index account_email_unique on account (lower(email));

create schema sign_in;

-- A signed-in browser. The cookie holds the token, signed; the token is kept
-- here as it is (Better Auth has no way to keep it hashed: architecture §7).
create table sign_in.session (
  id         text primary key,
  account_id text not null references account (id),
  token      text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index session_account on sign_in.session (account_id);

-- How a person can sign in besides an emailed code: Google, from M1-3.
-- Google's own tokens aren't kept; only who the person is there.
create table sign_in.sign_in_method (
  id               text primary key,
  account_id       text not null references account (id),
  provider         text not null,
  provider_subject text not null,
  created_at       timestamptz not null,
  updated_at       timestamptz not null,
  unique (provider, provider_subject)
);
create index sign_in_method_account on sign_in.sign_in_method (account_id);

-- Codes waiting to be typed in. The value holds the code hashed, and how many
-- wrong tries it has had. Gone once used, replaced, or cancelled.
create table sign_in.sign_in_code (
  id         text primary key,
  identifier text not null,
  value      text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
-- One code per address at a time: Better Auth cancels the old code by finding
-- that a new one can't be added beside it.
create unique index sign_in_code_identifier on sign_in.sign_in_code (identifier);

-- When a sign-in email was sent, to count them per address (5 an hour,
-- architecture §7). The address is kept only as a hash.
create table sign_in.sent_email (
  address_hash text not null,
  sent_at      timestamptz not null
);
create index sent_email_by_address on sign_in.sent_email (address_hash, sent_at);

grant usage on schema sign_in to steelman_app;
grant select, insert, update, delete on sign_in.session, sign_in.sign_in_method, sign_in.sign_in_code, sign_in.sent_email to steelman_app;
