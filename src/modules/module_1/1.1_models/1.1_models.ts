import {createAgent, initChatModel} from "langchain";


const model = await initChatModel(
    'gpt-5-nano',
    {
      temperature: 1,
      maxTokens: 1000,
      timeout: 6000,
    }
)

export const models = createAgent({model})
