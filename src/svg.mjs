export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const quote = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Element as string. Children must be strings (escape text with esc).
export const el = (tag, attrs = {}, ...children) =>
  `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${quote(v)}"`).join('')}>${children.join('')}</${tag}>`;
