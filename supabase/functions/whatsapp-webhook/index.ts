import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

serve(async (req) => {
  const { method } = req

  // --- 1. Handle Meta Verification (GET) ---
  if (method === "GET") {
    const url = new URL(req.url)
    const mode = url.searchParams.get("hub.mode")
    const token = url.searchParams.get("hub.verify_token")
    const challenge = url.searchParams.get("hub.challenge")

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED")
      return new Response(challenge, { status: 200 })
    }
    return new Response("Forbidden", { status: 403 })
  }

  // --- 2. Handle Incoming Messages (POST) ---
  if (method === "POST") {
    try {
      const body = await req.json()

      // Ensure this is a WhatsApp message notification
      if (body.object === "whatsapp_business_account") {
        const entry = body.entry?.[0]
        const changes = entry?.changes?.[0]
        const value = changes?.value

        // A. Handle Status Updates (sent, delivered, read, failed)
        if (value?.statuses?.[0]) {
          const statusObj = value.statuses[0]
          const messageId = statusObj.id
          const status = statusObj.status // e.g. "delivered", "read"
          
          console.log(`Status update for ${messageId}: ${status}`)

          const { error } = await supabase
            .from("whatsapp_logs")
            .update({ status: status.charAt(0).toUpperCase() + status.slice(1) })
            .eq("message_id", messageId)

          if (error) console.error("Status Update Error:", error)
          return new Response("STATUS_UPDATED", { status: 200 })
        }

        const message = value?.messages?.[0]
        const contact = value?.contacts?.[0]

        if (message) {
          const from = message.from // Sender's phone number
          const senderName = contact?.profile?.name || "WhatsApp User"
          let textContent = ""

          // Extract text based on message type
          if (message.type === "text") {
            textContent = message.text.body
          } else if (message.type === "button") {
            textContent = message.button.text
          } else if (message.type === "interactive") {
            const interactiveType = message.interactive.type
            if (interactiveType === "button_reply") {
              textContent = message.interactive.button_reply.title
            } else if (interactiveType === "list_reply") {
              textContent = message.interactive.list_reply.title
            }
          } else {
            textContent = `[Received ${message.type} message]`
          }

          console.log(`Saving message from ${from}: ${textContent}`)

          // Insert into whatsapp_logs
          const { error } = await supabase.from("whatsapp_logs").insert([
            {
              phone_number: from,
              recipient_name: senderName,
              message_content: textContent,
              status: "Received",
              message_type: "Incoming",
              stage: "Customer Reply",
              sender_name: senderName,
              is_read: false,
              message_id: message.id
            },
          ])

          if (error) {
            console.error("Database Insert Error:", error)
            return new Response("Error saving to DB", { status: 500 })
          }

          return new Response("EVENT_RECEIVED", { status: 200 })
        }
      }
      return new Response("Not a message", { status: 200 })
    } catch (err) {
      console.error("Webhook Processing Error:", err)
      return new Response("Internal Server Error", { status: 500 })
    }
  }

  return new Response("Method Not Allowed", { status: 405 })
})
