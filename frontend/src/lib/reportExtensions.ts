import { TableKit } from "@tiptap/extension-table";
import { StarterKit } from "@tiptap/starter-kit";

// Only what the exporter can represent: paragraphs, one heading level, bold/italic/code, lists, tables. One list for the form and the tests.
export const reportExtensions = [
  StarterKit.configure({ heading: { levels: [2] }, strike: false, blockquote: false, codeBlock: false, horizontalRule: false, link: false, underline: false }),
  TableKit,
];
