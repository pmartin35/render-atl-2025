/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - The function name
 * @property {string} description - The function description
 * @property {Object} parameters - The function parameters in JSON schema format
 * @property {(args: unknown) => Promise<string>} handler - The function that handles the tool call
 */

import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { addIssueComment, closeIssue } from "./github.mjs";

const log = async (message) => {
  await addIssueComment(message);
  console.log(message);
};

/** @type {ToolDefinition[]} */
export const toolDefinitions = [
  {
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
    },
    handler: async ({ thought_process }) => {
      await log(`💭 ${thought_process}`);
      return "";
    },
  },
  {
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
    },
    handler: async ({ comment }) => {
      await log(`✅ ${comment}`);
      await closeIssue();
      return "";
    },
  },
  {
    name: "list_files",
    description:
      "List all files in the repository. This will return a list of file paths relative to the root of the repository.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The path to the directory to list. This should be relative to the root of the repository.",
        },
      },
      required: ["path"],
    },
    handler: async ({ path }) => {
      await log(`👀 Listing files in: ${path}`);
      try {
        const files = await readdir(path);
        return files.join("\n");
      } catch (error) {
        await log(`❌ Error reading file: ${error.message}`);
        return "Failed to read file";
      }
    },
  },
  {
    name: "read_file",
    description:
      "Read a file from the repository. This will return the contents of the file as a string.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The path to the file to read. This should be relative to the root of the repository.",
        },
      },
      required: ["path"],
    },
    handler: async ({ path }) => {
      await log(`👀 Reading file: ${path}`);
      try {
        const contents = await readFile(path, "utf8");
        return contents;
      } catch (error) {
        await log(`❌ Error reading file: ${error.message}`);
        return "Failed to read file";
      }
    },
  },
  {
    name: "write_file",
    description:
      "Create a new file in the repository. This will create the file with the given contents. If the file already exists, it will be overwritten.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The path to the file to create. This should be relative to the root of the repository.",
        },
        contents: {
          type: "string",
          description: "The contents of the file to create.",
        },
      },
      required: ["path", "contents"],
    },
    handler: async ({ path, contents }) => {
      await log(`✏️ Writing file: ${path}`);
      try {
        await writeFile(path, contents);
        return "File created successfully";
      } catch (error) {
        await log(`❌ Error writing file: ${error.message}`);
        return "Failed to create file";
      }
    },
  },
  {
    name: "update_file",
    description: "Make a change to an existing file in the repository.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The path to the file to update. This should be relative to the root of the repository.",
        },
        old_string: {
          type: "string",
          description:
            "The string to replace. This should be an EXACT string already in the file.",
        },
        new_string: {
          type: "string",
          description: "The string to replace it with.",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
    handler: async ({ path, old_string, new_string }) => {
      await log(`🖊️ Updating file: ${path}`);
      try {
        const contents = await readFile(path, "utf8");
        const newContents = contents.replace(old_string, new_string);
        await writeFile(path, newContents);
        await log(`✅ Updated file: ${path}`);
        return "File updated successfully";
      } catch (error) {
        await log(`❌ Error updating file: ${error.message}`);
        return "Failed to update file";
      }
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the repository.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "The path to the file to delete. This should be relative to the root of the repository.",
        },
      },
      required: ["path"],
    },
    handler: async ({ path }) => {
      await log(`🗑️ Deleting file: ${path}`);
      try {
        await unlink(path);
        return "File deleted successfully";
      } catch (error) {
        await log(`❌ Error deleting file: ${error.message}`);
        return "Failed to delete file";
      }
    },
  },
];

// Fix this export to transform tools for Gemini API
export const getGeminiTools = () => ({
  functionDeclarations: toolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })),
});
