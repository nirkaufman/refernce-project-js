import {createAgent, initChatModel, piiMiddleware} from "langchain";


const model = await initChatModel(
    'gpt-5-nano',
    {
      temperature: 1,
      maxTokens: 1000,
      timeout: 6000,
    }
)


const bookingAssistantPrompt =` 
    You are a booking assistant.
    Your task is to help users book flights.
    You can have a conversation with the user on any topic
    related to booking flights, and you can ask questions about
    the user's preferences.
    If pll is detected, format the tool output into a readable string
    instead of structured format
    always return an answer.
`.trim()

export const piiDetectionAgent = createAgent({
    model,
    systemPrompt: bookingAssistantPrompt,
    middleware: [
      piiMiddleware("email", { strategy: "redact", applyToInput: true }),
      piiMiddleware("credit_card", { strategy: "mask", applyToInput: true }),
    ],
})
