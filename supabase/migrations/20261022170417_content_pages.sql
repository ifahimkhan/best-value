-- Phase 8: content pages.
-- * FAQs get a topic so the FAQ page can group them.
-- * contact_messages stores the contact form. Only the server (service role)
--   inserts, after validation and rate limiting; staff read and close them.

alter table public.faqs
  add column topic text not null default 'general'
    check (topic in ('selling', 'buying', 'payments', 'general'));

update public.faqs set topic = 'selling'  where sort_order in (1, 2, 4);
update public.faqs set topic = 'payments' where sort_order = 3;
update public.faqs set topic = 'buying'   where sort_order = 5;

insert into public.faqs (question, answer, sort_order, topic) values
  ('Which devices can I sell?',
   'Phones, tablets, smartwatches and earbuds from the brands listed on the Sell page. If your model is missing, write to us and we will tell you whether we can make an offer.', 6, 'selling'),
  ('Is the pickup really free?',
   'Yes. There is no pickup fee and nothing is deducted for transport. You only hand over the device once you accept the final price.', 7, 'selling'),
  ('What happens to my data?',
   'Please back up and erase your device before pickup. Every device we receive is wiped again with a full factory reset before it is checked, repaired or resold.', 8, 'selling'),
  ('Can I cancel a pickup?',
   'Yes, any time before the agent collects the device. Contact us with your order number and we will cancel it.', 9, 'selling'),
  ('What do the Superb, Good and Fair grades mean?',
   'Superb devices look close to new. Good devices show light signs of use. Fair devices have visible marks but work perfectly. Every grade passes the same functional checks.', 10, 'buying'),
  ('How do I track my order?',
   'Open the order in your account. Once it ships you will see the courier and tracking number there. Delivery time depends on your pincode.', 12, 'buying'),
  ('Which payment methods do you accept in the store?',
   'UPI, debit and credit cards, net banking and popular wallets through our payment partner Razorpay.', 13, 'payments'),
  ('When will I get my refund?',
   'Refunds go back to the original payment method. Your bank may take a few working days to show the credit after we send the refund.', 14, 'payments'),
  ('How do I reach customer support?',
   'Use the contact form or email us. Include your order number if your question is about an order so we can reply faster.', 15, 'general');

create table public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 2 and 80),
  email       text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  topic       text not null check (topic in ('sell', 'buy', 'order', 'other')),
  order_no    text check (order_no is null or order_no ~ '^[A-Z0-9-]{4,24}$'),
  message     text not null check (char_length(message) between 10 and 2000),
  user_id     uuid references public.profiles (id) on delete set null,
  handled_at  timestamptz,
  handled_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_email_idx on public.contact_messages (email, created_at);
create index contact_messages_user_idx on public.contact_messages (user_id);
create index contact_messages_handled_by_idx on public.contact_messages (handled_by);

alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (handled_at, handled_by) on public.contact_messages to authenticated;

create policy contact_messages_staff_read on public.contact_messages for select to authenticated
  using ((select private.is_staff()));
-- Staff may only close or reopen a message, recording themselves as the closer
create policy contact_messages_staff_update on public.contact_messages for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()) and (handled_by is null or handled_by = (select auth.uid())));
