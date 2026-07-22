import chalk from "chalk";

/** Minimal terminal markdown renderer for assistant output */
export function renderMarkdown(raw: string): string {
  let out = raw;

  // Code blocks: ```lang\n...\n```
  out = out.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const langLabel = lang ? chalk.gray(`[${lang}] `) : "";
    const lines = code.split("\n");
    const rendered = lines.map((l: string) => "  " + chalk.white(l)).join("\n");
    return "\n" + langLabel + chalk.gray("┌─") + "\n" + rendered + "\n" + chalk.gray("└─");
  });

  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => chalk.cyan(code));

  // Bold: **text**
  out = out.replace(/\*\*(.+?)\*\*/g, (_m, text: string) => chalk.bold(text));

  // Italic: *text*
  out = out.replace(/\*(.+?)\*/g, (_m, text: string) => chalk.italic(text));

  // Headers
  out = out.replace(/^### (.+)$/gm, (_m, h: string) => chalk.bold.yellow("### " + h));
  out = out.replace(/^## (.+)$/gm, (_m, h: string) => chalk.bold.yellow("## " + h));
  out = out.replace(/^# (.+)$/gm, (_m, h: string) => chalk.bold.yellow("# " + h));

  // List items: - item or * item
  out = out.replace(/^[\s]*[-*] (.+)$/gm, (_m, item: string) => "  " + chalk.gray("•") + " " + item);

  return out;
}

export function truncJSON(obj: Record<string, unknown>, max = 120): string {
  let s: string;
  try {
    s = JSON.stringify(obj);
  } catch {
    s = String(obj);
  }
  if (s.length > max) s = s.slice(0, max) + "…";
  return s;
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "…";
}
