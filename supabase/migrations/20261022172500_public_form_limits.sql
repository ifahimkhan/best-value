-- Phase 8 security review fixes.
-- * Newsletter signups now go through the server action only (validation,
--   honeypot, rate limits); the old direct anon insert path is closed.
-- * Both public forms store a hashed client key so the server can rate limit
--   per client instead of only per (attacker-chosen) email.
-- * Closing a contact message must record who closed it, and reopening clears both.

drop policy if exists newsletter_insert on public.newsletter_subscribers;
revoke insert on public.newsletter_subscribers from anon, authenticated;

alter table public.newsletter_subscribers
  add column client_hash text check (client_hash is null or client_hash ~ '^[0-9a-f]{64}$'),
  add constraint newsletter_email_normalised check (email = lower(email) and char_length(email) <= 254);
create index newsletter_subscribers_client_idx on public.newsletter_subscribers (client_hash, created_at);
create index newsletter_subscribers_created_idx on public.newsletter_subscribers (created_at);

alter table public.contact_messages
  add column client_hash text check (client_hash is null or client_hash ~ '^[0-9a-f]{64}$');
create index contact_messages_client_idx on public.contact_messages (client_hash, created_at);

drop policy contact_messages_staff_update on public.contact_messages;
create policy contact_messages_staff_update on public.contact_messages for update to authenticated
  using ((select private.is_staff()))
  with check (
    (select private.is_staff())
    and (
      (handled_at is null and handled_by is null)
      or (handled_at is not null and handled_by = (select auth.uid()))
    )
  );
