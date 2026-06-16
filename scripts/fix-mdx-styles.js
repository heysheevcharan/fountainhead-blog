import fs from 'fs';
import path from 'path';

const blogDir = './src/content/blog';

if (fs.existsSync(blogDir)) {
  const files = fs.readdirSync(blogDir);
  for (const file of files) {
    if (file.endsWith('.mdx') || file.endsWith('.md')) {
      const filePath = path.join(blogDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      if (content.includes('{\\`') || content.includes('\\`}')) {
        console.log(`Fixing escaped backticks in ${file}...`);
        content = content.replace(/\{\\\`/g, '{`').replace(/\\\`\}/g, '`}');
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }
  }
}
