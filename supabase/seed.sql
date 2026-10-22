-- Best Value: development seed data
-- Starter catalog so the site has something to show locally.
-- Real catalog comes from the supplier feed importer + admin panel.

insert into public.categories (name, slug, can_sell, can_buy, coming_soon, sort_order) values
  ('Smartphones',     'phone',          true, true,  false, 1),
  ('Tablets',         'tablet',         true, true,  false, 2),
  ('Smartwatches',    'smartwatch',     true, true,  false, 3),
  ('Laptops',         'laptop',         true, true,  true,  4),
  ('Earbuds',         'earbuds',        true, true,  false, 5),
  ('TVs',             'tv',             true, false, true,  6),
  ('Cameras',         'camera',         true, false, true,  7),
  ('Gaming Consoles', 'gaming-console', true, true,  false, 8);

insert into public.brands (name, slug, sort_order) values
  ('Apple', 'apple', 1), ('Samsung', 'samsung', 2), ('Xiaomi', 'xiaomi', 3),
  ('OnePlus', 'oneplus', 4), ('Google', 'google', 5), ('vivo', 'vivo', 6),
  ('OPPO', 'oppo', 7), ('Motorola', 'motorola', 8), ('Realme', 'realme', 9),
  ('Nothing', 'nothing', 10);

-- Sample devices + variants (prices are placeholders, INR)
with phone as (select id from public.categories where slug = 'phone'),
     apple as (select id from public.brands where slug = 'apple'),
     samsung as (select id from public.brands where slug = 'samsung')
insert into public.devices (category_id, brand_id, name, slug, release_year, is_top_selling)
select phone.id, apple.id, 'iPhone 15', 'iphone-15', 2023, true from phone, apple
union all
select phone.id, apple.id, 'iPhone 14', 'iphone-14', 2022, true from phone, apple
union all
select phone.id, samsung.id, 'Galaxy S23', 'galaxy-s23', 2023, true from phone, samsung;

insert into public.device_variants (device_id, label, slug, ram_gb, storage_gb, base_buy_price)
select d.id, v.label, v.slug, v.ram, v.storage, v.price
from public.devices d
join (values
  ('iphone-15',  '6 GB / 128 GB', '6-gb-128-gb', 6, 128, 42000),
  ('iphone-15',  '6 GB / 256 GB', '6-gb-256-gb', 6, 256, 47000),
  ('iphone-14',  '6 GB / 128 GB', '6-gb-128-gb', 6, 128, 33000),
  ('galaxy-s23', '8 GB / 128 GB', '8-gb-128-gb', 8, 128, 30000),
  ('galaxy-s23', '8 GB / 256 GB', '8-gb-256-gb', 8, 256, 33500)
) as v(device_slug, label, slug, ram, storage, price) on v.device_slug = d.slug;

-- Phone evaluation questions (Best Value's own wording)
do $$
declare
  phone_id bigint := (select id from public.categories where slug = 'phone');
  q bigint;
begin
  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'question', 'yes_no', 'Does the phone switch on and work normally?', 'It should boot up and respond without restarting on its own.', 1)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Yes', 'flat', 0, 1), (q, 'No', 'percent', 60, 2);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'question', 'yes_no', 'Can you make and receive calls with a SIM?', 'Test calling to confirm network and signal work.', 2)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Yes', 'flat', 0, 1), (q, 'No', 'percent', 25, 2);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'question', 'yes_no', 'Is the display the one that came with the phone?', 'Answer No if the screen was replaced outside an authorised service centre.', 3)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Yes', 'flat', 0, 1), (q, 'No', 'percent', 15, 2);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'question', 'yes_no', 'Do you have the GST purchase invoice?', 'The invoice should show the same IMEI as the phone.', 4)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Yes', 'flat', 0, 1), (q, 'No', 'flat', 1500, 2);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'defect', 'multi', 'Select any visible damage', 'Pick all that apply. Skip if the phone has none.', 10)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Cracked screen glass', 'percent', 20, 1),
         (q, 'Dents on the frame', 'percent', 8, 2),
         (q, 'Cracked back panel', 'percent', 10, 3),
         (q, 'Spots or lines on display', 'percent', 25, 4);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'functional', 'multi', 'Select anything that does not work', 'Pick all that apply.', 20)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Front camera', 'flat', 2000, 1), (q, 'Back camera', 'flat', 3000, 2),
         (q, 'Speaker', 'flat', 1200, 3), (q, 'Microphone', 'flat', 1200, 4),
         (q, 'Face ID / fingerprint', 'flat', 2500, 5), (q, 'Wi-Fi or Bluetooth', 'flat', 1500, 6),
         (q, 'Charging port', 'flat', 1500, 7), (q, 'Battery health below 80%', 'flat', 2000, 8);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'accessory', 'multi', 'Which original accessories do you have?', 'Having the box and charger adds to your price.', 30)
  returning id into q;
  -- Missing-accessory deductions are applied for options NOT selected (see pricing engine)
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Original box', 'flat', 500, 1), (q, 'Original charger', 'flat', 400, 2);

  insert into public.evaluation_questions (category_id, section, input_type, title, help_text, sort_order)
  values (phone_id, 'age', 'single', 'How old is the phone?', 'Count from the date on the purchase invoice.', 40)
  returning id into q;
  insert into public.evaluation_options (question_id, label, deduction_type, deduction_value, sort_order)
  values (q, 'Under 3 months', 'percent', 0, 1), (q, '3 to 6 months', 'percent', 3, 2),
         (q, '6 to 11 months', 'percent', 6, 3), (q, 'Over 11 months', 'percent', 10, 4);
