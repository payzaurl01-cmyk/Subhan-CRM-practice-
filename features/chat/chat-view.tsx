"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Info, MoreHorizontal, Paperclip, Phone, Search, Send, Smile, Video } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const conversations = [
  { id: "ops", initials: "OP", name: "Operations team", preview: "Mike: Installation photos uploaded", time: "2m", unread: 3, online: true },
  { id: "job", initials: "J2", name: "JOB-2048 · Williams", preview: "Tom: Stock is ready for collection", time: "18m", unread: 0, online: true },
  { id: "sarah", initials: "SC", name: "Sarah Chen", preview: "I’ll call the customer this afternoon", time: "42m", unread: 0, online: true },
  { id: "warehouse", initials: "WH", name: "Warehouse team", preview: "New goods receipt GRN-188", time: "1h", unread: 0, online: false },
  { id: "mike", initials: "MK", name: "Mike Khan", preview: "All done at the Roberts job", time: "2h", unread: 0, online: false },
];

type Message = { id: string; mine?: boolean; name?: string; body: string; time: string; attachment?: string };

const initialMessages: Message[] = [
  { id: "1", name: "Sarah Chen", body: "Morning team — the Williams shutters are confirmed for tomorrow. Is the full order ready?", time: "09:18" },
  { id: "2", name: "Tom Adams", body: "Yes, all frame and panel stock is picked. I’m just finishing the hardware check.", time: "09:22" },
  { id: "3", mine: true, body: "Perfect. Mike, you can collect from the main warehouse after 3pm.", time: "09:25" },
  { id: "4", name: "Mike Khan", body: "Got it. I’ve also uploaded the completion photos from the Roberts installation.", time: "09:31", attachment: "4 installation photos" },
  { id: "5", mine: true, body: "Thanks Mike — I’ll review those now.", time: "09:34" },
];

export function ChatView() {
  const [messages, setMessages] = useState(initialMessages);
  const [value, setValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const channel = supabase
      .channel("chat:operations-team")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        // The selected conversation is refreshed by its server query in the connected app.
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  function sendMessage() {
    const body = value.trim();
    if (!body) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), mine: true, body, time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()) }]);
    setValue("");
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  return (
    <div className="chat-page panel">
      <aside className="conversation-list"><div className="conversation-title"><div><h2>Team chat</h2><p>3 unread messages</p></div><button className="primary-icon">+</button></div><label><Search size={16}/><input placeholder="Search conversations…"/></label><nav>{conversations.map((conversation, index) => <button className={index === 0 ? "active" : ""} key={conversation.id}><span className="chat-avatar">{conversation.initials}<i className={conversation.online ? "online" : ""}/></span><span><b>{conversation.name}</b><small>{conversation.preview}</small></span><em>{conversation.time}{conversation.unread > 0 && <i>{conversation.unread}</i>}</em></button>)}</nav></aside>
      <section className="message-pane"><header><div><span className="chat-avatar">OP<i className="online"/></span><p><strong>Operations team</strong><small>8 members · 4 online</small></p></div><nav><button><Phone size={18}/></button><button><Video size={19}/></button><button><Info size={19}/></button><button><MoreHorizontal size={19}/></button></nav></header><div className="message-scroll"><div className="day-divider"><span>Today</span></div>{messages.map((message) => <div className={`message-row ${message.mine ? "mine" : ""}`} key={message.id}>{!message.mine && <span className="chat-avatar small">{message.name?.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>}<div>{message.name && !message.mine && <b>{message.name}</b>}<p>{message.body}</p>{message.attachment && <button className="chat-attachment"><ImagePlus size={18}/><span><strong>{message.attachment}</strong><small>Private job attachment</small></span></button>}<small>{message.time} {message.mine && "✓✓"}</small></div></div>)}<div ref={bottomRef}/></div><footer><button><Paperclip size={19}/></button><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendMessage(); }} placeholder="Write a message…"/><button><Smile size={19}/></button><button className="send-button" onClick={sendMessage}><Send size={17}/></button></footer></section>
    </div>
  );
}
