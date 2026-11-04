# LDB Budget

A private, shared budget. The page is static (GitHub Pages); every number lives in Supabase behind Row Level
Security, so only signed-in people whose email is on the members list can read or change anything.

- `setup.sql` creates the tables, the members list and the access rules. Run it once in Supabase's SQL Editor
  (it is safe to run again).
- `?demo` opens the page with made-up sample numbers and nothing saved, for trying it out.
- The publishable key in `app.js` is meant to be public. Never put the secret / service_role key in this repo.
