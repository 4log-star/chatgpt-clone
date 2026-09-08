import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessages from "@/components/chat/ChatMessages";

export default function ChatPage() {
    return (
        <div className="flex flex-col flex-1 min-w-0">
            <ChatMessages />
            <ChatComposer />
        </div>
    );
}