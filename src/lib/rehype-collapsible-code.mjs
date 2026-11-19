/**
 * Wraps long fenced code blocks in a native <details> so they start collapsed.
 * The summary shows a label (frontmatter `name:` if present, else the language)
 * plus a line count, and a copy button that works without expanding.
 * Short blocks (< minLines) are left untouched.
 */
const textOf = (node) =>
  node.type === 'text' ? node.value : (node.children || []).map(textOf).join('');

export default function rehypeCollapsibleCode({ minLines = 12 } = {}) {
  const visit = (parent) => {
    if (!Array.isArray(parent.children)) return;
    parent.children = parent.children.map((node) => {
      if (node.type !== 'element') return node;
      if (node.tagName !== 'pre') {
        visit(node);
        return node;
      }

      const code = textOf(node).replace(/\n$/, '');
      const lines = code.split('\n').length;
      if (lines < minLines) return node;

      const nameMatch = code.match(/^---\s*\n[\s\S]*?^name:\s*(.+)$/m);
      const lang = node.properties?.dataLanguage;
      const label =
        nameMatch?.[1].trim() ||
        (lang && lang !== 'plaintext' && lang !== 'plain' ? lang : 'code');

      return {
        type: 'element',
        tagName: 'details',
        properties: { className: ['code-collapse'] },
        children: [
          {
            type: 'element',
            tagName: 'summary',
            properties: {},
            children: [
              { type: 'element', tagName: 'span', properties: { className: ['code-collapse-chevron'], ariaHidden: 'true' }, children: [] },
              { type: 'element', tagName: 'span', properties: { className: ['code-collapse-label'] }, children: [{ type: 'text', value: label }] },
              { type: 'element', tagName: 'span', properties: { className: ['code-collapse-meta'] }, children: [{ type: 'text', value: `${lines} lines` }] },
              {
                type: 'element',
                tagName: 'button',
                properties: { type: 'button', className: ['code-copy'], dataCopy: '' },
                children: [{ type: 'text', value: 'Copy' }],
              },
            ],
          },
          node,
        ],
      };
    });
  };
  return (tree) => visit(tree);
}
