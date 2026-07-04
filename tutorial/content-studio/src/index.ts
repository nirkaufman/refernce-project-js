import { HumanMessage } from "@langchain/core/messages";
import { supervisor } from "./agents/supervisor.js";

const topic = process.argv[2];
if (!topic) {
  console.error('Usage: npm start -- "your topic here"');
  process.exit(1);
}

console.log(`📰 Content Studio\n   Topic: ${topic}\n`);
console.time("Total time");

const result = await supervisor.invoke(
  { messages: [new HumanMessage(`Create a content package about: ${topic}`)] },
  { recursionLimit: 50 } // 5 sub-agent calls + reasoning turns need headroom
);

console.timeEnd("Total time");
console.log(`\n${result.messages.at(-1)?.content}`);
