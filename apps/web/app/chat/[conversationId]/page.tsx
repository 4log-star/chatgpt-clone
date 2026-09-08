import ChatComposer from "@/components/chat/ChatComposer";
import ChatMessages from "@/components/chat/ChatMessages";

export default async function ConversationPage({
    params,
}: {
    params: Promise<{ conversationId: string }>;
}) {
    const { conversationId } = await params;

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-b px-6 py-3 text-sm text-zinc-500">
                Conversation: {conversationId}
            </div>

            <ChatMessages />

            <ChatComposer />
        </div>
    );
}