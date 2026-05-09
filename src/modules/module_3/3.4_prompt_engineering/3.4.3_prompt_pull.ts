import * as hub from "langchain/hub";
import {createAgent, initChatModel} from "langchain";


// 1. Developer pulls the latest prompt version
// NOTE: Replace "sales-lead-extractor" with an actual prompt from your LangSmith workspace

const pulledPrompt = await hub.pull("sales-lead-extractor");


// 2. In a real app, this summary string comes directly from the 11labs webhook/API response
const mockConversationSummary = `
    Outbound call connected with Elena Rodriguez, VP of Engineering at CloudScale Inc. Elena mentioned they
    are actively looking for a new cloud infrastructure provider because their current solution is causing severe
    latency issues during peak hours, and their budget for Q3 is around $15k/month. I proposed a discovery
    meeting with our senior sales rep, David. Elena agreed to an in-person meeting next Tuesday, May 5th at 2:00 PM.
    She asked if David could bring a technical whitepaper on our failover protocols. The meeting will be at her office
     located at 890 Tech Boulevard, Building B, Seattle, WA. Call ended positively.
     `.trim()


// 3. Format the prompt with the variable
const formattedPrompt = await pulledPrompt.invoke({
    "call_summary": mockConversationSummary,
})

const model = await initChatModel('gpt-5-nano');

export const salesLeadAgent = createAgent({
  model,
  systemPrompt: formattedPrompt.messages[0].content,
})

