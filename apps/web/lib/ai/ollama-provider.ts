import "server-only"

import OpenAI from "openai"
import { AIProvider, ChatMessage } from "./provider"

const ollama = new OpenAI({
    baseURL : "http://localhost:11434/v1",
    apiKey : "ollama"
})

export class OllamaProvider implements AIProvider{
    async *streamResponse(messages : ChatMessage[], signal  ?: AbortSignal){
        const stream = await ollama.chat.completions.create({
            model : "gemma3:4b",
            messages : messages.map((message)=>(
                {
                    role : message.role,
                    content : message.content
                }
            )),
            stream : true
        },
        {
            signal
        }
        )

        for await(const chunk of stream){
            const text = chunk.choices[0].delta?.content
            if(text){
                yield text
            }
        }
      
    }
}