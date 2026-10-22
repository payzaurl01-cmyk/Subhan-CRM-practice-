import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { makeHandler } from "./handler.mjs";

Deno.serve(makeHandler({ createClient, env: (name: string) => Deno.env.get(name) }));