end $$;

insert into public.faqs (question, answer, sort_order) values
  ('How does selling to Best Value work?', 'Choose your device, answer a few questions about its condition and you get an instant price. Book a free pickup and get paid when our agent checks the device.', 1),
  ('What do I need to keep ready for pickup?', 'A valid government photo ID and the device with any accessories you listed. Remove your screen lock and sign out of iCloud or Google first.', 2),
  ('How will I receive my money?', 'By UPI, bank transfer or cash, whichever you choose while booking. Payment is made at pickup once the device check is done.', 3),
  ('Can the final price change?', 'Only if the device condition differs from your answers. Our agent explains any change before you accept.', 4),
  ('Do products bought from Best Value come with a GST invoice?', 'Yes. Every store order includes a GST invoice, and you can add your GSTIN at checkout.', 5);

-- Sample store products (placeholders; real stock comes from feeds + admin)
insert into public.products (sku, title, slug, description, category_id, brand_id, device_variant_id, condition, mrp, price, gst_rate, hsn_code, stock)
select v.sku, v.title, v.slug, v.description, c.id, b.id, dv.id, v.condition::public.product_condition, v.mrp, v.price, 18, '8517', v.stock
from (values
  ('BV-IP15-128-SUP', 'Apple iPhone 15 (6 GB / 128 GB) Refurbished Superb', 'apple-iphone-15-128gb-superb',
   'Fully tested, battery health above 90%, no visible marks. Includes a charging cable.', 'phone', 'apple', 'iphone-15', '6-gb-128-gb', 'refurbished_superb', 69900, 52999, 4),
  ('BV-IP14-128-GD', 'Apple iPhone 14 (6 GB / 128 GB) Refurbished Good', 'apple-iphone-14-128gb-good',
   'Fully tested. Light signs of use on the frame. Battery health above 85%.', 'phone', 'apple', 'iphone-14', '6-gb-128-gb', 'refurbished_good', 59900, 39999, 6),
  ('BV-S23-256-SUP', 'Samsung Galaxy S23 (8 GB / 256 GB) Refurbished Superb', 'samsung-galaxy-s23-256gb-superb',
   'Fully tested, screen in excellent condition, original-quality charger included.', 'phone', 'samsung', 'galaxy-s23', '8-gb-256-gb', 'refurbished_superb', 84999, 41999, 3),
  ('BV-S23-128-FR', 'Samsung Galaxy S23 (8 GB / 128 GB) Refurbished Fair', 'samsung-galaxy-s23-128gb-fair',
   'Works perfectly. Visible scratches on the back panel, priced to match.', 'phone', 'samsung', 'galaxy-s23', '8-gb-128-gb', 'refurbished_fair', 74999, 29999, 0)
) as v(sku, title, slug, description, category_slug, brand_slug, device_slug, variant_slug, condition, mrp, price, stock)
join public.categories c on c.slug = v.category_slug
join public.brands b on b.slug = v.brand_slug
join public.devices d on d.slug = v.device_slug and d.brand_id = b.id
join public.device_variants dv on dv.device_id = d.id and dv.slug = v.variant_slug;
