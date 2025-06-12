import OpenAI from "openai";
import { getIssueAsMarkdown } from "./github.mjs";
import { systemPrompt } from "./prompt.mjs";
import { toolDefinitions } from "./tools.mjs";
const openai = new OpenAI();

const tools = toolDefinitions.map((tool) => tool.definition);

async function loop() {
  const input = [
    { role: "system", content: systemPrompt },
    { role: "user", content: await getIssueAsMarkdown() },
  ];

  while (true) {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input,
      tools,
      tool_choice: "required",
    });

    for (const item of response.output) {
      input.push(item);
      if (item.type !== "function_call") continue;

      const args = JSON.parse(item.arguments);
      const tool = toolDefinitions.find(
        (tool) => tool.definition.name === item.name
      );
      if (!tool) throw new Error(`Tool ${item.name} not found`);

      const result = await tool.handler(args);
      input.push({
        type: "function_call_output",
        call_id: item.call_id,
        output: result,
      });

      if (item.name === "task_completed") return;
    }
  }
}

loop()
  .then(() => console.log("✅ Done"))
  .catch((error) => console.error(error));
