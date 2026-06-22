import { Loader2, MessageSquare, Plus, Send, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ChatMessage, ChatRoom } from "../../lib/types/profile";
import {
  createGroupChat,
  getGroupMessages,
  getMyGroupChats,
  sendGroupMessage,
  subscribeToGroupMessages,
  type GroupChatInfo,
} from "../../lib/supabase/social";

interface GroupChatPanelProps {
  currentUserId: string;
  friendIds: string[];
  profilesById?: Record<string, { username: string; displayName: string | null }>;
}

export function GroupChatPanel({
  currentUserId,
  friendIds,
  profilesById = {},
}: GroupChatPanelProps) {
  const [groups, setGroups] = useState<GroupChatInfo[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const loaded = await getMyGroupChats();
      setGroups(loaded);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!selectedGroup) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    void getGroupMessages(selectedGroup.id).then((msgs) => {
      if (isMounted) setMessages(msgs);
    });

    const unsubscribe = subscribeToGroupMessages(selectedGroup.id, (msg) => {
      if (isMounted) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [selectedGroup]);

  async function handleCreate() {
    if (!newGroupName.trim() || selectedMembers.length === 0) return;
    setLoading(true);
    try {
      const room = await createGroupChat(newGroupName, selectedMembers);
      setSelectedGroup(room);
      setShowCreate(false);
      setNewGroupName("");
      setSelectedMembers([]);
      await loadGroups();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!selectedGroup || !chatText.trim()) return;
    const text = chatText;
    setChatText("");
    try {
      const msg = await sendGroupMessage(selectedGroup.id, text);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      {/* Group list */}
      <div className="flex items-center justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#b7102a]" />
          <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
            Group Chats ({groups.length})
          </p>
        </div>
        <button
          className="neo-copy flex h-7 items-center gap-1 border-2 border-black bg-[#087d6d] px-2 text-[9px] font-black uppercase text-white shadow-[1px_1px_0_#171411]"
          type="button"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="h-3 w-3" />
          New
        </button>
      </div>

      {/* Create group form */}
      {showCreate && (
        <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
          <input
            className="neo-copy mb-2 w-full border-2 border-black bg-[#fff9ed] px-3 py-2 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
            maxLength={64}
            placeholder="Group name..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
          />
          <p className="neo-copy mb-1 text-[9px] font-bold uppercase text-[#55504a]">
            Select members ({selectedMembers.length})
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto">
            {friendIds.map((id) => {
              const profile = profilesById[id];
              const label = profile?.displayName ?? profile?.username ?? null;
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center gap-2 border border-black bg-[#fff9ed] p-1.5"
                >
                  <input
                    checked={selectedMembers.includes(id)}
                    className="h-3 w-3"
                    type="checkbox"
                    onChange={(e) => {
                      setSelectedMembers((prev) =>
                        e.target.checked ? [...prev, id] : prev.filter((x) => x !== id),
                      );
                    }}
                  />
                  <span className="neo-copy truncate text-[10px] font-bold text-[#171411]">
                    {label ?? `Player ${id.slice(0, 8)}`}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            className="neo-copy mt-2 h-8 w-full border-2 border-black bg-[#087d6d] text-[10px] font-black uppercase text-white shadow-[1px_1px_0_#171411] disabled:opacity-50"
            disabled={loading || !newGroupName.trim() || selectedMembers.length === 0}
            type="button"
            onClick={() => void handleCreate()}
          >
            {loading ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : "Create Group"}
          </button>
        </div>
      )}

      {/* Group list items */}
      <div className="space-y-2">
        {groups.map(({ room }) => (
          <button
            key={room.id}
            className={`neo-copy flex w-full items-center gap-2 border-2 border-black p-2 text-left text-[10px] font-bold uppercase shadow-[1px_1px_0_#171411] transition ${
              selectedGroup?.id === room.id
                ? "bg-[#087d6d] text-white"
                : "bg-[#fff9ed] text-[#171411] hover:bg-[#efe6d4]"
            }`}
            type="button"
            onClick={() => setSelectedGroup(room)}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{room.name ?? "Unnamed Group"}</span>
          </button>
        ))}
      </div>

      {/* Chat area */}
      {selectedGroup && (
        <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
          <p className="neo-copy mb-2 text-[10px] font-black uppercase text-[#171411]">
            {selectedGroup.name ?? "Group Chat"}
          </p>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {messages.length > 0 ? (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`border-2 border-black p-2 text-sm leading-5 shadow-[1px_1px_0_#171411] ${
                    msg.senderId === currentUserId ? "bg-[#8cf5e4]" : "bg-[#fff9ed]"
                  }`}
                >
                  {msg.content}
                </div>
              ))
            ) : (
              <p className="neo-copy border-2 border-dashed border-black bg-[#fff9ed] p-3 text-[11px] font-bold uppercase text-[#655f58]">
                No messages yet.
              </p>
            )}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <input
              className="neo-copy min-w-0 flex-1 border-2 border-black bg-[#fff9ed] px-3 text-[11px] font-bold outline-none placeholder:text-[#655f58]"
              maxLength={2000}
              placeholder="Message..."
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
            />
            <button
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black bg-[#087d6d] text-white shadow-[1px_1px_0_#171411] disabled:opacity-50"
              disabled={!chatText.trim()}
              type="submit"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
