// =====================================================================
// SUPABASE CONNECTION SETTINGS
// Fill these in after creating your Supabase project and running
// supabase/schema.sql — see SUPABASE_SETUP.md for the full walkthrough.
//
// Project Settings → API in your Supabase dashboard has both values.
// The "anon public" key is safe to put in client-side code like this;
// it only grants what the Row Level Security policies in schema.sql
// allow (public read, public insert on messages/analytics, and
// everything else locked to a logged-in admin).
// =====================================================================
window.SUPABASE_CONFIG = {
  url: '',      // e.g. 'https://ffhvtwlbtawdiajeouzd.supabase.co'
  anonKey: ''   // e.g. 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmaHZ0d2xidGF3ZGlhamVvdXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2OTc3NTUsImV4cCI6MjEwNzI3Mzc1NX0.T2b133FyakhWS3xDBRzWYDxYVh3DiuGxQnQg6L_DJKE' (the long "anon public" key)
};
