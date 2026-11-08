import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ojfoofojcpabqegxmsab.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
