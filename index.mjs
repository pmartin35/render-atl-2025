import { GoogleGenerativeAI } from "@google/generative-ai";
import { systemPrompt } from "./prompt.mjs";
import { toolDefinitions, getGeminiTools } from "./tools.mjs";

let getIssueAsMarkdown;
try {
  const githubModule = await import("./github.mjs");
  getIssueAsMarkdown = githubModule.getIssueAsMarkdown;
} catch (error) {
  console.log("⚠️ GitHub module not available, using fallback task");
  getIssueAsMarkdown = async () => {
    return `Task: Create a nice simple landing page for FormAssembly in HTML (index.html) and Tailwind CSS.`;
  };
}

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY environment variable is required");
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const tools = getGeminiTools();

// Add timeout and max iterations for safety
const MAX_ITERATIONS = 50;
const TIMEOUT_MS = 300000; // 5 minutes
const RATE_LIMIT_DELAY = 2000; // 2 seconds between requests

// Helper function to add delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loop() {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    tools: [tools],
    systemInstruction: systemPrompt,
  });

  let chat = model.startChat({
    history: [],
  });

  let markdown;
  try {
    markdown = await getIssueAsMarkdown();
  } catch (error) {
    console.log(
      "⚠️ Failed to get issue from GitHub, using fallback:",
      error.message
    );
    markdown = `Task: Create a nice simple landing page for FormAssembly in HTML (index.html) and Tailwind CSS.`;
  }

  // Ensure markdown is not empty
  if (!markdown || markdown.trim().length === 0) {
    markdown =
      "Task: Create a simple HTML landing page with Tailwind CSS. Use the available tools to complete this task.";
  }

  console.log("markdown: " + markdown);

  let result;
  try {
    result = await chat.sendMessage(markdown);
  } catch (error) {
    if (error.message.includes("429")) {
      console.log("⏰ Rate limited. Waiting 60 seconds before retrying...");
      await delay(60000);
      result = await chat.sendMessage(markdown);
    } else {
      throw error;
    }
  }

  let iterations = 0;
  const startTime = Date.now();

  while (iterations < MAX_ITERATIONS) {
    // Check timeout
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.log("⏰ Timeout reached, stopping execution");
      break;
    }

    iterations++;
    console.log(`\n--- Iteration ${iterations} ---`);

    const response = result.response;

    // DEBUG: Let's see what we're actually getting
    console.log("DEBUG - Response has text:", !!response.text());
    console.log("DEBUG - Response text:", response.text());
    console.log(
      "DEBUG - Function calls:",
      response.functionCalls()?.length || 0
    );

    const functionCalls = response.functionCalls();

    // If no function calls, try to force tool usage
    if (!functionCalls || functionCalls.length === 0) {
      const responseText = response.text();
      console.log("AI Response (full):", responseText);

      // If this is the first iteration and we got no tools, force it
      if (iterations === 1) {
        console.log("⚠️ AI didn't use tools, forcing tool usage...");
        await delay(RATE_LIMIT_DELAY);

        // Create a new chat session instead of trying to force the current one
        const newChat = model.startChat({
          history: [],
        });

        const forceMessage = `You are a coding assistant that MUST use tools to complete tasks. 

Task: Create a nice simple landing page for FormAssembly in HTML (index.html) and Tailwind CSS.

IMPORTANT: You MUST start by using the "think" tool to plan your approach. Do not provide any text response - only use the available tools.

Available tools: think, list_files, read_file, write_file, update_file, delete_file, task_completed

Start now by using the "think" tool.`;

        try {
          result = await newChat.sendMessage(forceMessage);
          // Update chat reference for subsequent iterations
          chat = newChat;
        } catch (error) {
          if (error.message.includes("429")) {
            console.log("⏰ Rate limited. Waiting 60 seconds...");
            await delay(60000);
            result = await newChat.sendMessage(forceMessage);
            chat = newChat;
          } else {
            console.error("❌ Failed to force tool usage:", error.message);
            break;
          }
        }
        continue;
      }

      console.log("No more function calls, ending conversation");
      break;
    }

    // Process function calls one at a time for better control
    const functionResponses = [];

    for (const call of functionCalls) {
      console.log(`🔧 Calling tool: ${call.name}`);

      // Check for early termination
      if (call.name === "task_completed") {
        const tool = toolDefinitions.find((tool) => tool.name === call.name);
        if (tool) {
          await tool.handler(call.args);
        }
        console.log("Task marked as completed, ending execution");
        return;
      }

      const tool = toolDefinitions.find((tool) => tool.name === call.name);
      if (!tool) {
        console.error(`❌ Tool ${call.name} not found`);
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: {
              error: `Tool ${call.name} not found`,
              output: "Tool not available",
            },
          },
        });
        continue;
      }

      try {
        const toolResult = await tool.handler(call.args);
        // Ensure toolResult is not empty or null
        const output =
          toolResult && toolResult.trim().length > 0
            ? toolResult
            : "Operation completed successfully";
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: {
              output: output,
            },
          },
        });
      } catch (error) {
        console.error(`❌ Error executing tool ${call.name}:`, error.message);
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: {
              error: error.message,
              output: "Tool execution failed",
            },
          },
        });
      }
    }

    // Validate that we have function responses before sending
    if (functionResponses.length === 0) {
      console.log("⚠️ No function responses to send, ending conversation");
      break;
    }

    // Validate each function response has proper content
    for (const response of functionResponses) {
      if (
        !response.functionResponse?.response?.output ||
        response.functionResponse.response.output.trim().length === 0
      ) {
        response.functionResponse.response.output = "Success";
      }
    }

    console.log(
      "DEBUG - Sending function responses:",
      JSON.stringify(functionResponses, null, 2)
    );

    // Send all function responses back with rate limiting
    await delay(RATE_LIMIT_DELAY);
    try {
      result = await chat.sendMessage(functionResponses);
    } catch (error) {
      if (error.message.includes("429")) {
        console.log("⏰ Rate limited. Waiting 60 seconds...");
        await delay(60000);
        result = await chat.sendMessage(functionResponses);
      } else if (error.message.includes("contents.parts must not be empty")) {
        console.error(
          "❌ Empty content error. Function responses:",
          JSON.stringify(functionResponses, null, 2)
        );
        break;
      } else {
        console.error("❌ Error sending function responses:", error.message);
        break;
      }
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log("⚠️ Maximum iterations reached, stopping execution");
  }
}

// Enhanced error handling
loop()
  .then(() => console.log("✅ Done"))
  .catch((error) => {
    console.error("❌ Script failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  });
