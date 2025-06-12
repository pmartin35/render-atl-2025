/**
 * @typedef {Object} ToolDefinition
 * @property {NonNullable<Parameters<import('openai').OpenAI.Responses['create']>[0]['tools']>[0]} definition - The OpenAI tool definition
 * @property {(args: unknown) => Promise<string>} handler - The function that handles the tool call
 */

import { addIssueComment, closeIssue } from "./github.mjs";

const log = async (message) => {
  await addIssueComment(message);
  console.log(message);
};

/** @type {ToolDefinition[]} */
export const toolDefinitions = [
  {
    definition: {
      type: "function",
      name: "think",
      description:
        "Think step by step about the task at hand; this will be shared with the user. Use this to plan your next steps and reflect on the outcome of your previous steps.",
      parameters: {
        type: "object",
        properties: {
          thought_process: {
            type: "string",
            description:
              "Use this as a place for writing freeform text, it can be as long as you want.",
          },
        },
        required: ["thought_process"],
        additionalProperties: false,
      },
      strict: true,
    },
    /** @param {{ thought_process: string }} args */
    handler: async ({ thought_process }) => {
      await log(`💭 ${thought_process}`);
      return "";
    },
  },
  {
    definition: {
      type: "function",
      name: "task_completed",
      description:
        "Mark this task as completed. This will terminate your turn and yield back to the user. You should only use this when you are sure that the problem is fully resolved.",
      parameters: {
        type: "object",
        properties: {
          comment: {
            type: "string",
            description:
              "A comment to share with the user that summarizes the resolution.",
          },
        },
        required: ["comment"],
        additionalProperties: false,
      },
      strict: true,
    },
    /** @param {{ comment: string }} args */
    handler: async ({ comment }) => {
      await log(`✅ ${comment}`);
      await closeIssue();
      return "";
    },
  },
];
