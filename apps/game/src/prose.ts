/**
 * Styles for the page text in src/content/*.html, set from its container because those files
 * have hundreds of bare tags (<code>, <kbd>, <table>...).
 */
export const PROSE = [
  "[&_h1]:mb-1 [&_h1]:text-[1.75rem] [&_h1]:leading-tight [&_h1]:font-bold",
  "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold",
  "[&_h3]:mb-1 [&_h3]:font-bold",
  "[&>p:not([class])]:my-4",
  // Lines of about 65 characters are easier to read. Tables and code keep the full width.
  "[&>p]:max-w-prose [&>ul]:max-w-prose [&>ol]:max-w-prose",
  "[&_a]:text-accent [&_a]:underline",
  "[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-accent",
  "[&_kbd]:inline-block [&_kbd]:min-w-[1.8em] [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-b-2 [&_kbd]:border-line [&_kbd]:bg-surface [&_kbd]:px-1.5 [&_kbd]:text-center [&_kbd]:font-mono [&_kbd]:text-[0.85rem] [&_kbd]:text-fg",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface [&_pre]:p-4 [&_pre_code]:text-[0.85rem] [&_pre_code]:leading-normal [&_pre_code]:text-fg",
  "[&_table]:mt-3 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-[0.9rem]",
  "[&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td:nth-child(-n+2)]:whitespace-nowrap",
  "[&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted",
].join(" ");
