/** Preserved prototype views/chat. Live services will replace browser mutations in runtime.js. */
export function createChat(ctx) {
  function renderChatPerson(u, overlay = false) {
    const unread = ctx.chatUnreadFor(u.id),
      selected =
        (overlay ? ctx.ui.chatThreadUserId : ctx.ui.chatSelectedUserId) ===
        u.id;
    return `<button class="chat-person ${selected ? "active" : ""}" data-action="${overlay ? "open-chat-thread" : "select-chat-user"}" data-id="${u.id}"><span class="chat-avatar"><span class="avatar">${ctx.esc(u.avatar)}</span><span class="chat-online"></span></span><span class="grow" style="min-width:0"><span class="chat-person-name">${ctx.esc(u.name)}</span><span class="chat-preview">${ctx.esc(ctx.chatPreview(u.id))}</span></span>${unread ? `<span class="chat-unread">${unread > 9 ? "9+" : unread}</span>` : ""}</button>`;
  }

  function renderChatDirectory(overlay = false) {
    const users = ctx.chatSortedUsers();
    return `<section class="chat-directory"><div class="chat-directory-head"><div class="row gap8" style="justify-content:space-between"><h3>${overlay ? "Chats" : "Conversations"}</h3>${overlay ? `<button class="btn ghost sm" data-page="chat">Open Chat</button>` : ""}</div><div class="field"><input class="input" placeholder="Search people" value="${ctx.attr(ctx.ui.chatSearch)}" data-filter="chatSearch" data-focus="chat-search"></div></div><div class="chat-people">${users.length ? users.map((u) => ctx.renderChatPerson(u, overlay)).join("") : `<div class="empty">No active staff match your search.</div>`}</div></section>`;
  }

  function renderChatAttachment(a) {
    const imageFile = String(a.type || "").startsWith("image/");
    return `<a class="chat-file" href="${ctx.attr(a.dataUrl)}" download="${ctx.attr(a.name)}" title="Download ${ctx.attr(a.name)}">${imageFile ? `<img src="${ctx.attr(a.dataUrl)}" alt="${ctx.attr(a.name)}">` : ctx.icon("file", "sm")}<span class="chat-file-meta"><span class="chat-file-name">${ctx.esc(a.name)}</span><span class="small">${ctx.esc(ctx.formatFileSize(a.size || 0))}</span></span></a>`;
  }

  function renderChatComposer(target, prefix) {
    const drafts = ctx.ui.chatAttachmentDrafts || [];
    return `<div class="chat-composer">${drafts.length ? `<div class="chat-drafts">${drafts.map((a) => `<span class="chat-draft">${ctx.icon("paperclip", "sm")} ${ctx.esc(a.name)}<button data-action="remove-chat-attachment" data-id="${a.id}" aria-label="Remove ${ctx.attr(a.name)}">${ctx.icon("x", "sm")}</button></span>`).join("")}</div>` : ""}<div class="chat-compose-row"><button class="btn ghost icon-only chat-attach" data-action="chat-attach" aria-label="Attach files" title="Attach files">${ctx.icon("paperclip")}</button><input class="hidden" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" data-chat-files><textarea class="textarea" rows="1" placeholder="Message ${ctx.attr(target.name)}" data-chat-message data-focus="chat-message-${prefix}">${ctx.esc(ctx.ui.chatMessage)}</textarea><button class="btn icon-only" data-action="send-chat" data-id="${target.id}" aria-label="Send message">${ctx.icon("arrow")}</button></div><div class="chat-limit">Enter to send · up to 3 attachments · 1.5 MB total</div></div>`;
  }

  function renderChatThread(target, overlay = false) {
    if (!target)
      return `<section class="chat-main"><div class="chat-empty-thread">${ctx.icon("chat", "lg")}<div><h3>Choose a conversation</h3><p>Select an active staff member to start chatting.</p></div></div></section>`;
    const messages = ctx.chatMessagesWith(target.id),
      prefix = overlay ? "dock" : "page";
    return `<section class="chat-main ${!overlay && ctx.ui.chatSelectedUserId ? "active" : ""}"><header class="chat-thread-head"><button class="btn ghost icon-only sm" data-action="${overlay ? "chat-back" : "close-page-chat"}" aria-label="Back to conversations" title="Back to conversations" style="transform:rotate(180deg)">${ctx.icon("arrow", "sm")}</button><span class="avatar">${ctx.esc(target.avatar)}</span><div class="grow"><div class="chat-thread-title">${ctx.esc(target.name)}</div><div class="chat-thread-status">Active · ${ctx.esc(ctx.roleLabel(target.role))}</div></div>${overlay ? `<button class="btn ghost icon-only sm" data-page="chat" aria-label="Open full Chat" title="Open full Chat">${ctx.icon("chat", "sm")}</button><button class="btn ghost icon-only sm" data-action="close-chat-dock" aria-label="Close chat">${ctx.icon("x", "sm")}</button>` : ""}</header><div class="chat-messages" data-chat-scroll>${
      messages.length
        ? messages
            .map((m) => {
              const own = m.senderId === ctx.currentUser()?.id,
                sender = ctx.state.users.find((u) => u.id === m.senderId);
              return `<div class="chat-message ${own ? "own" : ""}"><span class="avatar">${ctx.esc(sender?.avatar || "?")}</span><div class="chat-bubble">${m.text ? `<div class="chat-text">${ctx.esc(m.text)}</div>` : ""}${m.attachments?.length ? `<div class="chat-files">${m.attachments.map(ctx.renderChatAttachment).join("")}</div>` : ""}<div class="chat-time">${ctx.fmt(m.createdAt, true)}</div></div></div>`;
            })
            .join("")
        : `<div class="chat-empty-thread">${ctx.icon("chat", "lg")}<div><h3>Start the conversation</h3><p>Messages and attachments stay in this standalone prototype.</p></div></div>`
    }</div>${ctx.renderChatComposer(target, prefix)}</section>`;
  }

  function renderChat() {
    const users = ctx.chatUsers(),
      selected =
        users.find((u) => u.id === ctx.ui.chatSelectedUserId) ||
        users[0] ||
        null;
    return `${ctx.header("TEAM CHAT", "Keep every staff conversation close to the work.", "Message active team members and exchange photos, PDFs and documents. Chat also stays available as a bottom overlay while you work.")}<div class="card chat-workspace">${ctx.renderChatDirectory(false)}${ctx.renderChatThread(selected, false)}</div>`;
  }

  function renderChatDock() {
    if (!ctx.allowedPage("chat")) return "";
    const users = ctx.chatUsers(),
      target = users.find((u) => u.id === ctx.ui.chatThreadUserId) || null,
      unread = ctx.chatUnreadCount(),
      panel = target
        ? ctx.renderChatThread(target, true)
        : ctx.ui.chatDockOpen
          ? ctx.renderChatDirectory(true)
          : "";
    return `<aside class="chat-dock" aria-label="Team chat">${panel ? `<div class="chat-popover">${panel}</div>` : ""}<button class="chat-launcher" data-action="toggle-chat-dock" aria-expanded="${Boolean(panel)}">${ctx.icon("chat")}<span>Chat</span>${unread ? `<span class="chat-unread">${unread > 9 ? "9+" : unread}</span>` : ""}</button></aside>`;
  }
  return {
    renderChatPerson,
    renderChatDirectory,
    renderChatAttachment,
    renderChatComposer,
    renderChatThread,
    renderChat,
    renderChatDock,
  };
}
