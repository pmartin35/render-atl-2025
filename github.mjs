import { Octokit } from "@octokit/action";

const octokit = new Octokit();

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const issue_number = parseInt(process.env.GITHUB_ISSUE_NUMBER);
if (!owner || !repo || !issue_number || isNaN(issue_number))
  throw new Error("Invalid environment variables");

export const getIssueAsMarkdown = async () => {
  const { data } = await octokit.rest.issues.get({ owner, repo, issue_number });
  return `${data.title}\n\n${data.body}`.trim();
};

export const addIssueComment = async (body) => {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number,
    body,
  });
};

export const closeIssue = async () => {
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number,
    state: "closed",
    state_reason: "completed",
  });
};
