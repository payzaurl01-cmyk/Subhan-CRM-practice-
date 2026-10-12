import { isSupabaseConfigured } from "@/lib/supabase/config";

export function GET() {
  return Response.json({
    status: "ok",
    service: "interior-blinds-crm",
    supabaseConfigured: isSupabaseConfigured(),
  });
}
