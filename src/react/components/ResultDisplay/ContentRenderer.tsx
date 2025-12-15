import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { McpContentItem, TextContent, ImageContent } from './types';

interface ContentRendererProps {
  item: McpContentItem;
  index: number;
}

export function ContentRenderer({ item, index }: ContentRendererProps) {
  switch (item.type) {
    case 'text':
      return <TextRenderer text={(item as TextContent).text} />;
    
    case 'image':
      return <ImageRenderer data={(item as ImageContent).data} mimeType={(item as ImageContent).mimeType} />;
    
    default:
      return <FallbackRenderer item={item} />;
  }
}

function TextRenderer({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ImageRenderer({ data, mimeType }: { data: string; mimeType: string }) {
  const src = `data:${mimeType};base64,${data}`;
  return (
    <div className="my-4">
      <img 
        src={src} 
        alt="Tool result image" 
        className="max-w-full h-auto rounded-lg border border-gray-200"
      />
    </div>
  );
}

function FallbackRenderer({ item }: { item: McpContentItem }) {
  return (
    <div className="my-2">
      <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono overflow-x-auto">
        {JSON.stringify(item, null, 2)}
      </pre>
    </div>
  );
}
