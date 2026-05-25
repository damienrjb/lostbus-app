create extension if not exists "pgcrypto";

create type public.user_role as enum ('driver', 'admin');
create type public.lost_item_status as enum ('found', 'stored', 'returned');
create type public.recovery_request_status as enum ('new', 'reviewing', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.user_role not null default 'driver',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lost_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in (
      'Téléphone',
      'Portefeuille',
      'Sac',
      'Clés',
      'Vêtements',
      'Documents',
      'Électronique',
      'Autre'
    )
  ),
  bus_line text not null,
  found_date date not null,
  found_time time not null,
  location text not null,
  note text,
  status public.lost_item_status not null default 'found',
  photo_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  lost_item_id uuid not null references public.lost_items(id) on delete cascade,
  passenger_name text not null,
  passenger_email text not null,
  description text not null check (char_length(description) >= 12),
  request_status public.recovery_request_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lost_items_status_idx on public.lost_items(status);
create index lost_items_found_date_idx on public.lost_items(found_date desc);
create index lost_items_bus_line_idx on public.lost_items(bus_line);
create index lost_items_category_idx on public.lost_items(category);
create index recovery_requests_item_idx on public.recovery_requests(lost_item_id);
create index recovery_requests_status_idx on public.recovery_requests(request_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger lost_items_set_updated_at
before update on public.lost_items
for each row execute function public.set_updated_at();

create trigger recovery_requests_set_updated_at
before update on public.recovery_requests
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'driver'::public.user_role)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_user_role() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.lost_items enable row level security;
alter table public.recovery_requests enable row level security;

create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_user_role() = 'admin');

create policy "profiles_update_admin_only"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "lost_items_select_staff"
on public.lost_items for select
to authenticated
using (public.current_user_role() in ('driver', 'admin'));

create policy "lost_items_insert_staff"
on public.lost_items for insert
to authenticated
with check (
  public.current_user_role() in ('driver', 'admin')
  and created_by = auth.uid()
);

create policy "lost_items_update_admin"
on public.lost_items for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "lost_items_delete_admin"
on public.lost_items for delete
to authenticated
using (public.current_user_role() = 'admin');

create policy "recovery_requests_insert_public"
on public.recovery_requests for insert
to anon, authenticated
with check (request_status = 'new');

create policy "recovery_requests_select_admin"
on public.recovery_requests for select
to authenticated
using (public.current_user_role() = 'admin');

create policy "recovery_requests_update_admin"
on public.recovery_requests for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "recovery_requests_delete_admin"
on public.recovery_requests for delete
to authenticated
using (public.current_user_role() = 'admin');

create or replace view public.public_lost_items as
select
  id,
  category,
  bus_line,
  found_date,
  found_time,
  location,
  status,
  photo_path,
  created_at
from public.lost_items
where status in ('found', 'stored');

grant select on public.public_lost_items to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lost-item-photos',
  'lost-item-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "lost_item_photos_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'lost-item-photos');

create policy "lost_item_photos_staff_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'lost-item-photos'
  and public.current_user_role() in ('driver', 'admin')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "lost_item_photos_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'lost-item-photos'
  and public.current_user_role() = 'admin'
);
