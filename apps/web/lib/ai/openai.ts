import 'server-only'
import OpenAI from "openai"

const apiKey = process.env.OPENAI_API_KEY;

if(!apiKey){
    throw new Error("OPENAI_API_KEY is not set")
}

export const openai = new OpenAI({
    baseURL : "http://localhost:11434/v1",
    apiKey : "ollama"
})