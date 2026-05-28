const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

// Change replyWithMarkdownV2 to replyWithMarkdown
code = code.replace(/replyWithMarkdownV2/g, 'replyWithMarkdown');

// Change parse_mode: 'MarkdownV2' to parse_mode: 'Markdown'
code = code.replace(/parse_mode:\s*['"]MarkdownV2['"]/g, "parse_mode: 'Markdown'");

// Remove escapes for legacy Markdown
code = code.replace(/\\\\\./g, '.');
code = code.replace(/\\\\-/g, '-');
code = code.replace(/\\\\!/g, '!');

fs.writeFileSync('index.js', code);
console.log('Fixed Markdown formatting in index.js');
