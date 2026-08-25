import { createClient } from '@supabase/supabase-js'

// anon 키는 공개용(RLS로 보호)이므로 소스에 기본값으로 포함.
// 필요 시 Cloudflare Pages 대시보드의 Environment variables(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)로 오버라이드 가능.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ubwccmgpoghfecmgiici.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVid2NjbWdwb2doZmVjbWdpaWNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDA1NTUsImV4cCI6MjA5MTc3NjU1NX0.819QS_NomYEx_kPYsOPCMvpGkjZExG6GsG9FFsKVNA4'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
