import React from 'react';
import { Download } from 'lucide-react';
import appCode from '../App.tsx?raw';

export function ReplitDownloader() {
  const handleDownload = (type: 'analyst' | 'rebecca') => {
    // Read raw file contents of all components
    const files = import.meta.glob('../components/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    
    const filterStr = type === 'analyst' ? 'Analyst' : 'Rebecca';
    
    let content = `# ${type === 'analyst' ? 'Cube' : 'Lascoux animation'} - Replit Export & Integration Guide\n\n`;
    
    // --- 1. Instructions for Claude Code (Crucial for Replit's Agent) ---
    content += `## Instructions for Claude Code / AI Agent\n\n`;
    content += `Hello Claude! The human user is tasking you with integrating the "H-Analytics" agent components into a React application on Replit.\n\n`;
    content += `**Your objectives:**\n`;
    content += `1. **Dependencies:** Install \`motion\` and \`lucide-react\` via npm if they are not already in \`package.json\`.\n`;
    content += `2. **Component Setup:** Extract the code blocks from the "Component Files" section below and save them as individual \`.tsx\` files in the project's \`src/components/\` directory.\n`;
    content += `3. **Wiring It Together:** Review the "Reference Integration (App.tsx)" section. It demonstrates exactly how to wire these components together, showing the state management for selecting an agent, and the side-by-side chat / visualization UI.\n`;
    content += `4. **Styling:** These files use Tailwind CSS classes and rely on a dark mode / stone color palette context. Ensure Tailwind is configured.\n\n`;
    
    // --- 2. App.tsx Wiring Example ---
    content += `## Reference Integration (App.tsx)\n\n`;
    content += `This file demonstrates how the agents are dynamically rendered and how the chat UI interacts with them.\n\n`;
    content += `\`\`\`tsx\n`;
    // Clean out the ReplitDownloader from the raw App.tsx string so it doesn't confuse Claude
    const cleanAppCode = appCode
      .replace(/import \{ ReplitDownloader \}.*\n/g, '')
      .replace(/<ReplitDownloader \/>\n/g, '');
    content += cleanAppCode.trim() + '\n';
    content += `\`\`\`\n\n`;
    
    // --- 3. Component Files ---
    content += `## Component Files\n\n`;
    Object.entries(files).forEach(([path, fileContent]) => {
      const fileName = path.split('/').pop() || '';
      if (fileName.includes(filterStr) && !fileName.includes('ReplitDownloader')) {
        content += `### File: \`src/components/${fileName}\`\n\n`;
        content += `\`\`\`tsx\n`;
        content += fileContent.trim() + '\n';
        content += `\`\`\`\n\n`;
      }
    });

    // Create a Blob and download it
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filterStr}-Components-With-Guide.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
      <div className="bg-stone-900 border border-stone-800 p-4 rounded-xl shadow-2xl space-y-3">
        <h3 className="text-stone-200 font-semibold text-sm">Export to Replit</h3>
        <button
          onClick={() => handleDownload('analyst')}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Cube Code + Guide
        </button>
        <button
          onClick={() => handleDownload('rebecca')}
          className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Lascoux Code + Guide
        </button>
      </div>
    </div>
  );
}
